/**
 * Which faces of a bead the neighbouring material presses on, so the sweep can leave them out.
 *
 * A bead is a closed tube of ring quads (sweep.ts): a top and a bottom flat, two sides, and
 * round ends. Beads of consecutive layers meet flat on flat, and beads of one layer touch side
 * by side. Where printed material lies against a face, no ray can reach it. The test runs
 * against every extrusion of the printed part (infill and inner walls the mesh leaves out
 * included, support, brim and purge lines not).
 *
 * The test runs on the G-code's own positions, without the per-layer wobble the centreline adds
 * (layerJitter). A flat pressed on by a layer that leans a few micrometres keeps its face, but the
 * simulated wobble, about 4 um a layer, is not held against it: the slits it opens are a few
 * micrometres wide inside a groove that is dark anyway (under 0.5 % of grazing rays reach them).
 *
 * Coverage is exact along each test line: every nearby extrusion is a capsule (its centreline
 * grown by a radius), and a line counts as covered only when the union of the capsules' spans
 * on it is the whole line. A flat must lie on the flat of the bead pressing on it (to within
 * FLAT_TOL), a side or an end inside a neighbour by MARGIN, so no air gap is ever bridged.
 * Sides and ends are tested only on beads whose flats are both covered: in a layer open to the
 * air they show in the grooves between beads.
 */
import type { Centreline } from "../print";
import { BULGE, CORNER_COS, PART, WIDTH_RANGE } from "./calibration";
import { rint } from "./exposed";
import type { Run } from "./gcode";

/** Cover bits per centreline point. The first four are for the segment from that point to the next. */
export const COVER_TOP = 1;
export const COVER_BOTTOM = 2;
/** The bead's right side (its ring's first half) and left side. Set only with both flats covered. */
export const COVER_RIGHT = 4;
export const COVER_LEFT = 8;
/** On a run's first or last point: its round end. Set only with the joined segment's flats covered. */
export const COVER_END = 16;

const MARGIN = 0.01; // mm a side or end must sit inside its neighbour
const FLAT_TOL = 0.005; // mm a flat's edge may reach past the flat pressing on it
const BUCKET = 0.5; // mm, spatial hash cell
const SELF = 0.15; // mm: extrusions this close to a segment's own centreline are the bead itself

/** The BUCKET grid every layer is hashed on: its corner (mm) and size in cells. */
interface Grid {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
}

/** One layer's extrusions as capsules, hashed on the grid. */
interface Layer {
  /** Per segment: ax, ay, dx, dy, half-width (mm). */
  readonly seg: Float64Array;
  /** Segments of cell c are items[start[c] .. start[c + 1]]. */
  readonly start: Int32Array;
  readonly items: Int32Array;
  /** Query stamp per segment, so a capsule found in several cells counts once. */
  readonly seen: Int32Array;
}

function layerOf(runs: readonly Run[], g: Grid): Layer {
  const seg: number[] = [];
  for (const r of runs) {
    for (let k = 0; k + 1 < r.pts.length / 2; k++) {
      const ax = r.pts[2 * k], ay = r.pts[2 * k + 1];
      const w = Math.min(Math.max(Math.min(r.w[k], r.w[k + 1]), WIDTH_RANGE[0]), WIDTH_RANGE[1]);
      seg.push(ax, ay, r.pts[2 * k + 2] - ax, r.pts[2 * k + 3] - ay, w / 2);
    }
  }
  const n = seg.length / 5;
  // Each segment's cell range, clipped to the grid, then counting sort into the cells.
  const range = new Int32Array(4 * n);
  const start = new Int32Array(g.nx * g.ny + 1);
  const cell = (v: number, o: number, m: number) => Math.min(m - 1, Math.max(0, Math.floor((v - o) / BUCKET)));
  for (let s = 0; s < n; s++) {
    const o = 5 * s, ax = seg[o], ay = seg[o + 1], bx = ax + seg[o + 2], by = ay + seg[o + 3], h = seg[o + 4];
    const i0 = cell(Math.min(ax, bx) - h, g.x, g.nx), i1 = cell(Math.max(ax, bx) + h, g.x, g.nx);
    const j0 = cell(Math.min(ay, by) - h, g.y, g.ny), j1 = cell(Math.max(ay, by) + h, g.y, g.ny);
    range.set([i0, i1, j0, j1], 4 * s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) start[i * g.ny + j + 1]++;
  }
  for (let c = 0; c < g.nx * g.ny; c++) start[c + 1] += start[c];
  const items = new Int32Array(start[g.nx * g.ny]);
  const fill = start.slice(0, g.nx * g.ny);
  for (let s = 0; s < n; s++) {
    for (let i = range[4 * s]; i <= range[4 * s + 1]; i++) {
      for (let j = range[4 * s + 2]; j <= range[4 * s + 3]; j++) items[fill[i * g.ny + j]++] = s;
    }
  }
  return { seg: Float64Array.from(seg), start, items, seen: new Int32Array(n) };
}

