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
 *
 * Azimuth, for the camera and for every light, is one convention: degrees
 * from -Y (the side the default camera stands on, looking towards +Y) turning
 * towards +X, so +90 is +X and -90 is -X. Elevation is up from the floor
 * plane. About a point P the offset is
 *   distance * (sin az * cos el, -cos az * cos el, sin el).
 * This is render.py's camera convention and the old viewer's floor-card one.
 */
import { FILAMENT_PRESETS, LOOK_PRESETS } from "./presets";
import { deg, kelvin, m, mm, watts, type Degrees, type Kelvin, type Metres, type Mm, type Rgb, type Vec3, type Watts } from "./units";

export { deg, kelvin, m, mm, watts };
export type { Degrees, Kelvin, Metres, Mm, Rgb, Vec3, Watts };

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

export const FILAMENT_PRESET_IDS = ["petg-basic", "pla-basic", "pla-matte", "pla-silk"] as const;
export type FilamentPresetId = (typeof FILAMENT_PRESET_IDS)[number];

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

export const OVERLAYS = ["print", "heat", "speed"] as const;
export interface Imperfections {
  heatGloss: number;   // 0..1 warm layers glossier
  softLines: number;   // 0..1 warm layers' grooves shallower (preview + Cycles normal attr)
  speedGloss: number;  // 0..1 fast walls rougher
  tauS: number;        // cooling time constant, seconds
  fanCooling: number;  // part-fan multiplier on cooling
  overlay: (typeof OVERLAYS)[number]; // debug false-colour, preview only
}
/** The old viewer's IMP_DEFAULTS. */
export const DEFAULT_IMPERFECTIONS: Imperfections = {
  heatGloss: 0.6, softLines: 0.5, speedGloss: 0.5, tauS: 10, fanCooling: 1, overlay: "print",
};

export const BED_TYPES = ["textured-pei", "smooth"] as const;
export type BedType = (typeof BED_TYPES)[number];

/** The gloss value that leaves a recipe's roughness untouched. The curve is
 *  `glossRoughness` in scene.ts. */
export const DEFAULT_GLOSS = 0.5;

export interface FilamentChoice {
  presetId: FilamentPresetId | null; // null once any recipe field is edited
  recipe: FilamentRecipe;
  /** 0..1 UI slider, DEFAULT_GLOSS = the recipe as written. Not a blend
   *  between presets: scene.ts applies it as one monotonic curve over every
   *  roughness in `recipe`, so both renderers inherit the same gloss. */
  gloss: number;
  imperfections: Imperfections;
  /** "auto" = trust the G-code's curr_bed_type when present (print.ts meta),
   *  else textured. An STL has no bed in file; auto means textured there. */
  bed: BedType | "auto";
}

// ---- slicing (mm: this is the slicer's boundary, parsed in print.ts) -------

export const TOP_SURFACE_PATTERNS = ["monotonic", "monotonic-line", "concentric", "zigzag"] as const;
export const SEAM_POSITIONS = ["aligned", "nearest", "back", "random"] as const;
export interface SliceSettings {
  layerHeight: Mm;
  outerLineWidth: Mm;
  innerLineWidth: Mm;
  wallCount: number;
  topShellLayers: number;
  topSurfacePattern: (typeof TOP_SURFACE_PATTERNS)[number];
  seamPosition: (typeof SEAM_POSITIONS)[number];
}
export const DEFAULT_SLICE: SliceSettings = {
  layerHeight: mm(0.2), outerLineWidth: mm(0.42), innerLineWidth: mm(0.45),
  wallCount: 2, topShellLayers: 5, topSurfacePattern: "monotonic", seamPosition: "aligned",
};

// ---- studio -----------------------------------------------------------------

export const LOOK_IDS = ["studio", "dark", "gradient", "rim", "raking"] as const;
export type LookId = (typeof LOOK_IDS)[number];

export type LightColor = { kind: "rgb"; rgb: Rgb } | { kind: "kelvin"; kelvin: Kelvin };

