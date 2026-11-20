/**
 * Every number that shapes a bead lives here. They are calibrated against the
 * Cycles stills of the reference viewer and mirror gcode_mesh.py, so the
 * Python parity test fails when one drifts. Change them only on purpose.
 */
import type { FeatureCode } from "../document";

/** Layer height of a prebuilt .bin, which does not record its own (mm). */
export const H0 = 0.2;
/** Side bulge depth, the groove between layers (mm). */
export const BULGE = 0.045;
/** Vertical radius of the nozzle-flattened upper edge of top-surface lines (mm). */
export const TOP_R = 0.04;
/** Largest chord error when tessellating G2/G3 arcs (mm). */
export const ARC_TOL = 0.003;
/** Per-layer XY wobble sigma, the Z banding of a real printer (mm). 0 = perfect printer. */
export const JITTER = 0.004;
/** Turns sharper than this are swept round with a fan of rings. */
export const CORNER_COS = Math.cos((35 * Math.PI) / 180);
/** Largest swing per ring round a corner (rad). */
export const FAN_STEP = (30 * Math.PI) / 180;
/** Rings per 180 degrees of round line end. */
export const CAP_STEPS = 4;
/** Inner-wall visibility probes sit at this fraction of the flat half-width. */
export const EDGE = 0.6;

/** Features that reach the mesh. Inner walls join only where exposedInner finds them uncovered. */
export const KEEP: ReadonlySet<string> = new Set([
  "Outer wall", "Overhang wall", "Top surface", "Bottom surface", "Bridge", "Gap infill",
]);
/** Extrusions that stay in the printed part, the ones that hide a bead's face (cover.ts). Support, brim,
 *  skirt, prime tower and purge lines come off it, and an unknown feature counts as off. */
export const PART: ReadonlySet<string> = new Set([
  "Outer wall", "Inner wall", "Overhang wall", "Sparse infill", "Internal solid infill", "Solid infill",
  "Top surface", "Bottom surface", "Bridge", "Internal bridge", "Gap infill", "Floating vertical shell",
]);
/** Everything not listed is a wall (0). */
export const FEAT_CODE: ReadonlyMap<string, FeatureCode> = new Map([
  ["Top surface", 1], ["Bridge", 2], ["Bottom surface", 3],
]);
/** Solid fill of a slice whose shell layers are all tagged alike. */
export const SOLID: ReadonlySet<string> = new Set(["Internal solid infill", "Solid infill"]);

/** Wall width above which a wall of an untagged slice is relabelled an inner wall (mm). */
export const INNER_WALL_MIN_WIDTH = 0.435;
/** Line width assumed before the first width tag (mm). */
export const DEFAULT_WIDTH = 0.42;
/** Bead width bounds written to the centreline (mm). */
export const WIDTH_RANGE: readonly [number, number] = [0.15, 1.2];
/** Steps shorter than this are float noise and dropped (mm). */
export const MIN_STEP = 2e-3;
/** Filament diameter assumed when a width is read back from E (mm). */
export const FILAMENT_DIAMETER = 1.75;