let stamp = 0;
const spans: number[] = [];
const tmp = [0, 0];

/** Squared distance from (x, y) to the segment from (ax, ay) along (dx, dy). */
function dist2(x: number, y: number, ax: number, ay: number, dx: number, dy: number): number {
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  const ex = x - ax - t * dx, ey = y - ay - t * dy;
  return ex * ex + ey * ey;
}

/** [t0, t1] of P0 + t D, t in [0, 1], inside the disc (cx, cy, r), or null. */
function discSpan(px: number, py: number, Dx: number, Dy: number, cx: number, cy: number, r: number, out: number[]): boolean {
  const fx = px - cx, fy = py - cy, a = Dx * Dx + Dy * Dy, c = fx * fx + fy * fy - r * r;
  if (a === 0) {
    if (c > 0) return false;
    out[0] = 0; out[1] = 1;
    return true;
  }
  const b = 2 * (fx * Dx + fy * Dy), disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const q = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - q) / (2 * a)), t1 = Math.min(1, (-b + q) / (2 * a));
  if (t0 > t1) return false;
  out[0] = t0; out[1] = t1;
  return true;
}

/** The part of P0 + t D, t in [0, 1], inside the strip of the segment A + s (dx, dy), s in [0, 1], grown by r. */
function stripSpan(px: number, py: number, Dx: number, Dy: number, ax: number, ay: number, dx: number, dy: number, r: number, out: number[]): boolean {
  const L = Math.hypot(dx, dy);
  if (L === 0) return false;
  const ux = dx / L, uy = dy / L, ox = px - ax, oy = py - ay;
  let t0 = 0, t1 = 1;
  // Liang-Barsky: along the segment in [0, L], across it in [-r, r].
  for (let k = 0; k < 2; k++) {
    const p0 = k === 0 ? ox * ux + oy * uy : oy * ux - ox * uy;
    const pd = k === 0 ? Dx * ux + Dy * uy : Dy * ux - Dx * uy;
    const lo = k === 0 ? 0 : -r, hi = k === 0 ? L : r;
    if (pd === 0) {
      if (p0 < lo || p0 > hi) return false;
      continue;
    }
    const a = (lo - p0) / pd, b = (hi - p0) / pd;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return false;
  }
  out[0] = t0; out[1] = t1;
  return true;
}

/**
 * Does the union of the layer's capsules (each extrusion's half-width minus `shrink`) contain
 * the whole segment (x0, y0)-(x1, y1)? With `self`, extrusions passing within SELF of that
 * segment's ends or middle do not count: they are the bead under test.
 */
function covered(layer: Layer, g: Grid, x0: number, y0: number, x1: number, y1: number, shrink: number, self: Float64Array | null): boolean {
  const { seg, start, items, seen } = layer;
  const q = ++stamp;
  const Dx = x1 - x0, Dy = y1 - y0;
  spans.length = 0;
  const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
  const i0 = Math.max(0, Math.floor((lx - g.x) / BUCKET)), i1 = Math.min(g.nx - 1, Math.floor((hx - g.x) / BUCKET));
  const j0 = Math.max(0, Math.floor((ly - g.y) / BUCKET)), j1 = Math.min(g.ny - 1, Math.floor((hy - g.y) / BUCKET));
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const c = i * g.ny + j;
      for (let k = start[c]; k < start[c + 1]; k++) {
        const s = items[k];
        if (seen[s] === q) continue;
        seen[s] = q;
        const o = 5 * s, ax = seg[o], ay = seg[o + 1], dx = seg[o + 2], dy = seg[o + 3], r = seg[o + 4] - shrink;
        if (r <= 0) continue;
        // Boxes apart: the capsule cannot reach the line.
        if (Math.min(ax, ax + dx) - r > hx || Math.max(ax, ax + dx) + r < lx || Math.min(ay, ay + dy) - r > hy || Math.max(ay, ay + dy) + r < ly) continue;
        if (self) {
          const s2 = SELF * SELF;
          if (dist2(self[0], self[1], ax, ay, dx, dy) < s2 || dist2(self[2], self[3], ax, ay, dx, dy) < s2
            || dist2((self[0] + self[2]) / 2, (self[1] + self[3]) / 2, ax, ay, dx, dy) < s2) continue;
        }
        // A capsule is convex, so its span on the line is the hull of the spans of its two discs and its strip.
        let lo = Infinity, hi = -Infinity;
        if (discSpan(x0, y0, Dx, Dy, ax, ay, r, tmp)) { lo = Math.min(lo, tmp[0]); hi = Math.max(hi, tmp[1]); }
        if (discSpan(x0, y0, Dx, Dy, ax + dx, ay + dy, r, tmp)) { lo = Math.min(lo, tmp[0]); hi = Math.max(hi, tmp[1]); }
        if (stripSpan(x0, y0, Dx, Dy, ax, ay, dx, dy, r, tmp)) { lo = Math.min(lo, tmp[0]); hi = Math.max(hi, tmp[1]); }
        if (lo > hi) continue;
        if (lo <= 0 && hi >= 1) return true;
        spans.push(lo, hi);
      }
    }
  }
  if (spans.length === 0) return false;
  const order = Array.from({ length: spans.length / 2 }, (_, k) => k).sort((a, b) => spans[2 * a] - spans[2 * b]);
  let reach = 0;
  for (const k of order) {
    if (spans[2 * k] > reach) return false;
    reach = Math.max(reach, spans[2 * k + 1]);
    if (reach >= 1) return true;
  }
  return false;
}