interface LightBase {
  id: string; // stable across edits; panels and the viewport diff key on it
  name: string;
  on: boolean;
  /** Spherical placement about the studio aim point (scene.ts owns the aim:
   *  part centre at floor-resting height), in the azimuth convention at the
   *  top of this file. The photographer's vocabulary is the storage
   *  vocabulary — no Cartesian copy to keep in sync. */
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
   *  orientation off it. Both renderers build it (scene.ts FloorCardRing).
   *  `azimuth` is the key side, in the convention at the top of this file. */
  floorCards: { keySide: number; farSide: number; azimuth: Degrees } | null;
}

// ---- camera, pose, output ----------------------------------------------------

export interface CameraSetup {
  /** Orbit about `target`, Blender frame, same azimuth convention as lights.
   *  OrbitControls is only an editor for these four numbers (viewport.ts);
   *  it owns no camera state. */
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

export const REST_FACES = ["plate", "top", "front", "back", "left", "right"] as const;
export interface Pose {
  turntableDeg: Degrees;
  /** Which printed face rests on the floor. "plate" = as printed. Any other
   *  face re-poses and re-centres on the floor (scene.ts solvePose). Faces
   *  are named as seen from the default camera, which looks towards +Y at
   *  the part as printed: front is the -Y face, left the -X face. */
  restFace: (typeof REST_FACES)[number];
}

/** Blender's AgX looks. "medium-high-contrast" is what the reference stills use. */
export const AGX_LOOKS = ["none", "punchy", "low-contrast", "medium-low-contrast", "medium-high-contrast", "high-contrast"] as const;
export type AgxLook = (typeof AGX_LOOKS)[number];
export interface OutputSetup {
  /** Crop frame in the preview, frame of the photo. Pixel size is derived in compileScene. */
  aspect: { w: number; h: number };
  longEdgePx: number;
  samples: number;            // engine-agnostic target (Cycles or raster)
  transparentBackground: boolean;
  viewTransform: { kind: "agx"; look: AgxLook };
  denoise: boolean;
}

// ---- boundary ----------------------------------------------------------------

/** A rejected document. `path` names the offending field, `fields.like[3].this`. */
export class DocumentError extends Error {
  readonly path: string;
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.name = "DocumentError";
    this.path = path;
  }
}

