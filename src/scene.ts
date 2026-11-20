/**
 * scene.ts: compileScene(document, print) -> Scene. The single lowering.
 *
 * A Scene is everything a renderer needs, already decided, in Blender's
 * frame (Z up), metres, watts and linear colour. The preview, the Cycles
 * engine, the raster photo engine and native Blender (through exportScene)
 * read it and resolve nothing themselves. Pose, camera fit, light placement,
 * kelvin, the gloss curve and the per-layer roughness each live here once.
 *
 * Invariants:
 * - A Scene and everything in it is frozen. Holding a reference is a snapshot. One exception: the
 *   part's BeadMesh.hidden arrives once, after the mesh (print.ts hiddenFacesSettled).
 * - A section (part, lights, backdrop, world, camera, film, props) keeps its
 *   object identity while its inputs are unchanged, so renderers diff with `===`.
 * - This file is pure: no three.js, no DOM, no workers. It runs in Node.
 */
import {
  DEFAULT_GLOSS, deg, m, mm,
  type AgxLook, type BedType, type BoothDocument, type CameraSetup, type Degrees, type FeatureCode, type FilamentChoice,
  type Imperfections, type Metres, type Pose, type PropShape, type Rgb, type Studio, type StudioLight, type StudioProp, type Vec3,
} from "./document";
import { BEAD_WORD, type BeadMesh, type LoadedPrint, type SlicedPrint } from "./print";

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
  /** Props switched on, in document order. A mesh prop whose mesh is not loaded this session is left out. */
  readonly props: readonly PropItem[];
}

/**
 * Triangles in a prop's own frame, metres, Z up. Every corner has its normal:
 * a hard edge splits its vertices, so a renderer shades with the normals as
 * given and never derives its own.
 */
export interface PropGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly index: Uint32Array;
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