/** The line at lateral offset ha .. hb from the segment a-b (right is +), reaching past each end by its mitre. */
function lineCovered(l: Layer, g: Grid, ax: number, ay: number, bx: number, by: number, ux: number, uy: number, ma: number, mb: number,
  ha: number, hb: number, shrink: number, self: Float64Array | null): boolean {
  const ea = Math.abs(ha) * ma, eb = Math.abs(hb) * mb;
  return covered(l, g, ax + uy * ha - ux * ea, ay - ux * ha - uy * ea, bx + uy * hb + ux * eb, by - ux * hb + uy * eb, shrink, self);
}

/** A round end at (ex, ey) facing (fx, fy): its surface against its own layer, its flats against the layers above and below. */
function endCovered(g: Grid, same: Layer, above: Layer, below: Layer, ex: number, ey: number, fx: number, fy: number, h: number): boolean {
  const f = h - BULGE, flat = BULGE - FLAT_TOL;
  for (let a = -90; a <= 90; a += 15) {
    const t = a * Math.PI / 180, cx = fx * Math.cos(t) - fy * Math.sin(t), cy = fy * Math.cos(t) + fx * Math.sin(t);
    const sx = ex + cx * h, sy = ey + cy * h, gx = ex + cx * f, gy = ey + cy * f;
    if (!covered(same, g, sx, sy, sx, sy, MARGIN, null) || !covered(above, g, gx, gy, gx, gy, flat, null) || !covered(below, g, gx, gy, gx, gy, flat, null)) return false;
  }
  return true;
}

/**
 * Cover bits for every centreline point. `runs` are all the G-code's extrusions; `jit` the
 * per-layer wobble the centreline was built with (layerJitter in centreline.ts), taken back out
 * of its points.
 */