type Obj = Record<string, unknown>;
function fail(path: string, problem: string): never {
  throw new DocumentError(path, problem);
}
const at = (path: string, key: string | number): string =>
  typeof key === "number" ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`;

function isObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function object(v: unknown, path: string): Obj {
  return isObject(v) ? v : fail(path, "expected an object");
}
function array(v: unknown, path: string, length?: number): unknown[] {
  if (!Array.isArray(v)) return fail(path, "expected an array");
  if (length !== undefined && v.length !== length) return fail(path, `expected ${length} items, got ${v.length}`);
  return v;
}
interface NumBounds { min?: number; max?: number; gt?: number; int?: boolean }
function num(v: unknown, path: string, b: NumBounds = {}): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(path, "expected a finite number");
  if (b.int && !Number.isInteger(v)) return fail(path, `expected an integer, got ${v}`);
  if (b.min !== undefined && v < b.min) return fail(path, `must be at least ${b.min}, got ${v}`);
  if (b.max !== undefined && v > b.max) return fail(path, `must be at most ${b.max}, got ${v}`);
  if (b.gt !== undefined && v <= b.gt) return fail(path, `must be greater than ${b.gt}, got ${v}`);
  return v;
}
function text(v: unknown, path: string): string {
  return typeof v === "string" && v !== "" ? v : fail(path, "expected a non-empty string");
}
function bool(v: unknown, path: string): boolean {
  return typeof v === "boolean" ? v : fail(path, "expected true or false");
}
function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  for (const a of allowed) if (a === v) return a;
  return fail(path, `expected one of ${allowed.join(", ")}, got ${JSON.stringify(v)}`);
}
function vec3(v: unknown, path: string): Vec3 {
  const a = array(v, path, 3);
  return [m(num(a[0], at(path, 0))), m(num(a[1], at(path, 1))), m(num(a[2], at(path, 2)))];
}
function rgb(v: unknown, path: string): Rgb {
  const a = array(v, path, 3);
  return [num(a[0], at(path, 0), { min: 0 }), num(a[1], at(path, 1), { min: 0 }), num(a[2], at(path, 2), { min: 0 })];
}
const unit = { min: 0, max: 1 } as const;

function parseSlicing(v: unknown, path: string): SliceSettings {
  const o = object(v, path);
  return {
    layerHeight: mm(num(o.layerHeight, at(path, "layerHeight"), { min: 0.04, max: 1 })),
    outerLineWidth: mm(num(o.outerLineWidth, at(path, "outerLineWidth"), { min: 0.1, max: 2 })),
    innerLineWidth: mm(num(o.innerLineWidth, at(path, "innerLineWidth"), { min: 0.1, max: 2 })),
    wallCount: num(o.wallCount, at(path, "wallCount"), { int: true, min: 1, max: 20 }),
    topShellLayers: num(o.topShellLayers, at(path, "topShellLayers"), { int: true, min: 0, max: 50 }),
    topSurfacePattern: oneOf(o.topSurfacePattern, at(path, "topSurfacePattern"), TOP_SURFACE_PATTERNS),
    seamPosition: oneOf(o.seamPosition, at(path, "seamPosition"), SEAM_POSITIONS),
  };
}

function parseRecipe(v: unknown, path: string): FilamentRecipe {
  const o = object(v, path);
  const hex = o.colorHex;
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) fail(at(path, "colorHex"), `expected #rrggbb, got ${JSON.stringify(hex)}`);
  const rp = at(path, "roughness");
  const r = object(o.roughness, rp);
  return {
    colorHex: hex,
    ior: num(o.ior, at(path, "ior"), { min: 1, max: 3 }),
    anisotropy: num(o.anisotropy, at(path, "anisotropy"), unit),
    roughness: {
      0: num(r[0], at(rp, 0), unit), 1: num(r[1], at(rp, 1), unit),
      2: num(r[2], at(rp, 2), unit), 3: num(r[3], at(rp, 3), unit),
    },
    vary: num(o.vary, at(path, "vary"), { min: 0, max: 2 }),
    peiRough: num(o.peiRough, at(path, "peiRough"), unit),
    peiFarRough: num(o.peiFarRough, at(path, "peiFarRough"), unit),
  };
}

function parseImperfections(v: unknown, path: string): Imperfections {
  const o = object(v, path);
  return {
    heatGloss: num(o.heatGloss, at(path, "heatGloss"), unit),
    softLines: num(o.softLines, at(path, "softLines"), unit),
    speedGloss: num(o.speedGloss, at(path, "speedGloss"), unit),
    tauS: num(o.tauS, at(path, "tauS"), { gt: 0, max: 3600 }),
    fanCooling: num(o.fanCooling, at(path, "fanCooling"), { min: 0, max: 20 }),
    overlay: oneOf(o.overlay, at(path, "overlay"), OVERLAYS),
  };
}

function parseFilament(v: unknown, path: string): FilamentChoice {
  const o = object(v, path);
  const presetId = o.presetId === null ? null : oneOf(o.presetId, at(path, "presetId"), FILAMENT_PRESET_IDS);
  return {
    presetId,
    recipe: parseRecipe(o.recipe, at(path, "recipe")),
    gloss: num(o.gloss, at(path, "gloss"), unit),
    imperfections: parseImperfections(o.imperfections, at(path, "imperfections")),
    bed: oneOf(o.bed, at(path, "bed"), ["auto", ...BED_TYPES]),
  };
}