/** One prop, ready to draw: a Principled BSDF at factory settings but for base colour and roughness. */
export interface PropItem {
  readonly id: string;
  /** Shared between props of the same shape and segments, and kept by reference while they last. */
  readonly geometry: PropGeometry;
  /** Prop-local to world: translate(location) * Rz * Ry * Rx * scale(scale * size), Blender's
   *  XYZ Euler. Not a rigid motion, so normals take its inverse transpose. */
  readonly toWorld: Mat4;
  readonly albedo: Rgb;
  readonly roughness: number;
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

/**
 * An emissive disc on the floor around the part, so the walls of a dark glossy
 * part mirror a lit table. Only glossy rays see it: not the camera, not
 * diffuse light, not shadows. It is light-linked to the part, so the backdrop's
 * own glossy lobe never reflects it either.
 *
 * Azimuth is the convention of document.ts: degrees from -Y turning towards
 * +X. At a floor point (x, y) at distance r from `centre`,
 *   theta = atan2(x - centre.x, -(y - centre.y)),
 *   w = ((1 + cos(theta - keyAzimuthRad)) / 2)^2,
 *   radiance = (farRadiance + (keyRadiance - farRadiance) * w)
 *              * (1 - smoothstep(innerRadiusM, outerRadiusM, r)).
 * So the key side (theta = keyAzimuthRad) has `keyRadiance`, the points 90
 * degrees round have a quarter of the way from far to key, and the opposite
 * side has `farRadiance`. Full strength out to `innerRadiusM`, falling to zero
 * at `outerRadiusM`. Radiance is Blender emission strength. These are the old
 * bake's numbers (index.html:480), minus its preview GAIN. The Cycles engine
 * (cycles/api/scene.cpp) and tools/blender/render_scene.py build exactly this.
 */
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
  /** Seconds of sampling after which the photo is developed as it stands. 0 means no limit. Only the desk reads it. */
  readonly timeLimitS: number;
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


// ---- constants carried over from the old viewer and render.py ---------------

/** The part rests 20 um above the floor so it is not coplanar with the sweep. */
const LIFT_M = 2e-5;
const DEFAULT_AIM: V3 = [0, 0, 0.09];
const FLOOR_CARD_INNER_M = 0.3;
const FLOOR_CARD_OUTER_M = 0.8;
const CLIP_START_M = 0.01;
const FRAME_MARGIN = 1.08;
/** Gloss spans this many stops of exponent either side of the recipe. */
const GLOSS_STOPS = 1.25;
const SHEEN_AMPLITUDE = 0.05;
const SHEEN_SEED = 0x5ee7c0de;
const HEAT_GLOSS_PER_UNIT = -0.0625;
const SPEED_GLOSS_GAIN = 0.0875;
const SOFT_LINES_FLATTEN = 0.21;
const MOTTLE_SCALE_PER_M = 300;
const MOTTLE_PEAK_TO_PEAK = 0.06;
const GRAIN_PER_M = 1000 / 0.17;
const PLATE_BUMP_M = 5e-5;

// ---- small vector helpers (plain numbers inside, branded at the boundary) ---

type V3 = readonly [number, number, number];
const vec = (v: V3): Vec3 => [m(v[0]), m(v[1]), m(v[2])];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const unitOf = (a: V3): V3 => scale(a, 1 / length(a));
const rad = (d: number): number => (d * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Offset of azimuth/elevation/distance, in the convention of document.ts. */
export function sphericalOffset(azimuthDeg: number, elevationDeg: number, distance: number): V3 {
  const az = rad(azimuthDeg), el = rad(elevationDeg);
  return [distance * Math.sin(az) * Math.cos(el), -distance * Math.cos(az) * Math.cos(el), distance * Math.sin(el)];
}

/**
 * The inverse of sphericalOffset: where `point` sits about `centre`. Azimuth
 * is in (-180, 180], and 0 straight above or below the centre, where every
 * azimuth names the same point. Throws a RangeError when the point is the centre.
 */
export function sphericalAbout(centre: V3, point: V3): { readonly azimuth: Degrees; readonly elevation: Degrees; readonly distance: Metres } {
  const [x, y, z] = sub(point, centre);
  const distance = Math.hypot(x, y, z);
  if (distance === 0) throw new RangeError("the point is the centre, so it has no direction from it");
  const flat = Math.hypot(x, y);
  const azimuth = flat === 0 ? 0 : (Math.atan2(x, -y) * 180) / Math.PI;
  return {
    azimuth: deg(azimuth === -180 ? 180 : azimuth),
    elevation: deg((Math.atan2(z, flat) * 180) / Math.PI),
    distance: m(distance),
  };
}

export function transformPoint(mat: Mat4, p: V3): V3 {
  return [
    mat[0] * p[0] + mat[4] * p[1] + mat[8] * p[2] + mat[12],
    mat[1] * p[0] + mat[5] * p[1] + mat[9] * p[2] + mat[13],
    mat[2] * p[0] + mat[6] * p[1] + mat[10] * p[2] + mat[14],
  ];
}

function corners(b: { readonly min: V3; readonly max: V3 }): V3[] {
  const out: V3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

function boundsOf(points: readonly V3[]): { min: V3; max: V3 } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return { min, max };
}

// ---- compile -----------------------------------------------------------------

/** Structural equality over plain data and typed arrays (compared byte for byte). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.hasOwn(b, k) && same(Reflect.get(a, k), Reflect.get(b, k)));
}

/** Freezes plain data. Typed arrays cannot be frozen, and `skip` (the print's
 *  mesh, which print.ts owns and the LoadedPrint shares) is left alone. */
function freezeDeep<T>(value: T, skip?: object): T {
  if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || value === skip || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child, skip);
  return value;
}

/** The previous value when `next` equals it, else `next`, frozen. */
function keep<T>(prev: T | undefined, next: T): T {
  return prev !== undefined && same(prev, next) ? prev : freezeDeep(next);
}

/**
 * Pass the previous scene so unchanged sections keep their identity. The
 * reuse is as fine as the data: an edited light keeps every other emitter,
 * a turntable turn keeps the part's material. The mesh is compared by
 * reference, never by content.
 * With no print, `part` is null and the studio still compiles.
 */
export function compileScene(
  doc: BoothDocument, print: LoadedPrint | null, docRev: number, previous?: Scene,
  meshes: ReadonlyMap<string, PropGeometry> = NO_MESHES,
): Scene {
  const { width, height } = filmSize(doc.output.aspect, doc.output.longEdgePx);
  const film = keep<FilmSection>(previous?.film, {
    width, height, samples: doc.output.samples, timeLimitS: doc.output.timeLimitS, ...FILM_DEFAULTS,
    transparent: doc.output.transparentBackground, denoise: doc.output.denoise, look: doc.output.viewTransform.look,
  });

  const part = print === null ? null : compilePart(doc, print, previous?.part ?? null);
  const aim = keep(previous?.lights.aim, studioAim(part));

  const prevEmitters = new Map((previous?.lights.emitters ?? []).map((e) => [e.id, e]));
  const solved = doc.studio.lights.filter((l) => l.on).map((l) => keep<Emitter>(prevEmitters.get(l.id), solveLight(l, aim)));
  const oldEmitters = previous?.lights.emitters;
  const emitters = oldEmitters && oldEmitters.length === solved.length && solved.every((e, i) => e === oldEmitters[i])
    ? oldEmitters
    : Object.freeze(solved);
  const fc = doc.studio.floorCards;
  const floorCards = keep<FloorCardRing | null>(previous?.lights.floorCards, fc === null ? null : {
    centre: vec([0, 0, 0]), innerRadiusM: FLOOR_CARD_INNER_M, outerRadiusM: FLOOR_CARD_OUTER_M,
    keyRadiance: fc.keySide, farRadiance: fc.farSide, keyAzimuthRad: rad(fc.azimuth),
  });
  const pl = previous?.lights;
  const lights = pl && pl.emitters === emitters && pl.floorCards === floorCards && pl.aim === aim
    ? pl
    : Object.freeze({ emitters, floorCards, aim });

  const sweep = sharedSweep();
  const backdrop = keep<BackdropSection>(previous?.backdrop, {
    ...sweep, albedo: [...doc.studio.backdrop.color], roughness: doc.studio.backdrop.roughness,
    shadowCatcher: doc.output.transparentBackground,
  });
  const w = doc.studio.world;
  const world = keep<WorldSection>(previous?.world, { hdrId: w.hdrId, strength: w.strength, rotationRad: rad(w.rotationDeg) });
  const camera = keep(previous?.camera, solveCamera(doc.camera, part?.toWorld ?? null, width, height));
  const props = compileProps(doc.props, meshes, previous?.props);

  return Object.freeze({ docRev, part, lights, backdrop, world, camera, film, props });
}

const NO_MESHES: ReadonlyMap<string, PropGeometry> = new Map();

function compileProps(props: readonly StudioProp[], meshes: ReadonlyMap<string, PropGeometry>, prev: readonly PropItem[] | undefined): readonly PropItem[] {
  const before = new Map((prev ?? []).map((p) => [p.id, p]));
  const items: PropItem[] = [];
  for (const p of props) {
    if (!p.on) continue;
    const geometry = p.shape === "mesh" ? (p.mesh === null ? undefined : meshes.get(p.mesh)) : primitiveGeometry(p.shape, p.segments);
    if (geometry === undefined) continue;
    const old = before.get(p.id);
    const next = { id: p.id, geometry, toWorld: propMatrix(p), albedo: [...p.color] as Rgb, roughness: p.roughness };
    // The geometry is compared by reference: the same shape and segments give the same object.
    items.push(old && old.geometry === geometry && same({ ...old, geometry: null }, { ...next, geometry: null })
      ? old
      : freezeDeep(next));
  }
  return prev && prev.length === items.length && items.every((p, i) => p === prev[i]) ? prev : Object.freeze(items);
}

/** translate(location) * Rz * Ry * Rx * scale(scale * size): Blender's object matrix for an XYZ Euler. */
export function propMatrix(p: Pick<StudioProp, "location" | "rotationDeg" | "scale" | "size">): Mat4 {
  const [cx, cy, cz] = p.rotationDeg.map((d) => Math.cos(rad(d)));
  const [sx, sy, sz] = p.rotationDeg.map((d) => Math.sin(rad(d)));
  // Columns of Rz * Ry * Rx.
  const x: V3 = [cy * cz, cy * sz, -sy];
  const y: V3 = [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy];
  const z: V3 = [cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy];
  const k = [0, 1, 2].map((i) => p.scale[i] * p.size[i]);
  return [
    ...scale(x, k[0]), 0, ...scale(y, k[1]), 0, ...scale(z, k[2]), 0,
    p.location[0], p.location[1], p.location[2], 1,
  ];
}

// ---- prop geometry ---------------------------------------------------------------

/** Above this many segments a curved side is smooth: each step turns by less than 30 degrees, Blender's auto smooth angle. */
export const SMOOTH_ABOVE_SEGMENTS = 12;

/** Triangles with a normal per corner, written out unwelded. Primitives are small, so the copies cost nothing. */
class Triangles {
  readonly #p: number[] = [];
  readonly #n: number[] = [];
  add(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3): void {
    this.#p.push(...a, ...b, ...c);
    this.#n.push(...na, ...nb, ...nc);
  }
  /** One triangle with its face normal, so it shades flat. */
  flat(a: V3, b: V3, c: V3): void {
    const n = cross(sub(b, a), sub(c, a));
    const len = length(n);
    const unit: V3 = len > 0 ? scale(n, 1 / len) : [0, 0, 1];
    this.add(a, b, c, unit, unit, unit);
  }
  quad(a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3): void {
    this.add(a, b, c, na, nb, nc);
    this.add(a, c, d, na, nc, nd);
  }
  build(): PropGeometry {
    const positions = Float32Array.from(this.#p);
    const index = new Uint32Array(positions.length / 3);
    for (let i = 0; i < index.length; i++) index[i] = i;
    return { positions, normals: Float32Array.from(this.#n), index, bounds: boundsOfPositions(positions) };
  }
}

function boundsOfPositions(positions: Float32Array): PropGeometry["bounds"] {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  }
  return positions.length === 0
    ? { min: vec([0, 0, 0]), max: vec([0, 0, 0]) }
    : { min: vec([min[0], min[1], min[2]]), max: vec([max[0], max[1], max[2]]) };
}

function cube(): PropGeometry {
  const t = new Triangles();
  // Each face: its outward normal and two axes with u x v = normal, so the quad winds outward.
  const faces: [V3, V3, V3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [n, u, v] of faces) {
    const c = scale(n, 0.5);
    const at = (a: number, b: number): V3 => add(c, add(scale(u, a * 0.5), scale(v, b * 0.5)));
    t.quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), n, n, n, n);
  }
  return t.build();
}

function plane(): PropGeometry {
  const t = new Triangles();
  const up: V3 = [0, 0, 1];
  t.quad([-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], up, up, up, up);
  return t.build();
}

function ring(segments: number, k: number, r: number, z: number): V3 {
  const a = (2 * Math.PI * k) / segments;
  return [r * Math.cos(a), r * Math.sin(a), z];
}

function cylinder(segments: number): PropGeometry {
  const t = new Triangles();
  const smooth = segments > SMOOTH_ABOVE_SEGMENTS;
  const up: V3 = [0, 0, 1], down: V3 = [0, 0, -1];
  for (let k = 0; k < segments; k++) {
    const [b0, b1, t0, t1] = [ring(segments, k, 0.5, -0.5), ring(segments, k + 1, 0.5, -0.5), ring(segments, k, 0.5, 0.5), ring(segments, k + 1, 0.5, 0.5)];
    if (smooth) {
      const n0 = ring(segments, k, 1, 0), n1 = ring(segments, k + 1, 1, 0);
      t.quad(b0, b1, t1, t0, n0, n1, n1, n0);
    } else {
      t.flat(b0, b1, t1);
      t.flat(b0, t1, t0);
    }
    t.add([0, 0, 0.5], t0, t1, up, up, up);
    t.add([0, 0, -0.5], b1, b0, down, down, down);
  }
  return t.build();
}

function sphere(segments: number): PropGeometry {
  const t = new Triangles();
  const rings = Math.max(2, Math.round(segments / 2));
  const smooth = segments > SMOOTH_ABOVE_SEGMENTS;
  const point = (k: number, j: number): V3 => {
    const theta = (Math.PI * j) / rings; // from the top pole
    const a = (2 * Math.PI * k) / segments;
    return [Math.sin(theta) * Math.cos(a), Math.sin(theta) * Math.sin(a), Math.cos(theta)];
  };
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < segments; k++) {
      const [n00, n10, n01, n11] = [point(k, j), point(k + 1, j), point(k, j + 1), point(k + 1, j + 1)];
      const [p00, p10, p01, p11] = [n00, n10, n01, n11].map((n) => scale(n, 0.5));
      // The poles are fans: a quad there would have a zero-area half.
      if (j > 0) {
        if (smooth) t.add(p00, p01, p10, n00, n01, n10);
        else t.flat(p00, p01, p10);
      }
      if (j < rings - 1) {
        if (smooth) t.add(p10, p01, p11, n10, n01, n11);
        else t.flat(p10, p01, p11);
      }
    }
  }
  return t.build();
}

