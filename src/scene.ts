/**
 * scene.ts: compileScene(document, print) -> Scene. The single lowering.
 *
 * A Scene is everything a renderer needs, already decided, in Blender's
 * frame (Z up), metres, watts and linear colour. The preview, the Cycles
 * engine, the raster photo engine and native Blender (through sceneToJson)
 * read it and resolve nothing themselves. Pose, camera fit, light placement,
 * kelvin, the gloss curve and the per-layer roughness each live here once.
 *
 * Invariants:
 * - A Scene and everything in it is frozen. Holding a reference is a snapshot.
 * - A section (part, lights, backdrop, world, camera, film) keeps its object
 *   identity while its inputs are unchanged, so renderers diff with `===`.
 * - This file is pure: no three.js, no DOM, no workers. It runs in Node.
 */
import type {
  AgxLook, BoothDocument, CameraSetup, FilamentChoice, Imperfections, Metres, Pose, Rgb,
  Studio, StudioLight, Vec3,
} from "./document";
import type { BeadMesh, LoadedPrint, SlicedPrint } from "./print";

export type Mat4 = readonly number[]; // 16, column-major, Blender frame

export interface Scene {
  /** Booth's revision of the document this was compiled from. */
  readonly docRev: number;
  readonly part: PartSection | null;
  readonly lights: LightsSection;
  readonly backdrop: BackdropSection;
  readonly world: WorldSection;
  readonly camera: CameraSection;
  readonly film: FilmSection;
}

export interface PartSection {
  readonly mesh: BeadMesh;
  /** Part-local to world: rest face, floor re-centring, 20 um lift, turntable. */
  readonly toWorld: Mat4;
  readonly worldBounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly material: BeadMaterial;
}

/**
 * The one material both renderers build. Roughness at a vertex is
 *   clamp(layers.rough[layer * 4 + feature] + speedRel * speedGain + mottle, ROUGH_MIN, 1)
 * where speedRel = clamp(speed * SPEED_STEP_MMS / vRefMmS - 1, -1, 1) and
 * mottle = (noise(p * mottleScale) - 0.5) * mottleAmp with each renderer's
 * own noise. The preview reads `layers` as a data texture. The Cycles engine
 * expands it to a per-vertex attribute at upload.
 */
export interface BeadMaterial {
  readonly baseColor: Rgb;
  readonly ior: number;
  readonly anisotropy: number;
  readonly layers: LayerTable;
  readonly speedGain: number;
  readonly mottleScale: number; // per metre
  readonly mottleAmp: number;
  readonly plate: PlateFace;
  readonly overlay: "print" | "heat" | "speed"; // false colour, preview only
}
export const ROUGH_MIN = 0.05;

export interface LayerTable {
  readonly count: number;
  /** count * 4 values, indexed [layer * 4 + FeatureCode]: per-feature base
   *  after the gloss curve, plus per-layer sheen and heat gloss. */
  readonly rough: Float32Array;
  /** Per layer: scale on the vertical tilt of wall normals. 1 = untouched. */
  readonly flatten: Float32Array;
  /** Per layer: relative warmth, median 0, +-1 at the 90th / 10th percentile. */
  readonly heat: Float32Array;
}

/** The face printed on the bed: vertices with z <= print.PLATE_EPS. */
export interface PlateFace {
  readonly textured: boolean;
  readonly rough: number;
  readonly roughUnresolved: number; // preview only: grain under a pixel
  readonly grainPerM: number;
  readonly bumpDistanceM: number;
}

/** A rectangle in space. xAxis x yAxis = normal, which faces the subject. */
interface EmitterFrame {
  readonly id: string;
  readonly centre: Vec3;
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly normal: Vec3;
  readonly sizeM: readonly [number, number];
  readonly shape: "rect" | "ellipse";
  /** Linear, luminance 1. Power or radiance alone sets brightness. */
  readonly color: Rgb;
  /** Light linking: reaches the part only, never the backdrop. */
  readonly partOnly: boolean;
}
export interface AreaEmitter extends EmitterFrame {
  readonly kind: "area";
  readonly powerW: number;   // Blender area light power
  readonly spreadRad: number;
}
/** A card glowing with a vertical gradient. Invisible to the camera. */
export interface ScrimEmitter extends EmitterFrame {
  readonly kind: "scrim";
  readonly topRadiance: number;
  readonly bottomRadiance: number;
}
export type Emitter = AreaEmitter | ScrimEmitter;

/** An emissive ring on the floor around the part that only glossy rays see. */
export interface FloorCardRing {
  readonly centre: Vec3;
  readonly innerRadiusM: number;
  readonly outerRadiusM: number;
  readonly keyRadiance: number;
  readonly farRadiance: number;
  readonly keyAzimuthRad: number;
}

export interface LightsSection {
  /** Lights switched off in the document are already left out. */
  readonly emitters: readonly Emitter[];
  readonly floorCards: FloorCardRing | null;
  /** The point lights aim at and the reflection bake is taken from. */
  readonly aim: Vec3;
}

export interface BackdropSection {
  /** Sweep triangles: floor, cove, wall. Every renderer gets the same mesh. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly index: Uint32Array;
  readonly albedo: Rgb;
  readonly roughness: number;
  /** True when the film is transparent: it only catches shadows. */
  readonly shadowCatcher: boolean;
}

/** rotationRad is about +Z, as Blender's Mapping node applies it. */
export interface WorldSection {
  readonly hdrId: string;
  readonly strength: number;
  readonly rotationRad: number;
}

