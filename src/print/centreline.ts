/**
 * Runs to a per-point centreline in the .bin layout, the lite thinning of it,
 * and the .bin reader for the bundled sample parts.
 */
import { mm } from "../document";
import type { FeatureCode } from "../document";
import type { Centreline } from "../print";
import { FEAT_CODE, H0, JITTER, MIN_STEP, WIDTH_RANGE } from "./calibration";
import { rint } from "./exposed";
import type { Run } from "./gcode";

export const featureCode = (feat: string | null): FeatureCode => (feat === null ? 0 : FEAT_CODE.get(feat) ?? 0);

/** Seeded, so one print always gets the same wobble. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function gauss(rand: () => number): number { // Box-Muller
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** The wobble of each layer counter, drawn in the order the layers first appear in `runs`. */
function layerJitter(runs: readonly Run[], jitter: number = JITTER): Map<number, [number, number]> {
  const rand = seeded(1);
  const jit = new Map<number, [number, number]>();
  for (const r of runs) if (!jit.has(r.layer)) jit.set(r.layer, [gauss(rand) * jitter, gauss(rand) * jitter]);
  return jit;
}

/**
 * Per-layer jitter, first-layer line ends extended W/4 (they squash into the
 * wall they end at), W clipped to the calibrated range. `jitter` is the wobble
 * sigma in mm; 0 gives a perfect printer, which the parity test relies on.
 */
export function centreline(runs: Run[], H: number = H0, jitter: number = JITTER): Centreline {
  const jit = layerJitter(runs, jitter);
  const P: number[] = [], Z: number[] = [], W: number[] = [], FL: number[] = [], V: number[] = [];
  for (const r of runs) {
    const [jx, jy] = jit.get(r.layer) ?? [0, 0];
    const px: number[] = [], py: number[] = [], pw: number[] = [], pv: number[] = [];
    for (let k = 0; k < r.pts.length / 2; k++) { // drop duplicate / sub-2-um steps, as gcode_mesh.py
      if (k && Math.hypot(r.pts[2 * k] - r.pts[2 * k - 2], r.pts[2 * k + 1] - r.pts[2 * k - 1]) <= MIN_STEP) continue;
      px.push(r.pts[2 * k]); py.push(r.pts[2 * k + 1]); pw.push(r.w[k]); pv.push(r.v[k]);
    }
    if (px.length < 2) continue;
    const dir = (k: number): [number, number] => {
      const dx = px[k + 1] - px[k], dy = py[k + 1] - py[k], l = Math.hypot(dx, dy);
      return [dx / l, dy / l];
    };
    const fc = featureCode(r.feat), f1 = r.z <= H + 1e-6, s1 = px.length - 1;
    const [ax, ay] = dir(0), [bx, by] = dir(s1 - 1);
    for (let k = 0; k <= s1; k++) {
      const w = Math.min(Math.max(pw[k], WIDTH_RANGE[0]), WIDTH_RANGE[1]);
      let x = px[k] + jx, y = py[k] + jy;
      if (f1 && k === 0) { x -= ax * w / 4; y -= ay * w / 4; }
      if (f1 && k === s1) { x += bx * w / 4; y += by * w / 4; }
      P.push(x * 1e-3, y * 1e-3); Z.push(rint(r.z * 100)); W.push(rint(w * 200));
      FL.push((k === 0 ? 1 : 0) | (fc << 1)); V.push(Math.min(Math.max(rint(pv[k] / 2), 0), 255));
    }
  }
  return {
    n: Z.length, p: Float32Array.from(P), zq: Uint16Array.from(Z), wq: Uint8Array.from(W),
    fl: Uint8Array.from(FL), vq: Uint8Array.from(V), h: mm(H),
  };
}

export interface BinPrint {
  centreline: Centreline;
  /** Indexed by Z / H, entry 0 unused. */
  layerTime: Float32Array;
  layerFan: Float32Array;
}

/** Layout: gcode_mesh.write_web. The format does not record a layer height. */
export function fromBin(buf: ArrayBuffer): BinPrint {
  const N = buf.byteLength >= 4 ? new Uint32Array(buf, 0, 1)[0] : -1, o = 4 + 13 * N + (-(4 + 13 * N) & 3);
  const L = N > 0 && buf.byteLength >= o + 4 ? new Uint32Array(buf, o, 1)[0] : -1;
  if (N < 1 || L < 1 || buf.byteLength !== o + 4 + 5 * L) throw new Error("not a bead centreline .bin (missing, truncated or old format: rerun gcode_mesh.py)");
  return {
    centreline: {
      n: N, p: new Float32Array(buf, 4, 2 * N), zq: new Uint16Array(buf, 4 + 8 * N, N),
      wq: new Uint8Array(buf, 4 + 10 * N, N), fl: new Uint8Array(buf, 4 + 11 * N, N), vq: new Uint8Array(buf, 4 + 12 * N, N), h: mm(H0),
    },
    layerTime: new Float32Array(buf, o + 4, L),
    layerFan: Float32Array.from(new Uint8Array(buf, o + 4 + 4 * L, L), (f) => f / 255),
  };
}

/**
 * Lite mesh input: drops the points (mostly fine arc steps) where the path
 * bends under 15 degrees, strays under 20 um from the chord and the width
 * changes by at most 20 um. Keeps every run end, so about half the points stay.
 */
export function thin(cl: Centreline): Centreline {
  const { n, p, wq, fl } = cl, idx: number[] = [];
  for (let i = 0, turn = 0, len = 0, last = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && !(fl[i] & 1) && !(fl[i + 1] & 1)) {
      const ax = p[2 * i] - p[2 * i - 2], ay = p[2 * i + 1] - p[2 * i - 1], bx = p[2 * i + 2] - p[2 * i], by = p[2 * i + 3] - p[2 * i + 1];
      len += Math.hypot(ax, ay);
      turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      if (turn < 15 * Math.PI / 180 && turn * (len + Math.hypot(bx, by)) / 8 < 20e-6 && Math.abs(wq[i] - wq[last]) <= 4) continue;
    }
    idx.push(i); turn = len = 0; last = i;
  }
  return {
    n: idx.length,
    p: Float32Array.from({ length: 2 * idx.length }, (_, k) => p[2 * idx[k >> 1] + (k & 1)]),
    zq: Uint16Array.from(idx, (i) => cl.zq[i]), wq: Uint8Array.from(idx, (i) => wq[i]),
    fl: Uint8Array.from(idx, (i) => fl[i]), vq: Uint8Array.from(idx, (i) => cl.vq[i]), h: cl.h,
  };
}