const primitiveCache = new Map<string, PropGeometry>();

/** The shared geometry of a primitive, 1 m across. A cube and a plane ignore `segments`. */
export function primitiveGeometry(shape: Exclude<PropShape, "mesh">, segments: number): PropGeometry {
  const key = shape === "cube" || shape === "plane" ? shape : `${shape}:${segments}`;
  let g = primitiveCache.get(key);
  if (g === undefined) {
    g = freezeDeep(shape === "cube" ? cube() : shape === "plane" ? plane() : shape === "cylinder" ? cylinder(segments) : sphere(segments));
    primitiveCache.set(key, g);
  }
  return g;
}

/**
 * An STL's triangle soup (millimetres, nine floats a triangle) as a prop's
 * geometry in metres, shaded flat. Its origin moves to the middle of its base,
 * so a prop at location z = 0 stands on the floor.
 */
export function stlPropGeometry(soupMm: Float32Array): PropGeometry {
  const ntris = Math.floor(soupMm.length / 9);
  if (ntris === 0) throw new Error("the STL has no triangles");
  const raw = boundsOfPositions(soupMm.subarray(0, ntris * 9));
  const shift: V3 = [-(raw.min[0] + raw.max[0]) / 2, -(raw.min[1] + raw.max[1]) / 2, -raw.min[2]];
  const positions = new Float32Array(ntris * 9);
  const normals = new Float32Array(ntris * 9);
  for (let t = 0; t < ntris; t++) {
    const corner = (c: number): V3 => {
      const i = t * 9 + c * 3;
      return [(soupMm[i] + shift[0]) / 1000, (soupMm[i + 1] + shift[1]) / 1000, (soupMm[i + 2] + shift[2]) / 1000];
    };
    const [a, b, c] = [corner(0), corner(1), corner(2)];
    const n = cross(sub(b, a), sub(c, a));
    const len = length(n);
    const unit: V3 = len > 0 ? scale(n, 1 / len) : [0, 0, 1];
    positions.set([...a, ...b, ...c], t * 9);
    for (let k = 0; k < 3; k++) normals.set(unit, t * 9 + k * 3);
  }
  const index = new Uint32Array(ntris * 3);
  for (let i = 0; i < index.length; i++) index[i] = i;
  return freezeDeep({ positions, normals, index, bounds: boundsOfPositions(positions) });
}

