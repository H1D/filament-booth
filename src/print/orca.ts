/**
 * The booth's slicing vocabulary against OrcaSlicer's: SliceSettings to the
 * keys the engine takes, and the same keys read back from a G-code header.
 */
import { DEFAULT_SLICE, mm } from "../document";
import type { BedType, SliceSettings } from "../document";

type TopPattern = SliceSettings["topSurfacePattern"];
type Seam = SliceSettings["seamPosition"];

const TOP_PATTERNS: readonly (readonly [TopPattern, string])[] = [
  ["monotonic", "monotonic"],
  ["monotonic-line", "monotonicline"],
  ["concentric", "concentric"],
  ["zigzag", "zig-zag"],
];
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

/** Reads the settings a G-code header records. A missing key keeps its default. */
export function settingsFromOrca(get: (key: string) => string | undefined): FileSettings {
  const unmodelled: string[] = [];
  const num = (key: string, fallback: number): number => {
    const v = get(key);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const pattern = get("top_surface_pattern");
  let topSurfacePattern = DEFAULT_SLICE.topSurfacePattern;
  if (pattern !== undefined) {
    const hit = TOP_PATTERNS.find(([, orca]) => orca === pattern);
    if (hit) topSurfacePattern = hit[0];
    else unmodelled.push(`top_surface_pattern = ${pattern}`);
  }
  const seam = get("seam_position");
  let seamPosition = DEFAULT_SLICE.seamPosition;
  if (seam !== undefined) {
    const hit = SEAMS.find((s) => s === seam);
    if (hit) seamPosition = hit;
    else unmodelled.push(`seam_position = ${seam}`);
  }
  return {
    settings: {
      layerHeight: mm(num("layer_height", DEFAULT_SLICE.layerHeight)),
      outerLineWidth: mm(num("outer_wall_line_width", DEFAULT_SLICE.outerLineWidth)),
      innerLineWidth: mm(num("inner_wall_line_width", DEFAULT_SLICE.innerLineWidth)),
      wallCount: Math.round(num("wall_loops", DEFAULT_SLICE.wallCount)),
      topShellLayers: Math.round(num("top_shell_layers", DEFAULT_SLICE.topShellLayers)),
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
