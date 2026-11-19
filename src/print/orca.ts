/**
 * The booth's slicing vocabulary against OrcaSlicer's: SliceSettings to the
 * keys the engine takes, and the same keys read back from a G-code header.
 */
import type { BedType, SliceSettings } from "../document";
import { mm } from "../units";

type Seam = SliceSettings["seamPosition"];

/**
 * Every top surface pattern the engine accepts (the enum behind Orca's
 * `top_surface_pattern`), as [booth id, Orca value]. The first four ids are
 * what saved documents already hold. This is the one list: the SliceSettings
 * type, the document's validator and the Part panel's select all derive from
 * it, so a pattern the slicer can print is a pattern the booth can name.
 * It imports nothing at run time from document.ts, which imports it.
 */
export const TOP_PATTERNS = [
  ["monotonic", "monotonic"],
  ["monotonic-line", "monotonicline"],
  ["concentric", "concentric"],
  ["zigzag", "zig-zag"],
  ["aligned-rectilinear", "alignedrectilinear"],
  ["hilbert-curve", "hilbertcurve"],
  ["archimedean-chords", "archimedeanchords"],
  ["octagram-spiral", "octagramspiral"],
] as const;
export type TopSurfacePattern = (typeof TOP_PATTERNS)[number][0];
export const TOP_SURFACE_PATTERNS: readonly TopSurfacePattern[] = TOP_PATTERNS.map(([booth]) => booth);
const SEAMS: readonly Seam[] = ["aligned", "nearest", "back", "random"];

/**
 * Orca keys for a booth slice. The first layer takes the layer height too:
 * the bead model places layer k at Z = H (k + 1) and rejects uneven layers.
 */
export function orcaOverrides(s: SliceSettings): Record<string, string> {
  const pattern = TOP_PATTERNS.find(([booth]) => booth === s.topSurfacePattern);
  if (!pattern) throw new Error(`unknown top surface pattern: ${s.topSurfacePattern}`);
  return {
    layer_height: String(s.layerHeight),
    initial_layer_print_height: String(s.layerHeight),
    wall_loops: String(s.wallCount),
    top_shell_layers: String(s.topShellLayers),
    top_surface_pattern: pattern[1],
    seam_position: s.seamPosition,
    outer_wall_line_width: String(s.outerLineWidth),
    inner_wall_line_width: String(s.innerLineWidth),
    enable_arc_fitting: "1",
  };
}

export interface FileSettings {
  settings: SliceSettings;
  /** Orca keys whose value SliceSettings cannot express; the default stands in. */
  unmodelled: string[];
}

/** Reads the settings a G-code header records. A missing key keeps the value in `base`. */
export function settingsFromOrca(get: (key: string) => string | undefined, base: SliceSettings): FileSettings {
  const unmodelled: string[] = [];
  const num = (key: string, fallback: number): number => {
    const v = get(key);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const pattern = get("top_surface_pattern");
  let topSurfacePattern = base.topSurfacePattern;
  if (pattern !== undefined) {
    const hit = TOP_PATTERNS.find(([, orca]) => orca === pattern);
    if (hit) topSurfacePattern = hit[0];
    else unmodelled.push(`top_surface_pattern = ${pattern}`);
  }
  const seam = get("seam_position");
  let seamPosition = base.seamPosition;
  if (seam !== undefined) {
    const hit = SEAMS.find((s) => s === seam);
    if (hit) seamPosition = hit;
    else unmodelled.push(`seam_position = ${seam}`);
  }
  return {
    settings: {
      layerHeight: mm(num("layer_height", base.layerHeight)),
      outerLineWidth: mm(num("outer_wall_line_width", base.outerLineWidth)),
      innerLineWidth: mm(num("inner_wall_line_width", base.innerLineWidth)),
      wallCount: Math.round(num("wall_loops", base.wallCount)),
      topShellLayers: Math.round(num("top_shell_layers", base.topShellLayers)),
      topSurfacePattern,
      seamPosition,
    },
    unmodelled,
  };
}

/** Bambu / Orca `curr_bed_type`, e.g. "Textured PEI Plate" or "Cool Plate". */
export function bedFromOrca(name: string | undefined): BedType | null {
  if (!name) return null;
  if (/textured/i.test(name)) return "textured-pei";
  if (/cool|engineering|high temp|smooth|supertack/i.test(name)) return "smooth";
  return null;
}