/** A prop's world bounding box: its geometry's box through its matrix. */
export function propWorldBounds(item: Pick<PropItem, "geometry" | "toWorld">): { min: Vec3; max: Vec3 } {
  const { min, max } = boundsOf(corners(item.geometry.bounds).map((c) => transformPoint(item.toWorld, c)));
  return { min: vec(min), max: vec(max) };
}

function compilePart(doc: BoothDocument, print: LoadedPrint, prev: PartSection | null): PartSection {
  const { mesh, sliced } = print;
  const toWorld = keep(prev?.toWorld, solvePose(doc.pose, mesh.bboxM));
  const { min, max } = boundsOf(corners({ min: mesh.bboxM.min, max: mesh.bboxM.max }).map((p) => transformPoint(toWorld, p)));
  const worldBounds = keep(prev?.worldBounds, { min: vec(min), max: vec(max) });
  const material = keep(prev?.material, resolveMaterial(doc.filament, mesh, sliced));
  if (prev && prev.mesh === mesh && prev.toWorld === toWorld && prev.worldBounds === worldBounds && prev.material === material) return prev;
  return freezeDeep({ mesh, toWorld, worldBounds, material }, mesh);
}

// ---- pose and aim ------------------------------------------------------------

/** Row-major 3x3 turning each printed face to face down (its normal to -Z). */
const FACE_ROTATION: Record<Pose["restFace"], readonly number[]> = {
  plate: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  top: [1, 0, 0, 0, -1, 0, 0, 0, -1],
  front: [1, 0, 0, 0, 0, -1, 0, 1, 0],
  back: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  right: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  left: [0, 0, -1, 0, 1, 0, 1, 0, 0],
};