function parseColor(v: unknown, path: string): LightColor {
  const o = object(v, path);
  const kind = oneOf(o.kind, at(path, "kind"), ["rgb", "kelvin"] as const);
  if (kind === "rgb") return { kind, rgb: rgb(o.rgb, at(path, "rgb")) };
  return { kind, kelvin: kelvin(num(o.kelvin, at(path, "kelvin"), { min: 1000, max: 40000 })) };
}

function parseLight(v: unknown, path: string): StudioLight {
  const o = object(v, path);
  const kind = oneOf(o.kind, at(path, "kind"), ["area", "scrim"] as const);
  const base = {
    id: text(o.id, at(path, "id")),
    name: typeof o.name === "string" ? o.name : fail(at(path, "name"), "expected a string"),
    on: bool(o.on, at(path, "on")),
    azimuth: deg(num(o.azimuth, at(path, "azimuth"), { min: -360, max: 360 })),
    elevation: deg(num(o.elevation, at(path, "elevation"), { min: -90, max: 90 })),
    distance: m(num(o.distance, at(path, "distance"), { gt: 0, max: 100 })),
    shape: oneOf(o.shape, at(path, "shape"), ["rect", "ellipse"] as const),
    width: m(num(o.width, at(path, "width"), { gt: 0, max: 100 })),
    height: m(num(o.height, at(path, "height"), { gt: 0, max: 100 })),
    color: parseColor(o.color, at(path, "color")),
    partOnly: bool(o.partOnly, at(path, "partOnly")),
  };
  if (kind === "area") {
    return {
      kind, ...base,
      powerW: watts(num(o.powerW, at(path, "powerW"), { min: 0, max: 1e6 })),
      spreadDeg: deg(num(o.spreadDeg, at(path, "spreadDeg"), { min: 1, max: 180 })),
    };
  }
  return {
    kind, ...base,
    topRadiance: num(o.topRadiance, at(path, "topRadiance"), { min: 0, max: 1e6 }),
    bottomRadiance: num(o.bottomRadiance, at(path, "bottomRadiance"), { min: 0, max: 1e6 }),
  };
}

function parseStudio(v: unknown, path: string): Studio {
  const o = object(v, path);
  const lp = at(path, "lights");
  const lights = array(o.lights, lp).map((l, i) => parseLight(l, at(lp, i)));
  const seen = new Set<string>();
  lights.forEach((l, i) => {
    if (seen.has(l.id)) fail(at(at(lp, i), "id"), `duplicate light id ${JSON.stringify(l.id)}`);
    seen.add(l.id);
  });
  const bp = at(path, "backdrop");
  const b = object(o.backdrop, bp);
  const wp = at(path, "world");
  const w = object(o.world, wp);
  const fp = at(path, "floorCards");
  let floorCards: Studio["floorCards"] = null;
  if (o.floorCards !== null) {
    const f = object(o.floorCards, fp);
    floorCards = {
      keySide: num(f.keySide, at(fp, "keySide"), { min: 0, max: 1e6 }),
      farSide: num(f.farSide, at(fp, "farSide"), { min: 0, max: 1e6 }),
      azimuth: deg(num(f.azimuth, at(fp, "azimuth"), { min: -360, max: 360 })),
    };
  }
  return {
    lights,
    backdrop: { color: rgb(b.color, at(bp, "color")), roughness: num(b.roughness, at(bp, "roughness"), unit) },
    world: {
      hdrId: text(w.hdrId, at(wp, "hdrId")),
      strength: num(w.strength, at(wp, "strength"), { min: 0, max: 1e4 }),
      rotationDeg: deg(num(w.rotationDeg, at(wp, "rotationDeg"), { min: -360, max: 360 })),
    },
    floorCards,
  };
}

