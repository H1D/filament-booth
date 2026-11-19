/**
 * G-code text to extrusion runs, plus the slicer's own header comments.
 * Millimetres and plate coordinates throughout.
 */
import { ARC_TOL, DEFAULT_WIDTH, FILAMENT_DIAMETER, H0 } from "./calibration";

/** One continuous extrusion: points, widths (mm) and feed (mm/s) run in parallel. */
export interface Run {
  feat: string | null;
  layer: number; // 0-based counter of layer changes
  z: number;
  pts: number[]; // flat x, y
  w: number[];
  v: number[];
}

export interface Toolpath {
  runs: Run[];
  /** Seconds per layer counter, and part-fan duty 0..1. */
  layerTime: Float64Array;
  layerFan: Float64Array;
  /** The slicer wrote `; LINE_WIDTH:` tags. Without them widths come from E. */
  widthTagged: boolean;
}

function arcPoints(out: number[], x0: number, y0: number, x1: number, y1: number, i: number, j: number, cw: boolean): void {
  const cx = x0 + i, cy = y0 + j, r = Math.hypot(i, j), a0 = Math.atan2(y0 - cy, x0 - cx);
  const a1 = Math.atan2(y1 - cy, x1 - cx), TAU = 2 * Math.PI;
  let sweep = (((cw ? a0 - a1 : a1 - a0) % TAU) + TAU) % TAU;
  if (sweep < 1e-9) sweep = TAU;
  const step = r > ARC_TOL ? 2 * Math.acos(Math.max(-1, 1 - ARC_TOL / r)) : Math.PI / 2;
  const n = Math.max(1, Math.ceil(sweep / step));
  for (let k = 1; k < n; k++) {
    const a = a0 + (cw ? -1 : 1) * sweep * k / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  out.push(x1, y1);
}

/** Seconds for a move of `len` mm at feed `v` mm/s: short moves only reach sqrt(acc * len). */
const moveTime = (len: number, v: number, acc: number): number => (len > 0 && v > 0 ? len / Math.min(v, Math.sqrt(acc * len)) : 0);

function argOf(line: string, key: string, fallback = NaN): number {
  for (const t of line.split(";")[0].split(" ").slice(1)) if (t[0] === key) return parseFloat(t.slice(1));
  return fallback;
}

interface Words { X: number; Y: number; Z: number; E: number; I: number; J: number; F: number }

function setWord(w: Words, letter: string, value: number): boolean {
  switch (letter) {
    case "X": w.X = value; return true;
    case "Y": w.Y = value; return true;
    case "Z": w.Z = value; return true;
    case "E": w.E = value; return true;
    case "I": w.I = value; return true;
    case "J": w.J = value; return true;
    case "F": w.F = value; return true;
    default: return false;
  }
}

/**
 * Without `; LINE_WIDTH:` tags the width comes from E: Slic3r's bead area
 * (w - H) H + pi H^2 / 4, on 1.75 mm filament.
 */
export function parse(text: string, H: number = H0): Toolpath {
  const runs: Run[] = [], lt: number[] = [], lf: number[] = [];
  let cur: Run | null = null, x = 0, y = 0, z = 0, absolute = true, feat: string | null = null, w = DEFAULT_WIDTH, layer = -1, pos = 0;
  let feed = 50, acc = 6000, fan = 0, total = 0, widthFromE = true;
  const spend = (t: number): void => {
    if (layer >= 0 && t > 0) { lt[layer] = (lt[layer] || 0) + t; lf[layer] = (lf[layer] || 0) + t * fan; }
  };
  const p: Words = { X: NaN, Y: NaN, Z: NaN, E: 0, I: 0, J: 0, F: NaN };
  const arcBuf: number[] = [];
  const filamentArea = Math.PI * (FILAMENT_DIAMETER / 2) ** 2;
  while (pos < text.length) {
    let eol = text.indexOf("\n", pos);
    if (eol < 0) eol = text.length;
    const c0 = text.charCodeAt(pos);
    if (c0 === 59) { // ;
      if (text.startsWith("; FEATURE:", pos)) { feat = text.slice(pos + 10, eol).trim(); cur = null; }
      else if (text.startsWith("; LINE_WIDTH:", pos)) { w = parseFloat(text.slice(pos + 13, eol)); widthFromE = false; }
      else if (text.startsWith("; CHANGE_LAYER", pos) || text.startsWith("; LAYER ", pos)) { layer++; cur = null; }
      else if (text.startsWith(";TYPE:", pos)) { feat = text.slice(pos + 6, eol).trim(); cur = null; }
      else if (text.startsWith("; model printing time:", pos)) { // Bambu / Orca header, e.g. 5h 58m 42s
        const hms: Record<string, number> = {};
        for (const [, n, u] of text.slice(pos, eol).split(";")[1].matchAll(/(\d+)([dhms])/g)) hms[u] = +n;
        total = (hms.d || 0) * 86400 + (hms.h || 0) * 3600 + (hms.m || 0) * 60 + (hms.s || 0);
      }
    } else if (c0 === 77) { // M
      const line = text.slice(pos, eol);
      if (line.startsWith("M106 ") && argOf(line, "P", 1) === 1) fan = argOf(line, "S", 0) / 255; // P1 / no P: part fan
      else if (line.startsWith("M107") && argOf(line, "P", 1) === 1) fan = 0;
      else if (line.startsWith("M204 ") && argOf(line, "S")) acc = argOf(line, "S");
    } else if (c0 === 71) { // G
      const g = text.slice(pos, pos + 3);
      if (g === "G90") absolute = true;
      else if (g === "G91") absolute = false;
      else if (g === "G4 ") { const line = text.slice(pos, eol); spend(argOf(line, "P", 0) / 1000 + argOf(line, "S", 0)); }
      else if (g === "G0 " || g === "G1 " || g === "G2 " || g === "G3 ") {
        let semi = text.indexOf(";", pos);
        if (semi < 0 || semi > eol) semi = eol;
        p.X = p.Y = p.Z = p.F = NaN; p.E = p.I = p.J = 0;
        let hasIJ = false;
        for (const t of text.slice(pos + 3, semi).split(" ")) {
          if (t && setWord(p, t[0], parseFloat(t.slice(1)))) hasIJ ||= t[0] === "I" || t[0] === "J";
        }
        if (!Number.isNaN(p.F)) feed = p.F / 60;
        const nx = absolute ? (Number.isNaN(p.X) ? x : p.X) : x + (Number.isNaN(p.X) ? 0 : p.X);
        const ny = absolute ? (Number.isNaN(p.Y) ? y : p.Y) : y + (Number.isNaN(p.Y) ? 0 : p.Y);
        const nz = absolute ? (Number.isNaN(p.Z) ? z : p.Z) : z + (Number.isNaN(p.Z) ? 0 : p.Z);
        const arc = (g === "G2 " || g === "G3 ") && hasIJ; // full circles end where they start
        const moved = Math.abs(nx - x) > 1e-6 || Math.abs(ny - y) > 1e-6 || arc;
        let len: number;
        if (arc) {
          arcBuf.length = 0;
          arcPoints(arcBuf, x, y, nx, ny, p.I, p.J, g === "G2 ");
          len = 0;
          for (let k = 0, px = x, py = y; k < arcBuf.length; k += 2) { len += Math.hypot(arcBuf[k] - px, arcBuf[k + 1] - py); px = arcBuf[k]; py = arcBuf[k + 1]; }
        } else len = Math.hypot(nx - x, ny - y);
        spend(moveTime(Math.hypot(len, nz - z) || Math.abs(p.E), feed, acc));
        if (p.E > 0 && moved && Math.abs(nz - z) < 1e-6) {
          if (widthFromE && len > 0) w = p.E * filamentArea / (len * H) + H * (1 - Math.PI / 4);
          if (!cur) { cur = { feat, layer, z, pts: [x, y], w: [w], v: [feed] }; runs.push(cur); }
          const before = cur.pts.length;
          if (arc) cur.pts.push(...arcBuf);
          else cur.pts.push(nx, ny);
          for (let k = before; k < cur.pts.length; k += 2) { cur.w.push(w); cur.v.push(feed); }
        } else if (moved || Math.abs(nz - z) > 1e-6) cur = null; // travel / wipe / hop; F-only or E-only lines don't end a bead
        x = nx; y = ny; z = nz;
      }
    }
    pos = eol + 1;
  }
  const n = lt.length;
  const layerTime = Float64Array.from({ length: n }, (_, k) => lt[k] || 0);
  const layerFan = Float64Array.from({ length: n }, (_, k) => (lt[k] ? lf[k] / lt[k] : 0));
  const sum = layerTime.reduce((s, t) => s + t, 0);
  if (total && sum) for (let k = 0; k < n; k++) layerTime[k] *= total / sum; // trust the slicer's total, keep our split
  return { runs, layerTime, layerFan, widthTagged: !widthFromE };
}