/** Rest face down, bbox centred on the turntable axis, min z = 2e-5, then turntable about Z. */
export function solvePose(pose: Pose, bbox: BeadMesh["bboxM"]): Mat4 {
  const r = FACE_ROTATION[pose.restFace];
  const rotate = (p: V3): V3 => [
    r[0] * p[0] + r[1] * p[1] + r[2] * p[2],
    r[3] * p[0] + r[4] * p[1] + r[5] * p[2],
    r[6] * p[0] + r[7] * p[1] + r[8] * p[2],
  ];
  const { min, max } = boundsOf(corners(bbox).map(rotate));
  const t: V3 = [-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, LIFT_M - min[2]];
  const c = Math.cos(rad(pose.turntableDeg)), s = Math.sin(rad(pose.turntableDeg));
  const spin = (p: V3): V3 => [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
  const col = (e: V3): V3 => spin(rotate(e));
  const [x, y, z] = [col([1, 0, 0]), col([0, 1, 0]), col([0, 0, 1])];
  const o = spin(t);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
}

/** Lights aim at the posed part's centre. It does not move with the turntable. */
export function studioAim(part: PartSection | null): Vec3 {
  if (part === null) return vec(DEFAULT_AIM);
  return vec([0, 0, (part.worldBounds.max[2] - part.worldBounds.min[2]) / 2]);
}

// ---- camera ------------------------------------------------------------------

export function solveCamera(cam: CameraSetup, partToWorld: Mat4 | null, width: number, height: number): CameraSection {
  const target: V3 = cam.target;
  const position = add(target, sphericalOffset(cam.azimuth, cam.elevation, cam.distance));
  const forward = unitOf(sub(target, position));
  const az = rad(cam.azimuth), el = rad(cam.elevation);
  // Blender's track-to (-Z at the target, up Y towards world Z) in closed form: finite at +-90 degrees.
  const up: V3 = [-Math.sin(el) * Math.sin(az), Math.sin(el) * Math.cos(az), Math.cos(el)];
  // Focus is a plane, so a clicked point sets its depth along the view axis, as Blender's DOF distance is.
  let focusDistanceM: number = cam.distance;
  if (cam.focusPartPoint !== null && partToWorld !== null) {
    const depth = dot(sub(transformPoint(partToWorld, cam.focusPartPoint), position), forward);
    if (depth > CLIP_START_M) focusDistanceM = depth;
  }
  return {
    position: vec(position), target: vec(target), up: vec(up),
    focalMm: cam.focalMm, sensorMm: 36,
    fovYRad: 2 * Math.atan((18 / cam.focalMm) * Math.min(1, height / width)),
    fStop: cam.fStop,
    apertureRadiusM: cam.focalMm / cam.fStop / 2 / 1000,
    focusDistanceM,
    clipStartM: CLIP_START_M,
  };
}

/** A focal length change that keeps the framing: distance scales with focal length. */
export function refocal(cam: CameraSetup, focalMm: number): CameraSetup {
  return { ...cam, focalMm: mm(focalMm), distance: m((cam.distance * focalMm) / cam.focalMm) };
}

/** Width and height in pixels from the aspect and the long edge. */
export function filmSize(aspect: { w: number; h: number }, longEdgePx: number): { width: number; height: number } {
  const short = Math.max(1, Math.round((longEdgePx * Math.min(aspect.w, aspect.h)) / Math.max(aspect.w, aspect.h)));
  return aspect.w >= aspect.h ? { width: longEdgePx, height: short } : { width: short, height: longEdgePx };
}

/** Camera distance so a freshly opened part, as printed, fills the frame at the
 *  current focal length: its bounding sphere just inside the narrower half-angle. */
export function framePart(mesh: BeadMesh, cam: CameraSetup, aspect: { w: number; h: number }): Partial<CameraSetup> {
  const size = sub(mesh.bboxM.max, mesh.bboxM.min);
  const half = Math.atan((18 / cam.focalMm) * Math.min(1, aspect.w / aspect.h, aspect.h / aspect.w));
  return {
    distance: m((length(size) / 2 / Math.sin(half)) * FRAME_MARGIN),
    target: [m(0), m(0), m(size[2] / 2)],
  };
}

// ---- lights ------------------------------------------------------------------

/** Spherical placement about `aim` to a frame whose normal faces `aim`.
 *  yAxis is the world up projected onto the card, as Blender's track-to with up Y. */
export function solveLight(light: StudioLight, aim: Vec3): Emitter {
  const centre = add(aim, sphericalOffset(light.azimuth, light.elevation, light.distance));
  const normal = unitOf(sub(aim, centre));
  // Blender picks y = +Y when the aim is within a hair of vertical; everywhere else it is continuous.
  const yAxis: V3 = Math.hypot(normal[0], normal[1]) < 1e-4
    ? [0, 1, 0]
    : unitOf(sub([0, 0, 1], scale(normal, normal[2])));
  const frame = {
    id: light.id, centre: vec(centre), xAxis: vec(cross(yAxis, normal)), yAxis: vec(yAxis), normal: vec(normal),
    sizeM: [light.width, light.height] as const, shape: light.shape,
    color: lightColor(light), partOnly: light.partOnly,
  };
  return light.kind === "area"
    ? { ...frame, kind: "area", powerW: light.powerW, spreadRad: rad(light.spreadDeg) }
    : { ...frame, kind: "scrim", topRadiance: light.topRadiance, bottomRadiance: light.bottomRadiance };
}

function lightColor(light: StudioLight): Rgb {
  if (light.color.kind === "kelvin") return kelvinToRgb(light.color.kelvin);
  const [r, g, b] = light.color.rgb;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0 ? [r / lum, g / lum, b / lum] : [1, 1, 1];
}

/**
 * Kelvin to linear Rec.709 RGB at luminance 1: the Planckian locus by Kim et
 * al.'s cubic fit (chromaticity valid 1667..25000 K, clamped outside), taken
 * to XYZ at Y = 1 and to linear sRGB, negatives clipped, then renormalised.
 */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = clamp(kelvin, 1667, 25000);
  const x = t < 4000
    ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
    : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y = t < 2222
    ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
    : t < 4000
      ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const X = x / y, Z = (1 - x - y) / y;
  const r = Math.max(0, 3.2404542 * X - 1.5371385 - 0.4985314 * Z);
  const g = Math.max(0, -0.969266 * X + 1.8760108 + 0.041556 * Z);
  const b = Math.max(0, 0.0556434 * X - 0.2040259 + 1.0572252 * Z);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / lum, g / lum, b / lum];
}