export interface CameraSection {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly focalMm: number;
  readonly sensorMm: 36;
  /** Vertical field of view after Blender's AUTO sensor fit. */
  readonly fovYRad: number;
  readonly fStop: number;
  readonly apertureRadiusM: number;
  readonly focusDistanceM: number;
  readonly clipStartM: number;
}

/** Every render setting is explicit, so the browser and native Blender
 *  cannot differ through a default nobody wrote down. */
export interface FilmSection {
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly adaptiveThreshold: number;
  readonly maxBounces: number;
  readonly diffuseBounces: number;
  readonly glossyBounces: number;
  readonly transmissionBounces: number;
  readonly clampDirect: number;
  readonly clampIndirect: number;
  readonly filterWidthPx: number; // Blackman-Harris
  readonly transparent: boolean;
  readonly denoise: boolean;
  readonly look: AgxLook;
}

/** Blender 5.2.3 factory values (dumped from the build, tools/blender/dump_defaults.py),
 *  with the four the reference stills override: samples, adaptive threshold,
 *  glossy bounces and the look. */
export const FILM_DEFAULTS = {
  adaptiveThreshold: 0.004,
  maxBounces: 12,
  diffuseBounces: 4,
  glossyBounces: 8,
  transmissionBounces: 12,
  clampDirect: 0,
  clampIndirect: 10,
  filterWidthPx: 1.5,
} as const;

/**
 * Pass the previous scene so unchanged sections keep their identity.
 * With no print, `part` is null and the studio still compiles.
 */
export function compileScene(
  doc: BoothDocument, print: LoadedPrint | null, docRev: number, previous?: Scene,
): Scene {
  throw new Error("not implemented");
  // TODO: solvePose -> studioAim -> solveCamera (focus through the pose) ->
  //       solveLight per light that is on -> resolveMaterial -> sweepMesh -> film.
  //       Reuse previous.<section> when a deep comparison of the new value says equal.
}

/** Rest face down, bbox centred on the turntable axis, min z = 2e-5, then turntable about Z. */
export function solvePose(pose: Pose, bbox: BeadMesh["bboxM"]): Mat4 {
  throw new Error("not implemented");
}

/** Lights aim at the posed part's centre. It does not move with the turntable. */
export function studioAim(part: PartSection | null): Vec3 {
  throw new Error("not implemented"); // TODO: (0, 0, half the posed height); (0, 0, 0.09) with no part
}

export function solveCamera(cam: CameraSetup, partToWorld: Mat4 | null, width: number, height: number): CameraSection {
  throw new Error("not implemented");
  // TODO: spherical about target -> position. Sensor 36 mm across the long edge:
  //       fovY = 2 * atan((18 / focal) * min(1, height / width)).
  //       focus distance = |position - partToWorld * focusPartPoint|, or the orbit distance.
  //       apertureRadiusM = focalMm / fStop / 2 / 1000.
}

/** A focal length change that keeps the framing: distance scales with focal length. */
export function refocal(cam: CameraSetup, focalMm: number): CameraSetup {
  throw new Error("not implemented");
}

/** Spherical placement about `aim` to a frame whose normal faces `aim`.
 *  yAxis is the world up projected onto the card, as Blender's track-to with up Y. */
export function solveLight(light: StudioLight, aim: Vec3): Emitter {
  throw new Error("not implemented");
}

/** Kelvin to linear RGB at luminance 1. */
export function kelvinToRgb(kelvin: number): Rgb {
  throw new Error("not implemented");
}

export function resolveMaterial(f: FilamentChoice, mesh: BeadMesh, sliced: SlicedPrint): BeadMaterial {
  throw new Error("not implemented");
  // TODO: sRGB hex -> linear. Gloss curve per feature. Layer sheen from a seeded
  //       random per layer (amplitude 0.05 * vary). Heat from layerHeatCurve,
  //       heat gloss -0.0625 per unit, speed gain 0.0875 * speedGloss, flatten
  //       1 - softLines * 0.21 * clamp(heat, 0, 1). Mottle 300 per metre, 0.03 * vary.
  //       Bed: auto -> the file's bed -> textured. Grain 1000 / 0.17 per metre.
}

/** Per-layer warmth from print timing: h = 1 / (1 + t * (1 + fanCooling * fan) / tau),
 *  rescaled per part to median 0 and +-1 at the 90th and 10th percentiles. */
export function layerHeatCurve(sliced: SlicedPrint, imp: Imperfections): Float32Array {
  throw new Error("not implemented");
}

/** The render.py sweep: floor from y = -4 to 0.45, a 0.6 m cove in 16 steps, wall at y = 1.05 up to z = 4, 8 m wide. */
export function sweepMesh(): Pick<BackdropSection, "positions" | "normals" | "index"> {
  throw new Error("not implemented");
}

/** Width and height in pixels from the aspect and the long edge. */
export function filmSize(aspect: { w: number; h: number }, longEdgePx: number): { width: number; height: number } {
  throw new Error("not implemented");
}

/** Camera distance so a freshly opened part fills the frame at the current focal length. */
export function framePart(mesh: BeadMesh, cam: CameraSetup, aspect: { w: number; h: number }): Partial<CameraSetup> {
  throw new Error("not implemented");
}

/** Everything but the mesh buffers, for tools/blender/render_scene.py. Typed
 *  arrays are written next to it by the caller and referenced by name. */
export function sceneToJson(scene: Scene): string {
  throw new Error("not implemented");
}

export type { Metres, Studio };
