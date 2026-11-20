/**
 * Centreline to mesh: a 10-vertex stadium ring (lite: 6) at every point,
 * mitred on gentle bends, round at corners over 35 degrees and at line ends,
 * with the first layer squashed flat onto the plate. Output is the app frame:
 * Blender Z up, metres, bed at z = 0, XY centred on the bounding box.
 */
import { packBeadWord } from "../print";
import type { BeadMesh, Centreline } from "../print";
import { BULGE, CAP_STEPS, CORNER_COS, FAN_STEP, TOP_R } from "./calibration";
import { COVER_BOTTOM, COVER_END, COVER_LEFT, COVER_RIGHT, COVER_TOP } from "./cover";

const A = BULGE * 1e-3;

type Pair = readonly [number, number];

interface RingTables {
  n: number;
  SIDE: number[];
  VV: number[];
  SGN: number[];
  PN: Pair[]; // vertex normals of a plain ring, (lateral, up)
  PN1: Pair[]; // first layer
  VT: number[]; // top-surface profile heights
  NT: Pair[]; // top-surface normals
  cap: number;
  fan: number;
}

/**
 * Ring tables for a stadium H mm tall whose sides sample these angles (deg,
 * bottom to top). `cap`: rings round a line end. `fan`: radians per ring
 * round a corner.
 */
function ringTables(deg: number[], cap: number, fan: number, H: number): RingTables {
  const Hm = H * 1e-3;
  const TH = deg.map((d) => d * Math.PI / 180), n = 2 * TH.length;
  const SIDE = [...TH.map(Math.cos), ...TH.toReversed().map((t) => -Math.cos(t))];
  const VV = [...TH.map(Math.sin), ...TH.toReversed().map(Math.sin)];
  const SGN = SIDE.map((_, k) => (k < n / 2 ? 1 : -1));
  const profile = (f1: boolean, w = 0.42e-3): Pair[] => SIDE.map((sd, k): Pair => { // ring in its (lateral, up) plane, m
    if (f1 && (k === 0 || k === n - 1)) return [SGN[k] * w / 2 * 0.96, -Hm / 2];
    if (f1 && (k === 1 || k === n - 2)) return [SGN[k] * w / 2, -0.6 * Hm / 2];
    return [SGN[k] * (w / 2 - A) + sd * A, VV[k] * Hm / 2];
  });
  // vertex normals as Blender's smooth shading makes them for the Cycles stills: mean of the two
  // adjacent profile-face normals (first layer: the plate face is flat-shaded, it doesn't count)
  const smoothNormals = (f1: boolean): Pair[] => {
    const p = profile(f1), e = p.map(([l0, u0], k): Pair => { // outward normal of face k -> k+1
      const [l1, u1] = p[(k + 1) % n], d = Math.hypot(l1 - l0, u1 - u0);
      return f1 && k === n - 1 ? [0, 0] : [(u1 - u0) / d, -(l1 - l0) / d];
    });
    return e.map((_, k): Pair => {
      const x = e[(k + n - 1) % n][0] + e[k][0], y = e[(k + n - 1) % n][1] + e[k][1], d = Math.hypot(x, y);
      return [x / d, y / d];
    });
  };
  // top-surface lines, as gcode_mesh.PROF_VT / PROF_NT: nozzle-flattened upper edge (radius BULGE x TOP_R), ellipse normals (flat top)
  const TA = [...TH, ...TH.toReversed()];
  const VT = VV.map((v) => (v >= 0 ? 1 - TOP_R / (H / 2) * (1 - v) : v));
  const NT = TA.map((t, k): Pair => {
    const x = SGN[k] * (t >= 0 ? TOP_R : H / 2) * Math.cos(t), y = BULGE * Math.sin(t), d = Math.hypot(x, y);
    return [x / d, y / d];
  });
  return { n, SIDE, VV, SGN, PN: smoothNormals(false), PN1: smoothNormals(true), VT, NT, cap, fan };
}