// ---- material ----------------------------------------------------------------

/**
 * The gloss slider, defined once. Every roughness r in the recipe becomes
 * r ** p with p = 2 ** (2 * GLOSS_STOPS * (gloss - DEFAULT_GLOSS)), so gloss 0
 * and 1 sit GLOSS_STOPS either side of the recipe. Gloss DEFAULT_GLOSS gives
 * p = 1, the recipe untouched. A larger gloss gives a larger p and so a smaller
 * roughness, since r < 1. The curve is monotonic in gloss, keeps the order of the four
 * features, and never leaves 0..1.
 */
export function glossRoughness(r: number, gloss: number): number {
  return r ** (2 ** (2 * GLOSS_STOPS * (gloss - DEFAULT_GLOSS)));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function hexToLinear(hex: string): Rgb {
  const ch = (i: number) => srgbToLinear(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
  return [ch(0), ch(1), ch(2)];
}

export function resolveMaterial(f: FilamentChoice, mesh: BeadMesh, sliced: SlicedPrint): BeadMaterial {
  const { recipe, imperfections: imp } = f;
  const count = clamp(Math.max(mesh.layerCount + 1, sliced.layerTimeS.length), 1, BEAD_WORD.layer.size);
  const heat = layerHeatCurve(sliced, imp);
  const next = mulberry32(SHEEN_SEED);
  const base = ([0, 1, 2, 3] as const).map((code: FeatureCode) => glossRoughness(recipe.roughness[code], f.gloss));
  const rough = new Float32Array(count * 4);
  const flatten = new Float32Array(count);
  const warmth = new Float32Array(count);
  for (let layer = 0; layer < count; layer++) {
    const h = heat[layer] ?? 0;
    const sheen = (next() - 0.5) * SHEEN_AMPLITUDE * recipe.vary;
    for (let code = 0; code < 4; code++) rough[layer * 4 + code] = base[code] + sheen + h * imp.heatGloss * HEAT_GLOSS_PER_UNIT;
    flatten[layer] = 1 - imp.softLines * SOFT_LINES_FLATTEN * clamp(h, 0, 1);
    warmth[layer] = h;
  }
  const bed: BedType = f.bed === "auto" ? sliced.bedFromFile ?? "textured-pei" : f.bed;
  const plate: PlateFace = bed === "textured-pei"
    ? { textured: true, rough: recipe.peiRough, roughUnresolved: recipe.peiFarRough, grainPerM: GRAIN_PER_M, bumpDistanceM: PLATE_BUMP_M }
    : { textured: false, rough: base[0], roughUnresolved: base[0], grainPerM: 0, bumpDistanceM: 0 };
  return {
    baseColor: hexToLinear(recipe.colorHex), ior: recipe.ior, anisotropy: recipe.anisotropy,
    layers: { count, rough, flatten, heat: warmth },
    speedGain: SPEED_GLOSS_GAIN * imp.speedGloss,
    mottleScale: MOTTLE_SCALE_PER_M, mottleAmp: MOTTLE_PEAK_TO_PEAK * recipe.vary,
    plate, overlay: imp.overlay,
  };
}

/** Per-layer warmth from print timing: h = 1 / (1 + t * (1 + fanCooling * fan) / tau),
 *  rescaled per part to median 0 and +-1 at the 90th and 10th percentiles. */
export function layerHeatCurve(sliced: SlicedPrint, imp: Imperfections): Float32Array {
  const n = sliced.layerTimeS.length;
  const h = new Float64Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    const t = sliced.layerTimeS[k];
    if (t > 0) h[k] = 1 / (1 + (t * (1 + imp.fanCooling * (sliced.layerFan[k] ?? 0))) / imp.tauS);
  }
  const ok = Array.from(h).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  const out = new Float32Array(n);
  if (ok.length === 0) return out;
  const at = (q: number) => ok[Math.floor(q * (ok.length - 1))];
  const med = at(0.5);
  const lo = Math.max(med - at(0.1), 1e-6), hi = Math.max(at(0.9) - med, 1e-6);
  for (let k = 0; k < n; k++) if (!Number.isNaN(h[k])) out[k] = h[k] >= med ? (h[k] - med) / hi : (h[k] - med) / lo;
  return out;
}

// ---- backdrop ----------------------------------------------------------------

/** The render.py sweep: floor from y = -4 to 0.45, a 0.6 m cove in 16 steps, wall at y = 1.05 up to z = 4, 8 m wide. */
export function sweepMesh(): Pick<BackdropSection, "positions" | "normals" | "index"> {
  const R = 0.6;
  const profile: [number, number][] = [[-4, 0], [0.45, 0]];
  for (let k = 1; k <= 16; k++) {
    const a = (Math.PI / 2) * (k / 16);
    profile.push([0.45 + R * Math.sin(a), R - R * Math.cos(a)]);
  }
  profile.push([0.45 + R, 4]);
  const n = profile.length;
  // Segment normals face up and towards the part: the tangent turned a quarter turn. Each vertex averages its neighbours.
  const segment = (i: number): [number, number] => {
    const dy = profile[i + 1][0] - profile[i][0], dz = profile[i + 1][1] - profile[i][1], len = Math.hypot(dy, dz);
    return [-dz / len, dy / len];
  };
  const positions = new Float32Array(2 * n * 3);
  const normals = new Float32Array(2 * n * 3);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < n; i++) {
      const [a, b] = [segment(Math.max(i - 1, 0)), segment(Math.min(i, n - 2))];
      const ny = a[0] + b[0], nz = a[1] + b[1], len = Math.hypot(ny, nz);
      const v = (side * n + i) * 3;
      positions.set([side === 0 ? -4 : 4, profile[i][0], profile[i][1]], v);
      normals.set([0, ny / len, nz / len], v);
    }
  }
  const index = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) index.set([i, n + i, n + i + 1, i, n + i + 1, i + 1], i * 6);
  return { positions, normals, index };
}

