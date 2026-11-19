/**
 * document.ts — the BoothDocument: every user setting, as plain JSON.
 *
 * Invariants this file enforces by construction:
 * - One frame: Blender Z-up, metres, watts. Millimetres exist only inside
 *   print.ts (plate coordinates) and in SliceSettings, which are a slicer's
 *   native vocabulary. Branded scalars make a mm/m slip a type error.
 * - Nothing here imports three.js, a worker, or the DOM. The document is
 *   what localStorage stores and what export writes, verbatim.
 * - Presets are values, not modes: applying one copies it into the document.
 *   "Modified" is derived by comparison (booth.ts), never stored.
 */

// ---- branded units (construct via the helpers; arithmetic stays plain) ----
export type Metres = number & { readonly _u: "m" };
export type Mm = number & { readonly _u: "mm" };
export type Watts = number & { readonly _u: "W" };
export type Degrees = number & { readonly _u: "deg" };
export type Kelvin = number & { readonly _u: "K" };
export const m = (v: number): Metres => v as Metres;
export const mm = (v: number): Mm => v as Mm;
export const watts = (v: number): Watts => v as Watts;
export const deg = (v: number): Degrees => v as Degrees;
export const kelvin = (v: number): Kelvin => v as Kelvin;

/** Blender-frame vector, metres. The only vector type in the document. */
export type Vec3 = readonly [Metres, Metres, Metres];
/** Linear RGB, 0..1 nominal (emissive/scene values may exceed 1 elsewhere). */
export type Rgb = readonly [number, number, number];

export const DOC_VERSION = 1;

export interface BoothDocument {
  version: typeof DOC_VERSION;
  /** Applies when the print source is an STL. A G-code reports its own. */
  slicing: SliceSettings;
  filament: FilamentChoice;
  studio: Studio;
  /** Which look `studio` was copied from, or null. Pure provenance. */
  lookBase: LookId | null;
  camera: CameraSetup;
  pose: Pose;
  output: OutputSetup;
}

// ---- filament & print appearance -------------------------------------------

export type FilamentPresetId = "petg-basic" | "pla-basic" | "pla-matte" | "pla-silk";

/** The full optical recipe. The ONLY place material numbers may live;
 *  presets.ts fills these, scene.ts resolves them for both renderers. */
export interface FilamentRecipe {
  /** Linear albedo derived from the picked sRGB colour at resolve time;
   *  stored here as sRGB hex so the colour picker round-trips exactly. */
  colorHex: string;
  ior: number;
  anisotropy: number; // 0..1, Principled Anisotropic (grooves along path)
  /** Per-feature roughness: the bead shader and the Cycles graph select by
   *  the same feature code. Keys are exhaustive — no fallback branch. */
  roughness: Record<FeatureCode, number>;
  vary: number; // scales per-layer sheen + slow mottling
  /** Plate-face roughness per bed. `smooth` reuses wall roughness + gloss. */
  peiRough: number;
  peiFarRough: number;
}
export type FeatureCode = 0 | 1 | 2 | 3; // wall | top | bridge | bottom

export interface Imperfections {
  heatGloss: number;   // 0..1 warm layers glossier
  softLines: number;   // 0..1 warm layers' grooves shallower (preview + Cycles normal attr)
  speedGloss: number;  // 0..1 fast walls rougher
  tauS: number;        // cooling time constant, seconds
  fanCooling: number;  // part-fan multiplier on cooling
  overlay: "print" | "heat" | "speed"; // debug false-colour, preview only
}

export type BedType = "textured-pei" | "smooth";

export interface FilamentChoice {
  presetId: FilamentPresetId | null; // null once any recipe field is edited
  recipe: FilamentRecipe;
  /** 0..1 UI slider. Not a blend between presets: resolveFilament applies it
   *  as one roughness offset curve over `recipe` (scene.ts), so both
   *  renderers inherit the same gloss by construction. */
  gloss: number;
  imperfections: Imperfections;
  /** "auto" = trust the G-code's curr_bed_type when present (print.ts meta),
   *  else textured. An STL has no bed in file; auto means textured there. */
  bed: BedType | "auto";
}

// ---- slicing (mm: this is the slicer's boundary, parsed in print.ts) -------