function parseCamera(v: unknown, path: string): CameraSetup {
  const o = object(v, path);
  return {
    azimuth: deg(num(o.azimuth, at(path, "azimuth"), { min: -360, max: 360 })),
    elevation: deg(num(o.elevation, at(path, "elevation"), { min: -90, max: 90 })),
    distance: m(num(o.distance, at(path, "distance"), { gt: 0, max: 1000 })),
    target: vec3(o.target, at(path, "target")),
    focalMm: mm(num(o.focalMm, at(path, "focalMm"), { min: 8, max: 800 })),
    fStop: num(o.fStop, at(path, "fStop"), { min: 0.7, max: 64 }),
    focusPartPoint: o.focusPartPoint === null ? null : vec3(o.focusPartPoint, at(path, "focusPartPoint")),
  };
}

function parsePose(v: unknown, path: string): Pose {
  const o = object(v, path);
  return {
    turntableDeg: deg(num(o.turntableDeg, at(path, "turntableDeg"), { min: -3600, max: 3600 })),
    restFace: oneOf(o.restFace, at(path, "restFace"), REST_FACES),
  };
}

function parseOutput(v: unknown, path: string): OutputSetup {
  const o = object(v, path);
  const ap = at(path, "aspect");
  const a = object(o.aspect, ap);
  const vp = at(path, "viewTransform");
  const vt = object(o.viewTransform, vp);
  oneOf(vt.kind, at(vp, "kind"), ["agx"] as const);
  return {
    aspect: { w: num(a.w, at(ap, "w"), { gt: 0, max: 1000 }), h: num(a.h, at(ap, "h"), { gt: 0, max: 1000 }) },
    longEdgePx: num(o.longEdgePx, at(path, "longEdgePx"), { int: true, min: 16, max: 16384 }),
    samples: num(o.samples, at(path, "samples"), { int: true, min: 1, max: 65536 }),
    transparentBackground: bool(o.transparentBackground, at(path, "transparentBackground")),
    viewTransform: { kind: "agx", look: oneOf(vt.look, at(vp, "look"), AGX_LOOKS) },
    denoise: bool(o.denoise, at(path, "denoise")),
  };
}

/** Boundary check for imported/persisted JSON. Throws a DocumentError naming
 *  the field path. Everything past this trusts the types. Unknown fields are
 *  dropped. Only version 1 exists; a later format adds a migration here. */
export function parseDocument(json: unknown): BoothDocument {
  const o = object(json, "document");
  const version = o.version;
  if (version !== DOC_VERSION) fail("version", `unsupported document version ${JSON.stringify(version)}`);
  return {
    version: DOC_VERSION,
    slicing: parseSlicing(o.slicing, "slicing"),
    filament: parseFilament(o.filament, "filament"),
    studio: parseStudio(o.studio, "studio"),
    lookBase: o.lookBase === null ? null : oneOf(o.lookBase, "lookBase", LOOK_IDS),
    camera: parseCamera(o.camera, "camera"),
    pose: parsePose(o.pose, "pose"),
    output: parseOutput(o.output, "output"),
  };
}

/** PETG Basic under the studio look, the hero_light camera, 4:5 at 2000 px. */
export function defaultDocument(): BoothDocument {
  return {
    version: DOC_VERSION,
    slicing: { ...DEFAULT_SLICE },
    filament: {
      presetId: "petg-basic",
      recipe: structuredClone(FILAMENT_PRESETS["petg-basic"].recipe),
      gloss: DEFAULT_GLOSS,
      imperfections: { ...DEFAULT_IMPERFECTIONS },
      bed: "auto",
    },
    studio: structuredClone(LOOK_PRESETS.studio.studio),
    lookBase: "studio",
    camera: {
      azimuth: deg(0), elevation: deg(22), distance: m(0.8),
      target: [m(0), m(0), m(0.09)],
      focalMm: mm(85), fStop: 11, focusPartPoint: null,
    },
    pose: { turntableDeg: deg(0), restFace: "plate" },
    output: {
      aspect: { w: 4, h: 5 }, longEdgePx: 2000, samples: 256,
      transparentBackground: false,
      viewTransform: { kind: "agx", look: "medium-high-contrast" },
      denoise: true,
    },
  };
}
