/** Parsed toolpath to centreline: which extrusions are visible, and the tables the print reports. */
import type { Centreline } from "../print";
import { INNER_WALL_MIN_WIDTH, JITTER, KEEP } from "./calibration";
import { centreline } from "./centreline";
import { coverFlats } from "./cover";
import { exposedInner } from "./exposed";
import { parse } from "./gcode";
import type { Toolpath } from "./gcode";

export interface PrintTables {
  /** Indexed by Z / H, entry 0 unused, as the .bin. A layer counter k prints at Z = H (k + 1). */
  layerTimeS: Float32Array;
  layerFan: Float32Array;
}

export function tablesOf(tp: Toolpath): PrintTables {
  const shift = (a: Float64Array): Float32Array => Float32Array.from({ length: a.length + 1 }, (_, k) => (k ? a[k - 1] : 0));
  return { layerTimeS: shift(tp.layerTime), layerFan: shift(tp.layerFan) };
}

/**
 * Keeps the walls and skins that show, then builds the centreline. A G-code
 * without width tags comes from a slicer that tags every wall alike and every
 * shell layer alike: its walls are told apart by width, its skins by what lies
 * above them. A tagged one needs neither.
 */
export function wallsToCentreline(tp: Toolpath, H: number, jitter: number = JITTER): Centreline {
  const { runs } = tp, untagged = !tp.widthTagged;
  if (untagged) for (const r of runs) if (r.feat === "Outer wall" && r.w[0] > INNER_WALL_MIN_WIDTH) r.feat = "Inner wall";
  const cl = centreline(runs.filter((r) => r.feat !== null && KEEP.has(r.feat)).concat(exposedInner(runs, 0.1, untagged)), H, jitter);
  if (!cl.n) throw new Error("no Bambu / Orca extrusions (; FEATURE: walls, skins) found in this G-code");
  return { ...cl, cover: coverFlats(cl, runs, H) };
}

/** G-code text to centreline and tables in one step, without the worker's stages. */
export function centrelineOfGcode(text: string, H: number, jitter: number = JITTER): { centreline: Centreline; tables: PrintTables } {
  const tp = parse(text, H);
  return { centreline: wallsToCentreline(tp, H, jitter), tables: tablesOf(tp) };
}