export interface SliceSettings {
  layerHeight: Mm;
  outerLineWidth: Mm;
  innerLineWidth: Mm;
  wallCount: number;
  topShellLayers: number;
  topSurfacePattern: "monotonic" | "monotonic-line" | "concentric" | "zigzag";
  seamPosition: "aligned" | "nearest" | "back" | "random";
}
export const DEFAULT_SLICE: SliceSettings = {
  layerHeight: mm(0.2), outerLineWidth: mm(0.42), innerLineWidth: mm(0.45),
  wallCount: 2, topShellLayers: 5, topSurfacePattern: "monotonic", seamPosition: "aligned",
};

// ---- studio -----------------------------------------------------------------

export type LookId = "studio" | "dark" | "gradient" | "rim" | "raking";

export type LightColor = { kind: "rgb"; rgb: Rgb } | { kind: "kelvin"; kelvin: Kelvin };

interface LightBase {
  id: string; // stable across edits; panels and the viewport diff key on it
  name: string;
  on: boolean;
  /** Spherical placement about the studio aim point (scene.ts owns the aim:
   *  part centre at floor-resting height). The photographer's vocabulary is
   *  the storage vocabulary — no Cartesian copy to keep in sync. */
  azimuth: Degrees;
  elevation: Degrees;
  distance: Metres;
  /** Softbox size. An ellipse is inscribed in width x height. */
  shape: "rect" | "ellipse";
  width: Metres;
  height: Metres;
  color: LightColor;
  /** Light-link: illuminate the part only, never the backdrop (render.py
   *  `only=part`). Preview gets this free via its bake; Cycles natively. */
  partOnly: boolean;
}
export interface AreaLight extends LightBase {
  kind: "area";
  powerW: Watts;      // true watts; the old 1/40 "room watts" scale is
                      // applied once, in presets, when rigs are transcribed
  spreadDeg: Degrees; // Cycles area spread; 180 = hemisphere
}
export interface ScrimLight extends LightBase {
  kind: "scrim"; // emissive card, vertical gradient, camera-invisible
  topRadiance: number;
  bottomRadiance: number;
}
export type StudioLight = AreaLight | ScrimLight;

export interface Studio {
  lights: StudioLight[];
  backdrop: { color: Rgb; roughness: number }; // linear albedo of the sweep
  world: { hdrId: string; strength: number; rotationDeg: Degrees };
  /** Reflector ring on the table that only glossy reflections see: the camera,
   *  the backdrop and shadows never do. The gradient and rim looks read wall
   *  orientation off it. Both renderers build it (scene.ts FloorCardRing). */
  floorCards: { keySide: number; farSide: number; azimuth: Degrees } | null;
}

// ---- camera, pose, output ----------------------------------------------------

export interface CameraSetup {
  /** Orbit about `target`, Blender frame. OrbitControls is only an editor
   *  for these four numbers (viewport.ts); it owns no camera state. */
  azimuth: Degrees;
  elevation: Degrees;
  distance: Metres;
  target: Vec3;
  focalMm: Mm;            // 36 mm sensor, fit AUTO (scene.ts solveCamera)
  fStop: number;
  /** Focus picked by clicking the part, stored in part-local metres so a
   *  pose change keeps focus on the same physical point. Null = target. */
  focusPartPoint: Vec3 | null;
}

export interface Pose {
  turntableDeg: Degrees;
  /** Which printed face rests on the floor. "plate" = as printed. Any other
   *  face re-poses and re-centres on the floor (scene.ts solvePose). */
  restFace: "plate" | "top" | "front" | "back" | "left" | "right";
}

/** Blender's AgX looks. "medium-high-contrast" is what the reference stills use. */
export type AgxLook = "none" | "punchy" | "low-contrast" | "medium-low-contrast" | "medium-high-contrast" | "high-contrast";
export interface OutputSetup {
  /** Crop frame in the preview, frame of the photo. Pixel size is derived in compileScene. */
  aspect: { w: number; h: number };
  longEdgePx: number;
  samples: number;            // engine-agnostic target (Cycles or raster)
  transparentBackground: boolean;
  viewTransform: { kind: "agx"; look: AgxLook };
  denoise: boolean;
}

/** Boundary check for imported/persisted JSON. Throws with a field path.
 *  Everything past this trusts the types. */
// TODO: field-by-field narrowing; migrate older versions by switch on version.
export function parseDocument(json: unknown): BoothDocument {
  throw new Error("not implemented");
}

export function defaultDocument(): BoothDocument {
  throw new Error("not implemented"); // TODO: petg-basic + "studio" look copied in
}