export function coverFaces(cl: Centreline, runs: readonly Run[], H: number, jit: ReadonlyMap<number, readonly [number, number]>): Uint8Array {
  const cover = new Uint8Array(cl.n);
  const byZ = new Map<number, Run[]>();
  for (const r of runs) {
    if (r.feat === null || !PART.has(r.feat)) continue;
    const zq = rint(r.z * 100);
    const list = byZ.get(zq);
    if (list) list.push(r);
    else byZ.set(zq, [r]);
  }
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const list of byZ.values()) {
    for (const r of list) {
      for (let k = 0; k < r.pts.length; k += 2) {
        gx0 = Math.min(gx0, r.pts[k]); gx1 = Math.max(gx1, r.pts[k]);
        gy0 = Math.min(gy0, r.pts[k + 1]); gy1 = Math.max(gy1, r.pts[k + 1]);
      }
    }
  }
  if (gx0 > gx1) return cover;
  // Two cells of margin hold the widest bead; the grid's edge cells take anything past it.
  const grid: Grid = { x: gx0 - 2 * BUCKET, y: gy0 - 2 * BUCKET, nx: Math.ceil((gx1 - gx0) / BUCKET) + 5, ny: Math.ceil((gy1 - gy0) / BUCKET) + 5 };
  /** The layer whose height is `zq` give or take 0.006 mm, so a fractional H * 100 still finds it. */
  const nearest = (zq: number): number | null => {
    const r = Math.round(zq);
    if (byZ.has(r) && Math.abs(r - zq) <= 0.6) return r;
    const o = r < zq ? r + 1 : r - 1;
    return byZ.has(o) && Math.abs(o - zq) <= 0.6 ? o : null;
  };
  const built = new Map<number, Layer>();
  const layer = (zq: number | null): Layer | null => {
    if (zq === null) return null;
    let l = built.get(zq);
    if (!l) {
      const list = byZ.get(zq);
      if (!list) return null;
      if (built.size >= 4) built.delete(built.keys().next().value as number);
      l = layerOf(list, grid);
      built.set(zq, l);
    }
    return l;
  };
  const { fl, wq } = cl;
  // The centreline's points without their layer's wobble, in mm.
  const wobble = new Map<number, readonly [number, number]>();
  for (const r of runs) {
    const j = jit.get(r.layer);
    if (j) wobble.set(rint(r.z * 100), j);
  }
  const p = new Float64Array(2 * cl.n);
  for (let i = 0; i < cl.n; i++) {
    const [jx, jy] = wobble.get(cl.zq[i]) ?? [0, 0];
    p[2 * i] = cl.p[2 * i] * 1e3 - jx;
    p[2 * i + 1] = cl.p[2 * i + 1] * 1e3 - jy;
  }
  const startOf = (i: number) => i === 0 || (fl[i] & 1) === 1;
  const endOf = (i: number) => i === cl.n - 1 || (fl[i + 1] & 1) === 1;
  const half = (i: number) => wq[i] * 5e-3 / 2;
  /** How far a plain ring reaches past its point along the path at a mitred bend, per mm of lateral offset. */
  const mitre = (i: number): number => {
    if (startOf(i) || endOf(i)) return 0;
    const ax = p[2 * i] - p[2 * i - 2], ay = p[2 * i + 1] - p[2 * i - 1];
    const bx = p[2 * i + 2] - p[2 * i], by = p[2 * i + 3] - p[2 * i + 1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la === 0 || lb === 0) return 0;
    const c = (ax * bx + ay * by) / (la * lb);
    if (c < CORNER_COS) return 0; // a corner is swept round with a fan of plain rings
    return Math.tan(Math.acos(Math.min(1, c)) / 2);
  };
  const self = new Float64Array(4);
  const BOTH = COVER_TOP | COVER_BOTTOM, FLAT = BULGE - FLAT_TOL;
  // Points in height order, so each layer's hash is built once.
  const order = Uint32Array.from({ length: cl.n }, (_, i) => i).sort((a, b) => cl.zq[a] - cl.zq[b] || a - b);
  const dz = H * 100;
  let z = -1;
  let above: Layer | null = null, below: Layer | null = null, same: Layer | null = null;
  for (const i of order) {
    if (cl.zq[i] !== z) {
      z = cl.zq[i];
      below = layer(nearest(z - dz));
      same = layer(nearest(z));
      above = layer(nearest(z + dz));
    }
    if (!endOf(i)) {
      const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * i + 2], by = p[2 * i + 3];
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len, uy = (by - ay) / len, ma = mitre(i), mb = mitre(i + 1);
      const fa = half(i) - BULGE, fb = half(i + 1) - BULGE;
      const flats = (l: Layer | null) => l !== null
        && lineCovered(l, grid, ax, ay, bx, by, ux, uy, ma, mb, 0, 0, FLAT, null)
        && lineCovered(l, grid, ax, ay, bx, by, ux, uy, ma, mb, fa, fb, FLAT, null)
        && lineCovered(l, grid, ax, ay, bx, by, ux, uy, ma, mb, -fa, -fb, FLAT, null);
      if (flats(above)) cover[i] |= COVER_TOP;
      if (flats(below)) cover[i] |= COVER_BOTTOM;
      if ((cover[i] & BOTH) === BOTH && same) {
        self[0] = ax; self[1] = ay; self[2] = bx; self[3] = by;
        if (lineCovered(same, grid, ax, ay, bx, by, ux, uy, ma, mb, half(i), half(i + 1), MARGIN, self)) cover[i] |= COVER_RIGHT;
        if (lineCovered(same, grid, ax, ay, bx, by, ux, uy, ma, mb, -half(i), -half(i + 1), MARGIN, self)) cover[i] |= COVER_LEFT;
      }
    }
    // A round end, once the flats of the segment it joins are known: in height order that segment
    // (this point's at a start, the previous point's at an end) has been tested already.
    if (startOf(i) !== endOf(i) && above && below && same && (cover[startOf(i) ? i : i - 1] & BOTH) === BOTH) {
      const j = startOf(i) ? i + 1 : i - 1;
      const ex = p[2 * i], ey = p[2 * i + 1], ox = ex - p[2 * j], oy = ey - p[2 * j + 1], ol = Math.hypot(ox, oy);
      if (endCovered(grid, same, above, below, ex, ey, ox / ol, oy / ol, half(i))) cover[i] |= COVER_END;
    }
  }
  return cover;
}