// lite: the viewer's moving-only stand-in on GPUs that are slow on triangles: 6-vertex rings, coarser corners and ends
const TABLES = new Map<string, RingTables>();
function tables(lite: boolean, H: number): RingTables {
  const key = `${lite} ${H}`;
  let t = TABLES.get(key);
  if (!t) {
    t = lite ? ringTables([-90, 0, 90], 2, Math.PI / 3, H) : ringTables([-90, -45, 0, 45, 90], CAP_STEPS, FAN_STEP, H);
    TABLES.set(key, t);
  }
  return t;
}

const I16 = 32767; // 16 bit normals: 8-bit steps show as contour rings in gloss

/** Path directions and ring counts of every point: run ends and corners need more than one ring. */
export interface RingPlan {
  din: Float64Array;
  dout: Float64Array;
  len: Float64Array;
  nring: Uint16Array;
  rings: number;
  quadsMax: number;
}

const startOf = (cl: Centreline, i: number): boolean => i === 0 || (cl.fl[i] & 1) === 1;
const endOf = (cl: Centreline, i: number): boolean => i === cl.n - 1 || (cl.fl[i + 1] & 1) === 1;

export function planRings(cl: Centreline, lite = false): RingPlan {
  const { n: N, p: P } = cl, { cap: CAP, fan: FAN } = tables(lite, cl.h);
  const din = new Float64Array(2 * N), dout = new Float64Array(2 * N), len = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) {
    if (endOf(cl, i)) continue;
    const dx = P[2 * i + 2] - P[2 * i], dy = P[2 * i + 3] - P[2 * i + 1], l = Math.hypot(dx, dy);
    len[i] = l;
    dout[2 * i] = din[2 * i + 2] = dx / l;
    dout[2 * i + 1] = din[2 * i + 3] = dy / l;
  }
  // rings per point, as gcode_mesh.sweep: run ends and corners (> 35 deg) are swept round with a
  // fan of rings about the path point (molten plastic can't hold a sharp corner), inner side collapsed
  const nring = new Uint16Array(N);
  let rings = 0, quadsMax = 0;
  for (let i = 0; i < N; i++) {
    const s = startOf(cl, i), e = endOf(cl, i);
    if (s) { din[2 * i] = dout[2 * i]; din[2 * i + 1] = dout[2 * i + 1]; }
    if (e) { dout[2 * i] = din[2 * i]; dout[2 * i + 1] = din[2 * i + 1]; }
    const c = din[2 * i] * dout[2 * i] + din[2 * i + 1] * dout[2 * i + 1];
    const kf = !s && !e && c < CORNER_COS ? Math.max(1, Math.ceil(Math.acos(Math.max(-1, c)) / FAN - 0.01)) : 0; // margin: exact 90 deg corners
    nring[i] = s || e ? CAP + 2 : kf ? kf + 3 : 1;
    rings += nring[i];
    quadsMax += nring[i] - (s ? 1 : 0);
  }
  return { din, dout, len, nring, rings, quadsMax };
}

/**
 * Is quad k of a ring (k to k + 1) pressed against neighbouring material? Quads RN/2 - 1 and
 * RN - 1 are the top and bottom flats, the rest the right and left sides. A side goes only when
 * both flats go too: in a layer with open air above or below, the sides show in the grooves
 * between beads and, at grazing angles, past the edge of the layer.
 */
function hiddenQuad(k: number, RN: number, c: number): boolean {
  const half = RN / 2;
  if (k === half - 1) return (c & COVER_TOP) !== 0;
  if (k === RN - 1) return (c & COVER_BOTTOM) !== 0;
  const side = k < half - 1 ? COVER_RIGHT : COVER_LEFT;
  return (c & (side | COVER_TOP | COVER_BOTTOM)) === (side | COVER_TOP | COVER_BOTTOM);
}

