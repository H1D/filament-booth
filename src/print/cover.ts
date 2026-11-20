/**
 * Which bead flats the neighbouring layers press against.
 *
 * A bead's ring has a flat top and a flat bottom (sweep.ts), and beads of consecutive layers
 * meet there: the top of layer n is the bottom of layer n + 1. Where the layer above prints over
 * a segment's whole top flat, no ray can reach that flat, and likewise for the bottom flat and
 * the layer below. The test reads every extrusion of the G-code, the infill and inner walls the
 * mesh leaves out included, because that material is what hides the flat in the real part.
 *
 * A test point counts as covered when it lies `MARGIN` inside a bead of the other layer, measured
 * exactly to the extrusion's centreline. The flat reaches `w / 2 - BULGE` from its own
 * centreline and the bead pressing on it `w / 2`, so beads stacked within about 0.035 mm of
 * each other hide each other's flats.
 */
import type { Centreline } from "../print";
import { BULGE } from "./calibration";
import { rint } from "./exposed";
import type { Run } from "./gcode";

/** cover bits per centreline point, for the segment from that point to the next. */
export const COVER_TOP = 1;
export const COVER_BOTTOM = 2;
/** The bead's right side (its ring's first half), left side, and, on a run's first or last point, its round end. */
export const COVER_RIGHT = 4;
export const COVER_LEFT = 8;
export const COVER_END = 16;

const MARGIN = 0.01; // mm inside the covering bead's edge
const STEP = 0.25; // mm between test points along a segment
const MITRE = 1.05; // a plain ring widens by up to this at the gentle bends it mitres
const BUCKET = 1; // mm, spatial hash cell
const GAP = 0.03; // mm past a bead's side or end where its neighbour must reach
const SELF = 0.15; // mm: extrusions this close to a segment's own centreline are the bead itself

/** Every extrusion segment of one layer, hashed by BUCKET cells: ax, ay, bx, by, half-width. */
interface Layer {
  readonly cells: Map<number, number[]>;
}

const key = (i: number, j: number) => i * 65536 + j;

function layerOf(runs: readonly Run[]): Layer {
  const cells = new Map<number, number[]>();
  for (const r of runs) {
    for (let k = 0; k + 1 < r.pts.length / 2; k++) {
      const ax = r.pts[2 * k], ay = r.pts[2 * k + 1], bx = r.pts[2 * k + 2], by = r.pts[2 * k + 3];
      const half = Math.min(r.w[k], r.w[k + 1]) / 2;
      const i0 = Math.floor((Math.min(ax, bx) - half) / BUCKET), i1 = Math.floor((Math.max(ax, bx) + half) / BUCKET);
      const j0 = Math.floor((Math.min(ay, by) - half) / BUCKET), j1 = Math.floor((Math.max(ay, by) + half) / BUCKET);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const c = key(i + 32768, j + 32768);
          const list = cells.get(c);
          if (list) list.push(ax, ay, bx, by, half);
          else cells.set(c, [ax, ay, bx, by, half]);
        }
      }
    }
  }
  return { cells };
}

/** Squared distance from (x, y) to the segment a-b. */
function dist2(x: number, y: number, ax: number, ay: number, dx: number, dy: number): number {
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  const ex = x - ax - t * dx, ey = y - ay - t * dy;
  return ex * ex + ey * ey;
}

/**
 * Is (x, y) at least MARGIN inside some extrusion of the layer? With `self` (ax, ay, bx, by of a
 * segment), extrusions passing within SELF of that segment's ends or middle do not count: they
 * are the bead being tested, which must not hide its own side round a bend.
 */
function inside(layer: Layer, x: number, y: number, self?: readonly number[]): boolean {
  const list = layer.cells.get(key(Math.floor(x / BUCKET) + 32768, Math.floor(y / BUCKET) + 32768));
  if (!list) return false;
  for (let o = 0; o < list.length; o += 5) {
    const ax = list[o], ay = list[o + 1], dx = list[o + 2] - ax, dy = list[o + 3] - ay, r = list[o + 4] - MARGIN;
    if (dist2(x, y, ax, ay, dx, dy) > r * r) continue;
    if (self) {
      const s2 = SELF * SELF;
      if (dist2(self[0], self[1], ax, ay, dx, dy) < s2 || dist2(self[2], self[3], ax, ay, dx, dy) < s2
        || dist2((self[0] + self[2]) / 2, (self[1] + self[3]) / 2, ax, ay, dx, dy) < s2) continue;
    }
    return true;
  }
  return false;
}