let sweepCache: ReturnType<typeof sweepMesh> | undefined;
/** One sweep for every scene, so the backdrop section compares by reference. */
function sharedSweep(): ReturnType<typeof sweepMesh> {
  return (sweepCache ??= sweepMesh());
}

// ---- export ------------------------------------------------------------------

export type SceneBuffer = Float32Array | Int16Array | Uint32Array;
export type BufferKind = "f32" | "i16" | "u32";

function bufferKind(value: SceneBuffer): BufferKind {
  if (value instanceof Float32Array) return "f32";
  if (value instanceof Int16Array) return "i16";
  return "u32";
}

function isSceneBuffer(value: unknown): value is SceneBuffer {
  return value instanceof Float32Array || value instanceof Int16Array || value instanceof Uint32Array;
}

export interface SceneFile {
  /** The scene with every typed array replaced by `{ buffer, kind, length }`. */
  readonly json: string;
  /** The arrays, by the dotted path from the scene root (`part.mesh.position`,
   *  `lights.emitters.0.…`), which is also the `buffer` field that refers to them. */
  readonly buffers: ReadonlyMap<string, SceneBuffer>;
}

/**
 * The scene file for tools/blender/render_scene.py, and the only writer of
 * it. The JSON holds everything but the typed arrays. The caller writes each
 * array in `buffers` as raw little-endian values to `<name>.bin` next to the
 * JSON. A reference carries its element type, so a reader needs no table of
 * which field is which. The scene types hold no other kind of typed array.
 */
export function exportScene(scene: Scene): SceneFile {
  const buffers = new Map<string, SceneBuffer>();
  const walk = (value: unknown, path: string): unknown => {
    // BeadMesh.hidden: only the browser's Cycles leaves those faces out; native Blender renders every face.
    if (value instanceof Uint8Array) return undefined;
    if (isSceneBuffer(value)) {
      buffers.set(path, value);
      return { buffer: path, kind: bufferKind(value), length: value.length };
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}.${i}`));
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, path === "" ? k : `${path}.${k}`)]));
    }
    return value;
  };
  return { json: JSON.stringify(walk(scene, ""), null, 1), buffers };
}

export type { Metres, Studio };