export function sweep(cl: Centreline, lite = false): BeadMesh {
  const { n: N, p: P, zq: Zq, wq: Wq, fl: FL, vq: Vq, h: H } = cl;
  const { n: RN, SIDE, VV, SGN, PN, PN1, VT, NT, cap: CAP } = tables(lite, H), Hm = H * 1e-3, LQ = H * 100;
  const { din, dout, len, nring, rings, quadsMax } = planRings(cl, lite);
  const st = (i: number): boolean => startOf(cl, i), en = (i: number): boolean => endOf(cl, i);
  const pos = new Float32Array(rings * RN * 3), nrm = new Int16Array(rings * RN * 3), tan = new Int16Array(rings * RN * 3);
  const word = new Float32Array(rings * RN);
  const index = new Uint32Array(quadsMax * RN * 6);
  let r = 0, ti = 0, layerCount = 0;
  for (let i = 0; i < N; i++) {
    const s = st(i), e = en(i);
    const ix = din[2 * i], iy = din[2 * i + 1], ox = dout[2 * i], oy = dout[2 * i + 1];
    let tx = ix + ox, ty = iy + oy;
    const tl = Math.hypot(tx, ty);
    if (tl > 1e-6) { tx /= tl; ty /= tl; } else { tx = ox; ty = oy; } // 180 deg reversal
    const mi = 1 / Math.min(Math.max(tx * ox + ty * oy, 0.35), 1);
    // normals of a plain ring: length-weighted tangent. A wall is often one long straight move
    // meeting short arc chords; the plain bisector tilts the long quad's end normals and smooth
    // shading smears that tilt across the whole face (contour rings in gloss)
    const li = s ? len[i] : len[i - 1], lo = e ? li : len[i];
    let nx_ = ix * li + ox * lo, ny_ = iy * li + oy * lo;
    const nl_ = Math.hypot(nx_, ny_);
    if (nl_ > 1e-12) { nx_ /= nl_; ny_ /= nl_; } else { nx_ = tx; ny_ = ty; }
    const px = P[2 * i], py = P[2 * i + 1], z = Zq[i] * 1e-5, w = Wq[i] * 5e-6, f1 = z <= Hm + 1e-9, top = !f1 && (FL[i] >> 1) === 1;
    const layer = Math.round(Zq[i] / LQ);
    layerCount = Math.max(layerCount, layer);
    const wordHere = packBeadWord(FL[i] >> 1, layer, Vq[i]);
    let first = true; // the first ring of a run connects to nothing
    // ring with lateral direction (rx, ry) for positions, (lx, ly) for normals; col: 1/2 = right/left side collapsed
    const ring = (rx: number, ry: number, sc: number, col: 0 | 1 | 2, lx = rx, ly = ry): void => {
      for (let k = 0; k < RN; k++) {
        let lat = (SGN[k] * (w / 2 - A) + SIDE[k] * A) * sc, v = (top ? VT : VV)[k];
        const [nl, nv] = (f1 ? PN1 : top ? NT : PN)[k];
        if (f1 && (k === 0 || k === RN - 1)) { lat = SGN[k] * w / 2 * 0.96 * sc; v = -1; }
        if (f1 && (k === 1 || k === RN - 2)) { lat = SGN[k] * w / 2 * sc; v = -0.6; }
        if ((col === 1 && k < RN / 2) || (col === 2 && k >= RN / 2)) lat = 0;
        const o = (r * RN + k) * 3;
        pos[o] = px + rx * lat; pos[o + 1] = py + ry * lat; pos[o + 2] = z - Hm / 2 + v * Hm / 2;
        nrm[o] = Math.round(lx * nl * I16); nrm[o + 1] = Math.round(ly * nl * I16); nrm[o + 2] = Math.round(nv * I16);
        tan[o] = Math.round(-ry * I16); tan[o + 1] = Math.round(rx * I16); // path direction: the lateral turned a quarter
        word[r * RN + k] = wordHere;
      }
      if (r > 0 && !(s && first)) { // quads to the previous ring of this run, minus collapsed / zero-length ones
        // The first ring of a point joins the segment from the previous point. Its flats are left
        // out where the next layer up or down presses on them (cover.ts); caps and fans keep theirs.
        const covered = first && cl.cover ? cl.cover[i - 1] : 0;
        // Rings after the first at a run's end point sweep its round end.
        // Like a side, only on a bead with material above and below: in an open layer the end shows in its groove.
        const joined = cl.cover ? cl.cover[s ? i : i - 1] : 0;
        const endHidden = !first && (s || e) && cl.cover !== undefined && (cl.cover[i] & COVER_END) !== 0
          && (joined & (COVER_TOP | COVER_BOTTOM)) === (COVER_TOP | COVER_BOTTOM);
        if (endHidden) { first = false; r++; return; }
        for (let k = 0; k < RN; k++) {
          if (covered && hiddenQuad(k, RN, covered)) continue;
          const kn = (k + 1) % RN, q = [(r - 1) * RN + k, r * RN + k, r * RN + kn, (r - 1) * RN + kn];
          const tris: (readonly [number, number, number])[] = [[q[0], q[1], q[2]], [q[0], q[2], q[3]]];
          for (const [a_, b_, c_] of tris) {
            const ux = pos[3 * b_] - pos[3 * a_], uy = pos[3 * b_ + 1] - pos[3 * a_ + 1], uz = pos[3 * b_ + 2] - pos[3 * a_ + 2];
            const vx = pos[3 * c_] - pos[3 * a_], vy = pos[3 * c_ + 1] - pos[3 * a_ + 1], vz = pos[3 * c_ + 2] - pos[3 * a_ + 2];
            if ((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 < 1e-30) continue;
            index[ti++] = a_; index[ti++] = b_; index[ti++] = c_;
          }
        }
      }
      first = false;
      r++;
    };
    const rot = (x: number, y: number, a: number): Pair => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    if (s) { // round start: swing round the back, then the full ring
      for (let j = 0; j <= CAP; j++) ring(...rot(oy, -ox, -Math.PI + Math.PI * j / CAP), 1, 2);
      ring(oy, -ox, 1, 0);
    } else if (e) { // full ring, then swing round the front
      ring(iy, -ix, 1, 0);
      for (let j = 0; j <= CAP; j++) ring(...rot(iy, -ix, Math.PI * j / CAP), 1, 2);
    } else if (nring[i] > 1) { // corner: incoming ring, fan, outgoing ring, all at the corner point
      const turn = ix * oy - iy * ox >= 0 ? 1 : -1, th = Math.acos(Math.max(-1, ix * ox + iy * oy)), kf = nring[i] - 3;
      ring(iy, -ix, 1, 0);
      for (let j = 0; j <= kf; j++) ring(...rot(iy, -ix, turn * th * j / kf), 1, turn > 0 ? 2 : 1);
      ring(oy, -ox, 1, 0);
    } else ring(ty, -tx, mi, 0, ny_, -nx_);
  }
  // centre XY on the bounding box, like gcode_mesh.build (a prebuilt .bin is already centred, shift ~0)
  let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity, lz = Infinity, hz = -Infinity;
  for (let o = 0; o < pos.length; o += 3) {
    lx = Math.min(lx, pos[o]); hx = Math.max(hx, pos[o]);
    ly = Math.min(ly, pos[o + 1]); hy = Math.max(hy, pos[o + 1]);
    lz = Math.min(lz, pos[o + 2]); hz = Math.max(hz, pos[o + 2]);
  }
  const cx = (lx + hx) / 2, cy = (ly + hy) / 2;
  for (let o = 0; o < pos.length; o += 3) { pos[o] -= cx; pos[o + 1] -= cy; }
  const walls: number[] = []; // typical bead speed of the walls: the speed gloss is relative to it
  for (let i = 0; i < N; i++) if ((FL[i] >> 1) === 0) walls.push(Vq[i]);
  walls.sort((a, b) => a - b);
  return {
    position: pos, normal: nrm, tangent: tan, word, index: index.slice(0, ti), tris: ti / 3,
    layerCount, layerHeightM: Hm, vRefMmS: 2 * (walls[walls.length >> 1] || 50),
    bboxM: { min: [lx - cx, ly - cy, lz], max: [hx - cx, hy - cy, hz] },
  };
}