export function coverFlats(cl: Centreline, runs: readonly Run[], H: number): Uint8Array {
  const cover = new Uint8Array(cl.n);
  const byZ = new Map<number, Run[]>();
  for (const r of runs) {
    const zq = rint(r.z * 100);
    const list = byZ.get(zq);
    if (list) list.push(r);
    else byZ.set(zq, [r]);
  }
  const layers = new Map<number, Layer | null>();
  const layer = (zq: number): Layer | null => {
    if (layers.has(zq)) return layers.get(zq) ?? null;
    if (layers.size >= 4) layers.delete(layers.keys().next().value as number);
    const list = byZ.get(zq);
    const made = list ? layerOf(list) : null;
    layers.set(zq, made);
    return made;
  };
  const dz = rint(H * 100);
  const startOf = (i: number) => i === 0 || (cl.fl[i] & 1) === 1;
  const endOf = (i: number) => i === cl.n - 1 || (cl.fl[i + 1] & 1) === 1;
  for (let i = 0; i < cl.n; i++) {
    const zq = cl.zq[i];
    const same = layer(zq);
    const half = cl.wq[i] * 5e-3 / 2;
    if (!endOf(i)) {
      const ax = cl.p[2 * i] * 1e3, ay = cl.p[2 * i + 1] * 1e3, bx = cl.p[2 * i + 2] * 1e3, by = cl.p[2 * i + 3] * 1e3;
      const len = Math.hypot(bx - ax, by - ay);
      if (len > 0) {
        const ux = (bx - ax) / len, uy = (by - ay) / len;
        const hw = (Math.max(cl.wq[i], cl.wq[i + 1]) * 5e-3 / 2 - BULGE) * MITRE;
        const side = Math.max(cl.wq[i], cl.wq[i + 1]) * 5e-3 / 2 * MITRE + GAP;
        const steps = Math.max(1, Math.ceil(len / STEP));
        const along = (test: (x: number, y: number) => boolean): boolean => {
          for (let s = 0; s <= steps; s++) if (!test(ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps)) return false;
          return true;
        };
        const flat = (l: Layer | null) => l !== null && along((x, y) => inside(l, x, y) && inside(l, x - uy * hw, y + ux * hw) && inside(l, x + uy * hw, y - ux * hw));
        if (flat(layer(zq + dz))) cover[i] |= COVER_TOP;
        if (flat(layer(zq - dz))) cover[i] |= COVER_BOTTOM;
        if (same) {
          const self = [ax, ay, bx, by];
          if (along((x, y) => inside(same, x + uy * side, y - ux * side, self))) cover[i] |= COVER_RIGHT;
          if (along((x, y) => inside(same, x - uy * side, y + ux * side, self))) cover[i] |= COVER_LEFT;
        }
      }
    }
    // A round end is hidden when material lies ahead of it and to both sides of it.
    if (same && (startOf(i) || endOf(i)) && cl.n > 1) {
      const j = startOf(i) ? i + 1 : i - 1;
      if (j < 0 || j >= cl.n) continue;
      const ex = cl.p[2 * i] * 1e3, ey = cl.p[2 * i + 1] * 1e3;
      const ox = ex - cl.p[2 * j] * 1e3, oy = ey - cl.p[2 * j + 1] * 1e3, ol = Math.hypot(ox, oy);
      if (ol === 0) continue;
      const fx = ox / ol, fy = oy / ol, reach = half + GAP;
      let ahead = true;
      for (let a = -90; a <= 90 && ahead; a += 30) {
        const t = a * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t);
        ahead = inside(same, ex + (fx * c - fy * sn) * reach, ey + (fy * c + fx * sn) * reach);
      }
      if (ahead) cover[i] |= COVER_END;
    }
  }
  return cover;
}
