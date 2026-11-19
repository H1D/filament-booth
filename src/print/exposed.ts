/**
 * Inner walls are hidden by the outer wall from the side, so only the parts
 * the layer above or below does not cover reach the mesh.
 */
import { BULGE, EDGE, SOLID } from "./calibration";
import type { Run } from "./gcode";

/** numpy rint: ties to even. */
export const rint = (v: number): number => {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 ? r - 1 : r;
};

/**
 * Keeps the parts of inner walls that the layer above or below does not cover
 * (slopes, top and bottom skins, and all of layer 0: the plate face is seen
 * off the bed). `skins` does the same for solid fill, for slices whose shell
 * layers are all tagged alike: open above = top surface, else bottom surface.
 */
export function exposedInner(runs: Run[], cell = 0.1, skins = false): Run[] {
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (const r of runs) {
    for (let k = 0; k < r.pts.length; k += 2) {
      lx = Math.min(lx, r.pts[k]); hx = Math.max(hx, r.pts[k]);
      ly = Math.min(ly, r.pts[k + 1]); hy = Math.max(hy, r.pts[k + 1]);
    }
  }
  lx -= 1; ly -= 1;
  const nx = Math.ceil((hx + 1 - lx) / cell) + 1, ny = Math.ceil((hy + 1 - ly) / cell) + 1;
  const off: number[] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j <= 4) off.push(i * ny + j);
  const byLayer = new Map<number, Run[]>();
  for (const r of runs) {
    const list = byLayer.get(r.layer);
    if (list) list.push(r);
    else byLayer.set(r.layer, [r]);
  }
  const cellOf = (x: number, y: number): number => rint((x - lx) / cell) * ny + rint((y - ly) / cell);
  const occ = (layer: number): Uint8Array => {
    const g = new Uint8Array(nx * ny);
    for (const r of layer >= 0 ? byLayer.get(layer) ?? [] : []) {
      const q = r.pts;
      for (let k = 0; k + 3 < q.length; k += 2) {
        const ax = q[k], ay = q[k + 1], dx = q[k + 2] - ax, dy = q[k + 3] - ay;
        const n = Math.ceil(Math.hypot(dx, dy) / (cell * 0.8)) + 1;
        for (let s = 0; s < n; s++) {
          const t = s / Math.max(n - 1, 1), c = cellOf(ax + dx * t, ay + dy * t);
          for (const o of off) g[c + o] = 1;
        }
      }
    }
    return g;
  };
  const out: Run[] = [], grids = new Map<number, Uint8Array>();
  const grid = (layer: number): Uint8Array => {
    let g = grids.get(layer);
    if (!g) { g = occ(layer); grids.set(layer, g); }
    return g;
  };
  for (const L of [...byLayer.keys()].sort((a, b) => a - b)) {
    const inner = (byLayer.get(L) ?? []).filter((r) => r.feat === "Inner wall" || (skins && r.feat !== null && SOLID.has(r.feat)));
    if (!inner.length) continue;
    const up = grid(L + 1), down = grid(L - 1);
    for (const k of grids.keys()) if (k < L - 1) grids.delete(k);
    for (const r of inner) {
      // sample every cell along each segment, on the centreline and near both edges of the bead's flat
      // top (EDGE * (W/2 - BULGE)): a gentle slope exposes the outer edge of the 2nd / 3rd wall first
      const q = r.pts, ns = q.length / 2 - 1, keep = new Uint8Array(ns);
      for (let s = 0; s < ns; s++) {
        const ax = q[2 * s], ay = q[2 * s + 1], dx = q[2 * s + 2] - ax, dy = q[2 * s + 3] - ay, ln = Math.hypot(dx, dy);
        const n = Math.ceil(ln / cell) + 1, hw = EDGE * Math.max(r.w[s + 1] / 2 - BULGE, 0) / Math.max(ln, 1e-9), sx = hw * -dy, sy = hw * dx;
        for (let k = 0; k < n && !keep[s]; k++) {
          const t = k / Math.max(n - 1, 1), x = ax + dx * t, y = ay + dy * t;
          for (const c of [cellOf(x, y), cellOf(x + sx, y + sy), cellOf(x - sx, y - sy)]) {
            if (!(up[c] && down[c])) { keep[s] = up[c] ? 2 : 1; break; } // 1: open above, 2: below only
          }
        }
      }
      const pad = Uint8Array.from(keep, (v, s) => v | (s > 0 ? keep[s - 1] : 0) | (s < ns - 1 ? keep[s + 1] : 0));
      for (let s = 0; s < ns; s++) { // segments s0..s1-1 -> points s0..s1
        if (!pad[s] || (s > 0 && pad[s - 1])) continue;
        let e = s;
        while (e < ns && pad[e]) e++;
        const feat = r.feat !== null && SOLID.has(r.feat) ? (keep.subarray(s, e).includes(1) ? "Top surface" : "Bottom surface") : r.feat;
        out.push({ ...r, feat, pts: q.slice(2 * s, 2 * e + 2), w: r.w.slice(s, e + 1), v: r.v.slice(s, e + 1) });
      }
    }
  }
  return out;
}
