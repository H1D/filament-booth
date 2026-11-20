/**
 * rna.ts: the one table from Blender's Python API to the booth.
 *
 * Blender's Python API is a generic layer over RNA, a table of types and their
 * properties. This file is the booth's RNA: every bpy type the facade offers,
 * every attribute on it, and for each attribute exactly one of a document
 * field (num, bool, choice, text) with its BOUNDS key and unit scale, a codec
 * over the owner node for the attributes that are not one field, a value the
 * booth always has, a pointer to a nested struct, a collection, state of the
 * agent session that is not a booth setting, or a hint for a real Blender
 * attribute the booth does not have. Operators and collections are tables
 * beside it.
 *
 * It cannot drift from the document. Field keys are typed against the owner
 * node's interface in document.ts. Limits are BOUNDS keys, and booth.update
 * (parseDocument) stays the one validator. Fixed Cycles values are
 * FILM_DEFAULTS' own members. tests/agent-rna.test.ts walks every leaf of the
 * document and fails until it is reached here or named in UNMAPPED.
 * bpy.booth.reference() is generated from this file, so what the agent reads
 * is what the host does.
 *
 * Pure: no DOM, no Pyodide. host.ts interprets it.
 */
import {
  AGX_LOOKS, BED_TYPES, BOUNDS, FILAMENT_PRESET_IDS, LOOK_IDS, OVERLAYS, REST_FACES, SEAM_POSITIONS, TOP_SURFACE_PATTERNS,
  deg, kelvin, m,
  type AgxLook, type AreaLight, type BoothDocument, type Bounds, type CameraSetup, type FilamentChoice, type FilamentRecipe,
  type Imperfections, type OutputSetup, type Pose, type ScrimLight, type SliceSettings, type Studio, type StudioLight, type Vec3,
} from "../document";
import { applyFilamentPreset, applyLook, removeLight, type Edit } from "../edits";
import { LOOK_PRESETS, WORLD_HDRS } from "../presets";
import { FILM_DEFAULTS, filmSize, solveLight, sphericalAbout, sphericalOffset, type Scene } from "../scene";
import { hexToLinear, linearToHex } from "../ui/color";

// ---- values that cross into Python ---------------------------------------------------

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/**
 * How Python wraps a value it reads. A mathutils value or an array is bound to
 * its owner, so `obj.location.z += 0.1` writes the whole vector back as one
 * assignment. `float` keeps a whole number a float, as Blender's 85.0 mm lens
 * is, since JSON cannot tell. `struct` turns a handle key into that struct.
 */
export type Wrap = "Vector" | "Euler" | "Color" | "array" | "float" | { readonly struct: RnaTypeName } | null;

export type PyErrorType = "AttributeError" | "ValueError" | "TypeError" | "KeyError" | "IndexError" | "RuntimeError" | "ReferenceError";

/** An error Python raises as its own `pyType`. Anything else escaping the host is a bug in the booth. */
export class HostError extends Error {
  override name = "HostError";
  readonly pyType: PyErrorType;
  constructor(pyType: PyErrorType, message: string) {
    super(message);
    this.pyType = pyType;
  }
}

/**
 * What Python holds instead of an object. A light is its document id, never an
 * index, so an edit in the tab cannot redirect a handle to another light.
 */
export type Handle =
  | { readonly t: "scene" | "camera" | "part" | "backdrop" | "world" }
  | { readonly t: "light" | "image"; readonly id: string };

export const SCENE: Handle = { t: "scene" };
export const CAMERA: Handle = { t: "camera" };
export const PART: Handle = { t: "part" };
export const BACKDROP: Handle = { t: "backdrop" };
export const WORLD: Handle = { t: "world" };
export const lightHandle = (id: string): Handle => ({ t: "light", id });

/** The FFI spelling of a handle: "camera", "light:key". */
export function handleKey(h: Handle): string {
  return "id" in h ? `${h.t}:${h.id}` : h.t;
}

export function parseHandle(key: string): Handle | null {
  const colon = key.indexOf(":");
  if (colon < 0) {
    return key === "scene" || key === "camera" || key === "part" || key === "backdrop" || key === "world" ? { t: key } : null;
  }
  const t = key.slice(0, colon);
  const id = key.slice(colon + 1);
  return (t === "light" || t === "image") && id !== "" ? { t, id } : null;
}

export const sameHandle = (a: Handle, b: Handle): boolean => handleKey(a) === handleKey(b);

/** What one agent connection keeps that is not a booth setting, so it is not in the document. */
export interface SessionState {
  /** scene.render.filepath. The bridge resolves it against the agent's folder. */
  readonly renderFilepath: string;
  /** bpy.context.object: what the last operator added or imported. */
  readonly active: Handle | null;
}

export const DEFAULT_RENDER_FILEPATH = "//";

// ---- owners: which document node a type reads and writes -------------------------------

/** A world HDR, as bpy.data.images lists it. */
export interface HdrImage { readonly id: string; readonly file: string; readonly url: string }

export const HDR_IMAGES: readonly HdrImage[] = Object.entries(WORLD_HDRS).map(([id, hdr]) => ({
  id, file: hdr.url.split("/").pop() ?? id, url: hdr.url,
}));

interface OwnerNodes {
  document: BoothDocument;
  output: OutputSetup;
  viewTransform: OutputSetup["viewTransform"];
  camera: CameraSetup;
  light: StudioLight;
  area: AreaLight;
  scrim: ScrimLight;
  studio: Studio;
  world: Studio["world"];
  backdrop: Studio["backdrop"];
  floorCards: NonNullable<Studio["floorCards"]>;
  pose: Pose;
  slicing: SliceSettings;
  filament: FilamentChoice;
  recipe: FilamentRecipe;
  roughness: FilamentRecipe["roughness"];
  imperfections: Imperfections;
  image: HdrImage;
}
export type OwnerKind = keyof OwnerNodes;

interface Owner<N> {
  /** Where the node sits in the document, `[]` standing for any light. Null for what the document does not hold. */
  readonly path: string | null;
  /** The node a handle reaches in a document or a draft, or null when its object is gone. */
  readonly node: (doc: BoothDocument, handle: Handle) => N | null;
}

const lightOf = (doc: BoothDocument, h: Handle): StudioLight | null =>
  h.t === "light" ? (doc.studio.lights.find((l) => l.id === h.id) ?? null) : null;

/** The one resolver from a handle to its node, for reading booth.doc and for writing inside booth.update alike. */
export const OWNERS: { readonly [O in OwnerKind]: Owner<OwnerNodes[O]> } = {
  document: { path: "", node: (doc) => doc },
  output: { path: "output", node: (doc) => doc.output },
  viewTransform: { path: "output.viewTransform", node: (doc) => doc.output.viewTransform },
  camera: { path: "camera", node: (doc) => doc.camera },
  light: { path: "studio.lights[]", node: lightOf },
  area: { path: "studio.lights[]", node: (doc, h) => { const l = lightOf(doc, h); return l?.kind === "area" ? l : null; } },
  scrim: { path: "studio.lights[]", node: (doc, h) => { const l = lightOf(doc, h); return l?.kind === "scrim" ? l : null; } },
  studio: { path: "studio", node: (doc) => doc.studio },
  world: { path: "studio.world", node: (doc) => doc.studio.world },
  backdrop: { path: "studio.backdrop", node: (doc) => doc.studio.backdrop },
  floorCards: {
    path: "studio.floorCards",
    node: (doc) => {
      if (doc.studio.floorCards === null) throw new HostError("RuntimeError", "the floor cards are off: set bpy.context.scene.booth.use_floor_cards = True first");
      return doc.studio.floorCards;
    },
  },
  pose: { path: "pose", node: (doc) => doc.pose },
  slicing: { path: "slicing", node: (doc) => doc.slicing },
  filament: { path: "filament", node: (doc) => doc.filament },
  recipe: { path: "filament.recipe", node: (doc) => doc.filament.recipe },
  roughness: { path: "filament.recipe.roughness", node: (doc) => doc.filament.recipe.roughness },
  imperfections: { path: "filament.imperfections", node: (doc) => doc.filament.imperfections },
  image: { path: null, node: (_, h) => (h.t === "image" ? (HDR_IMAGES.find((i) => i.id === h.id) ?? null) : null) },
};

// ---- props -------------------------------------------------------------------------------

export type BoundsKey = keyof typeof BOUNDS;

export interface ReadContext {
  readonly doc: Readonly<BoothDocument>;
  /** booth.scene: the aim point, the solved camera and the part's pose come from here, never re-derived. */
  readonly scene: Scene;
  readonly handle: Handle;
  readonly session: SessionState;
  readonly partName: string | null;
}

/** An attribute that is not one document field. */
export type Codec<N> = {
  /** For the reference: "Vector m", "Euler rad", ... */
  readonly type: string;
  readonly wrap: Wrap;
  /** The owner node's fields it reads or writes, as paths below the node. */
  readonly fields: readonly string[];
  /** A BOUNDS range the reference shows, in bpy units (`scale` times the document's). */
  readonly bounds?: BoundsKey;
  readonly scale?: number;
  readonly get: (node: N, ctx: ReadContext) => Json;
} & (
  /** Mutates the owner node inside booth.update. A string it returns is printed as a warning. */
  | { readonly set: (draft: N, value: Json, ctx: ReadContext) => string | undefined; readonly readOnly?: undefined }
  | { readonly set?: undefined; readonly readOnly: string }
);

export type Prop =
  /** bpy value = document value * scale. */
  | { readonly kind: "num"; readonly key: string; readonly bounds: BoundsKey; readonly unit: string; readonly scale: number }
  | { readonly kind: "bool"; readonly key: string; readonly invert: boolean }
  /** bpy enum identifier to document value. A bijection onto the document's own list (tested). */
  | { readonly kind: "choice"; readonly key: string; readonly map: Readonly<Record<string, string>> }
  /** A name made unique among the collection's names, as Blender renames a second "Key" to "Key.001". */
  | { readonly kind: "text"; readonly key: string; readonly unique: CollectionName }
  | { readonly kind: "codec"; readonly codec: Codec<object> }
  /** What the booth always has. Assigning the same value is accepted, anything else is a ValueError. */
  | { readonly kind: "fixed"; readonly value: Json; readonly why: string }
  /** A nested struct over `handle`, or over the owner's own handle when null. */
  | { readonly kind: "pointer"; readonly type: RnaTypeName; readonly handle: Handle | null }
  | { readonly kind: "collection"; readonly collection: CollectionName }
  | { readonly kind: "session"; readonly key: keyof SessionState }
  | { readonly kind: "missing"; readonly hint: string };

export interface RnaType {
  readonly owner: OwnerKind;
  /** The Python class. Every object variant is "Object", as in Blender, so isinstance holds. */
  readonly pyClass: string;
  /** How Blender spells the struct, `{name}` standing for the object's name: bpy.data.lights[{name}]. */
  readonly path: string;
  readonly doc: string;
  readonly props: Readonly<Record<string, Prop>>;
}

type KeysOf<N, V> = { [K in keyof N]-?: N[K] extends V ? K : never }[keyof N];

/** Builders whose keys are checked against the owner node, so a renamed document field fails the build. */
interface Kit<N> {
  num(key: KeysOf<N, number>, bounds: BoundsKey, unit?: string, scale?: number): Prop;
  bool(key: KeysOf<N, boolean>, invert?: boolean): Prop;
  choice(key: KeysOf<N, string>, map: Readonly<Record<string, string>>): Prop;
  text(key: KeysOf<N, string>, unique: CollectionName): Prop;
  codec(codec: Codec<N>): Prop;
}

function kit<N>(): Kit<N> {
  return {
    num: (key, bounds, unit = "", scale = 1) => ({ kind: "num", key: String(key), bounds, unit, scale }),
    bool: (key, invert = false) => ({ kind: "bool", key: String(key), invert }),
    choice: (key, map) => ({ kind: "choice", key: String(key), map }),
    text: (key, unique) => ({ kind: "text", key: String(key), unique }),
    // The interpreter hands each codec only nodes of its own owner (OWNERS), so the erased type is safe.
    codec: (codec) => ({ kind: "codec", codec: codec as unknown as Codec<object> }),
  };
}

function rnaType<O extends OwnerKind>(
  owner: O, pyClass: string, path: string, doc: string, props: (p: Kit<OwnerNodes[O]>) => Record<string, Prop>,
): RnaType {
  return { owner, pyClass, path, doc, props: props(kit()) };
}

const fixed = (value: Json, why = ""): Prop => ({ kind: "fixed", value, why });
const ptr = (type: RnaTypeName, handle: Handle | null = null): Prop => ({ kind: "pointer", type, handle });
const coll = (collection: CollectionName): Prop => ({ kind: "collection", collection });
const missing = (hint: string): Prop => ({ kind: "missing", hint });
const session = (key: keyof SessionState): Prop => ({ kind: "session", key });

// ---- reading what Python sent ------------------------------------------------------------

/** Python's name for the type of a value, for TypeErrors worded as Blender's are. */
export function pyTypeName(v: Json): string {
  if (v === null) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return `sequence of ${v.length}`;
  return "$struct" in v ? "bpy_struct" : "dict";
}

export function numberOf(v: Json): number {
  if (typeof v !== "number") throw new HostError("TypeError", `expected a float type, not ${pyTypeName(v)}`);
  return v;
}

export function boolOf(v: Json): boolean {
  if (typeof v === "boolean") return v;
  if (v === 0 || v === 1) return v === 1;
  throw new HostError("TypeError", `expected True/False or 0/1, not ${pyTypeName(v)}`);
}

function numbers(v: Json, sizes: readonly number[]): number[] {
  if (!Array.isArray(v) || !sizes.includes(v.length) || !v.every((x) => typeof x === "number")) {
    throw new HostError("TypeError", `expected a sequence of ${sizes.join(" or ")} floats, not ${pyTypeName(v)}`);
  }
  return v as number[];
}

type V3 = readonly [number, number, number];
const vec3 = (v: Json): V3 => { const [x, y, z] = numbers(v, [3]); return [x, y, z]; };
const metres = ([x, y, z]: V3): Vec3 => [m(x), m(y), m(z)];

/** The handle key inside `{"$struct": key}`, how Python sends a struct it assigns. */
export function structKey(v: Json): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const key = (v as { readonly [k: string]: Json })["$struct"];
  return typeof key === "string" ? key : null;
}

export function enumError(value: Json, items: readonly string[]): HostError {
  return typeof value === "string"
    ? new HostError("TypeError", `enum "${value}" not found in (${items.map((i) => pyRepr(i)).join(", ")})`)
    : new HostError("TypeError", `expected an enum string, not ${pyTypeName(value)}`);
}

/** Numbers as Python prints them, trimmed to six significant digits. */
export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)));
}

export function pyRepr(v: Json): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return fmt(v);
  if (typeof v === "string") return `'${v.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  if (Array.isArray(v)) return `(${v.map((x: Json) => pyRepr(x)).join(", ")}${v.length === 1 ? "," : ""})`;
  return `{${Object.entries(v).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(", ")}}`;
}

// ---- codecs ------------------------------------------------------------------------------

const RAD = Math.PI / 180;
/** Above this a camera rotation counts as roll, which the booth's orbit camera cannot do. */
const ROLL_TOLERANCE_RAD = 0.1 * RAD;
/** Blender's default light temperature. */
const DEFAULT_KELVIN = 6500;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scaled = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/** Where a point sits about a centre, or the ValueError `why` when it is the centre. */
function placed(centre: V3, point: V3, why: string) {
  try {
    return sphericalAbout(centre, point);
  } catch (e) {
    if (e instanceof RangeError) throw new HostError("ValueError", why);
    throw e;
  }
}

/** Blender's XYZ Euler of a rotation whose columns are x, y, z. */
function eulerXYZ(x: V3, y: V3, z: V3): [number, number, number] {
  const cy = Math.hypot(x[0], x[1]);
  if (cy > 1e-9) return [Math.atan2(y[2], z[2]), Math.atan2(-x[2], cy), Math.atan2(x[1], x[0])];
  return [Math.atan2(-z[1], y[1]), Math.atan2(-x[2], cy), 0];
}

/** Reduces a pixel size to an aspect BOUNDS.aspectSide can hold, exact for filmSize. */
function aspectOf(w: number, h: number): { w: number; h: number } {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  const [rw, rh] = [w / g, h / g];
  const k = Math.min(1, BOUNDS.aspectSide.max / Math.max(rw, rh));
  return { w: rw * k, h: rh * k };
}

const lightLocation: Codec<StudioLight> = {
  type: "Vector m, about the subject: the light moves with the part", wrap: "Vector", fields: ["azimuth", "elevation", "distance"],
  get: (light, ctx) => [...solveLight(light, ctx.scene.lights.aim).centre],
  set: (light, value, ctx) => {
    Object.assign(light, placed(ctx.scene.lights.aim, vec3(value), "a light cannot sit on the point it aims at"));
    return undefined;
  },
};

const lightRotation: Codec<StudioLight> = {
  type: "Euler rad", wrap: "Euler", fields: [], readOnly: "a booth light always faces the subject, so move it with location",
  get: (light, ctx) => {
    const e = solveLight(light, ctx.scene.lights.aim);
    // A Blender area light emits along its local -Z; the booth's scrim card faces along +Z.
    const s = light.kind === "area" ? -1 : 1;
    return eulerXYZ(scaled(e.xAxis, s), e.yAxis, scaled(e.normal, s));
  },
};

const SHAPES: Readonly<Record<string, { readonly shape: StudioLight["shape"]; readonly square: boolean }>> = {
  SQUARE: { shape: "rect", square: true },
  RECTANGLE: { shape: "rect", square: false },
  DISK: { shape: "ellipse", square: true },
  ELLIPSE: { shape: "ellipse", square: false },
};

const lightShape: Codec<StudioLight> = {
  type: "enum in ['SQUARE', 'RECTANGLE', 'DISK', 'ELLIPSE'], reads RECTANGLE or ELLIPSE: SQUARE and DISK set size_y to size", wrap: null,
  fields: ["shape", "height"],
  get: (light) => (light.shape === "rect" ? "RECTANGLE" : "ELLIPSE"),
  set: (light, value) => {
    const s = typeof value === "string" ? SHAPES[value] : undefined;
    if (s === undefined) throw enumError(value, Object.keys(SHAPES));
    light.shape = s.shape;
    if (s.square) light.height = light.width;
    return undefined;
  },
};

const lightColor: Codec<StudioLight> = {
  type: "Color, linear: a tint, energy alone sets brightness", wrap: "Color", fields: ["color.kind", "color.rgb"],
  get: (light) => (light.color.kind === "rgb" ? [...light.color.rgb] : [1, 1, 1]),
  set: (light, value) => {
    const rgb = vec3(value);
    if (Math.max(...rgb) <= 0) throw new HostError("ValueError", "a black light gives no light: set energy = 0 or hide_render = True instead");
    if (light.color.kind === "kelvin") {
      if (rgb.every((c) => c === 1)) return undefined;
      throw new HostError("ValueError", "the light's colour is its temperature (use_temperature is True): set use_temperature = False before setting color");
    }
    light.color = { kind: "rgb", rgb };
    return Math.max(...rgb) < 0.5 ? "the booth sets a light's brightness by energy alone, so a dark color only tints it" : undefined;
  },
};

const lightUseTemperature: Codec<StudioLight> = {
  type: "bool: color is a blackbody temperature", wrap: null, fields: ["color.kind"],
  get: (light) => light.color.kind === "kelvin",
  set: (light, value) => {
    const on = boolOf(value);
    if (on && light.color.kind === "rgb") light.color = { kind: "kelvin", kelvin: kelvin(DEFAULT_KELVIN) };
    if (!on && light.color.kind === "kelvin") light.color = { kind: "rgb", rgb: [1, 1, 1] };
    return undefined;
  },
};

const lightTemperature: Codec<StudioLight> = {
  type: "float K, setting it turns use_temperature on", wrap: "float", fields: ["color.kind", "color.kelvin"], bounds: "kelvin",
  get: (light) => (light.color.kind === "kelvin" ? light.color.kelvin : DEFAULT_KELVIN),
  set: (light, value) => {
    light.color = { kind: "kelvin", kelvin: kelvin(numberOf(value)) };
    return undefined;
  },
};

const dataName: Codec<StudioLight> = {
  type: "str", wrap: null, fields: ["name"], readOnly: "a light's name is its object's: rename obj.name",
  get: (light) => light.name,
};

const cameraLocation: Codec<CameraSetup> = {
  type: "Vector m: moving the camera keeps its target, so it orbits", wrap: "Vector", fields: ["azimuth", "elevation", "distance"],
  get: (_, ctx) => [...ctx.scene.camera.position],
  set: (cam, value) => {
    Object.assign(cam, placed(cam.target, vec3(value), "the camera cannot stand on its target"));
    return undefined;
  },
};

const cameraRotation: Codec<CameraSetup> = {
  type: "Euler rad: setting it keeps the camera in place and moves the target along the new view; no roll", wrap: "Euler",
  fields: ["azimuth", "elevation", "target"],
  get: (cam) => [(90 - cam.elevation) * RAD, 0, cam.azimuth * RAD],
  set: (cam, value, ctx) => {
    const [x, y, z] = vec3(value);
    if (Math.abs(y) > ROLL_TOLERANCE_RAD) throw new HostError("ValueError", "the booth camera never rolls: rotation_euler.y must be 0");
    if (x < -1e-9 || x > Math.PI + 1e-9) {
      throw new HostError("ValueError", `rotation_euler.x must be between 0 (looking straight down) and pi (straight up), got ${fmt(x)}`);
    }
    const elevation = Math.min(90, Math.max(-90, 90 - x / RAD));
    const turned = (((z / RAD) % 360) + 360) % 360;
    const azimuth = turned > 180 ? turned - 360 : turned;
    const back = sphericalOffset(azimuth, elevation, cam.distance);
    cam.azimuth = deg(azimuth);
    cam.elevation = deg(elevation);
    cam.target = metres(sub(ctx.scene.camera.position, back));
    return undefined;
  },
};

const focusDistance: Codec<CameraSetup> = {
  type: "float m, from the camera along its view", wrap: "float", fields: ["focusPartPoint"],
  get: (_, ctx) => ctx.scene.camera.focusDistanceM,
  set: (cam, value, ctx) => {
    const d = numberOf(value);
    const part = ctx.scene.part;
    if (part === null) throw new HostError("ValueError", "dof.focus_distance needs a part to focus on; with no part open the focus is the camera's target");
    const c = ctx.scene.camera;
    if (d <= c.clipStartM) throw new HostError("ValueError", `dof.focus_distance must be more than ${c.clipStartM} m, got ${fmt(d)}`);
    const view = sub(c.target, c.position);
    const point: V3 = [
      c.position[0] + (view[0] * d) / Math.hypot(...view),
      c.position[1] + (view[1] * d) / Math.hypot(...view),
      c.position[2] + (view[2] * d) / Math.hypot(...view),
    ];
    // The part's pose is a rotation and a translation, so its inverse is the transpose.
    const t = part.toWorld;
    const rel = sub(point, [t[12], t[13], t[14]]);
    cam.focusPartPoint = metres([dot(rel, [t[0], t[1], t[2]]), dot(rel, [t[4], t[5], t[6]]), dot(rel, [t[8], t[9], t[10]])]);
    return undefined;
  },
};

const cameraTarget: Codec<CameraSetup> = {
  type: "Vector m: moving it carries the camera along", wrap: "Vector", fields: ["target"],
  get: (cam) => [...cam.target],
  set: (cam, value) => {
    cam.target = metres(vec3(value));
    return undefined;
  },
};

function resolution(axis: "width" | "height"): Codec<OutputSetup> {
  return {
    type: "int px", wrap: null, fields: ["aspect.w", "aspect.h", "longEdgePx"], bounds: "longEdgePx",
    get: (out) => filmSize(out.aspect, out.longEdgePx)[axis],
    set: (out, value) => {
      const px = numberOf(value);
      if (!Number.isInteger(px) || px < 1) throw new HostError("ValueError", `expected a whole number of pixels, got ${fmt(px)}`);
      const now = filmSize(out.aspect, out.longEdgePx);
      const w = axis === "width" ? px : now.width;
      const h = axis === "height" ? px : now.height;
      out.aspect = aspectOf(w, h);
      out.longEdgePx = Math.max(w, h);
      return undefined;
    },
  };
}

/** A rotation about Z alone, as an Euler; x or y is a ValueError naming `why`. */
function turnAboutZ<N>(field: KeysOf<N, number>, bounds: BoundsKey, why: string): Codec<N> {
  return {
    type: "Euler rad, about Z only", wrap: "Euler", fields: [String(field)], bounds, scale: RAD,
    get: (node) => [0, 0, (node[field] as number) * RAD],
    set: (node, value) => {
      const [x, y, z] = vec3(value);
      if (Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9) throw new HostError("ValueError", why);
      (node as Record<KeysOf<N, number>, number>)[field] = z / RAD;
      return undefined;
    },
  };
}

const worldImage: Codec<Studio["world"]> = {
  type: "Image from bpy.data.images", wrap: { struct: "Image" }, fields: ["hdrId"],
  get: (world) => handleKey({ t: "image", id: world.hdrId }),
  set: (world, value) => {
    const key = structKey(value);
    const h = key === null ? null : parseHandle(key);
    if (h === null || h.t !== "image") throw new HostError("TypeError", `expected an Image from bpy.data.images, not ${pyTypeName(value)}`);
    world.hdrId = h.id;
    return undefined;
  },
};

/** RGBA with alpha 1 over a linear RGB field. */
function rgbaOf(value: Json): V3 {
  const c = numbers(value, [3, 4]);
  if (c.length === 4 && c[3] !== 1) throw new HostError("ValueError", "alpha must be 1: the booth's surfaces are opaque");
  return [c[0], c[1], c[2]];
}

const backdropColor: Codec<Studio["backdrop"]> = {
  type: "float[4] RGBA, linear", wrap: "array", fields: ["color"],
  get: (backdrop) => [...backdrop.color, 1],
  set: (backdrop, value) => {
    backdrop.color = rgbaOf(value);
    return undefined;
  },
};

const filamentColor: Codec<FilamentRecipe> = {
  type: "float[4] RGBA, linear, stored as an 8 bit sRGB colour", wrap: "array", fields: ["colorHex"],
  get: (recipe) => [...(hexToLinear(recipe.colorHex) ?? [0, 0, 0]), 1],
  set: (recipe, value) => {
    const rgb = rgbaOf(value);
    recipe.colorHex = linearToHex(rgb);
    return rgb.some((c) => c > 1 || c < 0) ? "filament colour channels are clipped to 0..1" : undefined;
  },
};

function partBounds(ctx: ReadContext): NonNullable<Scene["part"]>["worldBounds"] {
  if (ctx.scene.part === null) throw new HostError("RuntimeError", "no part is open");
  return ctx.scene.part.worldBounds;
}

const partLocation: Codec<Pose> = {
  type: "Vector m, the middle of the part's base", wrap: "Vector", fields: [],
  readOnly: "the part stands centred on the turntable: turn it with rotation_euler.z and pick its face with obj.booth.rest_face",
  get: (_, ctx) => { const b = partBounds(ctx); return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]]; },
};

const partDimensions: Codec<Pose> = {
  type: "Vector m, the posed part's bounding box", wrap: "Vector", fields: [], readOnly: "the part's size is the printed file's",
  get: (_, ctx) => { const b = partBounds(ctx); return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]; },
};

const partName: Codec<Pose> = {
  type: "str", wrap: null, fields: [], readOnly: "the part's name is its file's",
  get: (_, ctx) => ctx.partName,
};

const floorCardsOn: Codec<BoothDocument> = {
  type: "bool: a lit ring on the table that only reflections see; on starts from the gradient look's ring", wrap: null,
  fields: ["studio.floorCards"],
  get: (doc) => doc.studio.floorCards !== null,
  set: (doc, value) => {
    const on = boolOf(value);
    if (!on) doc.studio.floorCards = null;
    else if (doc.studio.floorCards === null) doc.studio.floorCards = structuredClone(LOOK_PRESETS.gradient.studio.floorCards);
    return undefined;
  },
};

/** "PLA_MATTE" for "pla-matte": Blender's enum identifiers for the document's own lists. */
export function bpyEnum<T extends string>(ids: readonly T[]): Readonly<Record<string, T>> {
  return Object.fromEntries(ids.map((id) => [id.toUpperCase().replaceAll("-", "_"), id]));
}
const bpyName = (id: string): string => id.toUpperCase().replaceAll("-", "_");

const lookBase: Codec<BoothDocument> = {
  type: `enum in [${LOOK_IDS.map((id) => pyRepr(bpyName(id))).join(", ")}] or None`, wrap: null, fields: ["lookBase"],
  readOnly: "the look the studio was copied from: apply one with bpy.ops.booth.look_apply(look=...)",
  get: (doc) => (doc.lookBase === null ? null : bpyName(doc.lookBase)),
};

const filamentPreset: Codec<FilamentChoice> = {
  type: `enum in [${FILAMENT_PRESET_IDS.map((id) => pyRepr(bpyName(id))).join(", ")}] or None`, wrap: null, fields: ["presetId"],
  readOnly: "the preset the recipe was copied from: apply one with bpy.ops.booth.filament_apply(preset=...)",
  get: (f) => (f.presetId === null ? null : bpyName(f.presetId)),
};

// ---- enum maps -----------------------------------------------------------------------------

/** Blender's look names, as tools/blender/render_scene.py sets them. The type fails the build if a look is missing. */
export const AGX_LOOK_NAMES = {
  "None": "none",
  "AgX - Punchy": "punchy",
  "AgX - Low Contrast": "low-contrast",
  "AgX - Medium Low Contrast": "medium-low-contrast",
  "AgX - Medium High Contrast": "medium-high-contrast",
  "AgX - High Contrast": "high-contrast",
} as const satisfies Record<string, AgxLook>;
type UnnamedLook = Exclude<(typeof AGX_LOOKS)[number], (typeof AGX_LOOK_NAMES)[keyof typeof AGX_LOOK_NAMES]>;
const everyLookNamed: [UnnamedLook] extends [never] ? true : never = true;
void everyLookNamed;

// ---- the table -------------------------------------------------------------------------------

/** FILM_DEFAULTS, each under its Cycles name. The type makes a new default fail the build until it is named here. */
export const CYCLES_FILM = {
  adaptiveThreshold: "adaptive_threshold",
  maxBounces: "max_bounces",
  diffuseBounces: "diffuse_bounces",
  glossyBounces: "glossy_bounces",
  transmissionBounces: "transmission_bounces",
  clampDirect: "sample_clamp_direct",
  clampIndirect: "sample_clamp_indirect",
  filterWidthPx: "filter_width",
} as const satisfies { readonly [K in keyof typeof FILM_DEFAULTS]: string };

const cyclesFilm: Record<string, Prop> = Object.fromEntries(
  (Object.keys(CYCLES_FILM) as (keyof typeof CYCLES_FILM)[]).map((key) => [CYCLES_FILM[key], fixed(FILM_DEFAULTS[key], "the booth's render settings (FILM_DEFAULTS)")]),
);

/** Placement and visibility, the same for an area light and a scrim. */
function placement(p: Kit<StudioLight>): Record<string, Prop> {
  return {
    location: p.codec(lightLocation),
    rotation_euler: p.codec(lightRotation),
    hide_render: p.bool("on", true),
    hide_viewport: missing("the booth has one switch per light: hide_render, which hides it in the preview too"),
    constraints: missing("a booth light always faces the subject, as if it had a Track To; it has no constraints"),
    matrix_world: missing("place a light with location; it always faces the subject"),
    scale: missing("a light's size is data.size and data.size_y (obj.booth.width and height for a scrim)"),
    parent: missing("lights are placed about the subject; nothing is parented"),
    select_set: missing("selection is not in the booth: operators act on what you name"),
  };
}

const WORLD_TREE = "bpy.data.worlds['World'].node_tree";
const BACKDROP_TREE = "bpy.data.materials['Backdrop'].node_tree";
const FILAMENT_TREE = "bpy.data.materials['Filament'].node_tree";
const RENDER = "bpy.data.scenes['Scene'].render";

/** One input socket of a fixed node tree. */
function socket<O extends OwnerKind>(owner: O, pyClass: string, nodePath: string, name: string, value: (p: Kit<OwnerNodes[O]>) => Prop): RnaType {
  return rnaType(owner, pyClass, `${nodePath}.inputs['${name}']`, `The ${name} input.`, (p) => ({
    name: fixed(name), default_value: value(p), is_linked: fixed(false),
  }));
}

/** A socket fed by a link in the fixed tree, so it has no value to set. */
function linkedSocket(pyClass: string, nodePath: string, name: string, why: string): RnaType {
  return rnaType("document", pyClass, `${nodePath}.inputs['${name}']`, `The ${name} input, linked.`, () => ({
    name: fixed(name), default_value: missing(why), is_linked: fixed(true),
  }));
}

function fixedSocket(pyClass: string, nodePath: string, name: string, value: Json, why: string): RnaType {
  return rnaType("document", pyClass, `${nodePath}.inputs['${name}']`, `The ${name} input.`, () => ({
    name: fixed(name), default_value: fixed(value, why), is_linked: fixed(false),
  }));
}

export type RnaTypeName =
  | "BlendData" | "Context" | "Scene" | "BoothScene" | "BoothFloorCards"
  | "RenderSettings" | "ImageFormatSettings" | "CyclesRenderSettings" | "ViewSettings"
  | "LightObject" | "ScrimObject" | "AreaLight" | "BoothLight" | "BoothScrim"
  | "CameraObject" | "Camera" | "CameraDOF" | "BoothCamera"
  | "World" | "WorldNodeTree" | "WorldBackground" | "WorldColorInput" | "WorldStrengthInput"
  | "WorldMapping" | "WorldVectorInput" | "WorldLocationInput" | "WorldRotationInput" | "WorldScaleInput"
  | "WorldEnvironment" | "Image"
  | "BackdropObject" | "BackdropMaterial" | "BackdropNodeTree" | "BackdropPrincipled"
  | "BackdropBaseColorInput" | "BackdropMetallicInput" | "BackdropRoughnessInput"
  | "PartObject" | "BoothPart" | "BoothSlicing" | "BoothFilament" | "BoothRecipe" | "BoothRoughness" | "BoothImperfections"
  | "FilamentMaterial" | "FilamentNodeTree" | "FilamentPrincipled"
  | "FilamentBaseColorInput" | "FilamentMetallicInput" | "FilamentRoughnessInput" | "FilamentIorInput" | "FilamentAnisotropicInput";

export const RNA: { readonly [K in RnaTypeName]: RnaType } = {
  // -- roots ---------------------------------------------------------------------------------
  BlendData: rnaType("document", "BlendData", "bpy.data", "Everything in the booth, by kind.", () => ({
    objects: coll("objects"), lights: coll("lights"), cameras: coll("cameras"), worlds: coll("worlds"),
    materials: coll("materials"), images: coll("images"), scenes: coll("scenes"),
    meshes: missing("the booth holds one printed part: import it with bpy.ops.wm.stl_import or bpy.ops.booth.gcode_import"),
    filepath: fixed("", "the setup saves itself in the browser"),
  })),
  Context: rnaType("document", "Context", "bpy.context", "Read-only, as in a script run from Blender's text editor.", () => ({
    scene: ptr("Scene", SCENE),
    object: session("active"),
    active_object: session("active"),
    selected_objects: missing("selection is not in the booth: operators act on what you name, and the last added object is bpy.context.object"),
    view_layer: missing("the booth has one view: bpy.context.scene"),
    collection: missing("add lights with bpy.ops.object.light_add(type='AREA') and scrims with bpy.ops.booth.scrim_add()"),
  })),

  // -- scene and output ------------------------------------------------------------------------
  Scene: rnaType("document", "Scene", "bpy.data.scenes['Scene']", "The booth's one scene.", () => ({
    name: fixed("Scene", "the booth has one scene"),
    camera: ptr("CameraObject", CAMERA),
    world: ptr("World", WORLD),
    render: ptr("RenderSettings"),
    cycles: ptr("CyclesRenderSettings"),
    view_settings: ptr("ViewSettings"),
    objects: coll("objects"),
    booth: ptr("BoothScene"),
    frame_current: fixed(1, "the booth renders stills"),
    collection: missing("add lights with bpy.ops.object.light_add(type='AREA') and scrims with bpy.ops.booth.scrim_add()"),
  })),
  BoothScene: rnaType("document", "BoothSceneSettings", "bpy.data.scenes['Scene'].booth", "Booth settings Blender has no attribute for.", (p) => ({
    look: p.codec(lookBase),
    use_floor_cards: p.codec(floorCardsOn),
    floor_cards: ptr("BoothFloorCards"),
  })),
  BoothFloorCards: rnaType("floorCards", "BoothFloorCards", "bpy.data.scenes['Scene'].booth.floor_cards",
    "A lit ring on the table that only glossy reflections see, brightest on its key side.", (p) => ({
      key_radiance: p.num("keySide", "radiance"),
      far_radiance: p.num("farSide", "radiance"),
      azimuth: p.num("azimuth", "azimuth", "rad", RAD),
    })),
  RenderSettings: rnaType("output", "RenderSettings", RENDER, "Output size and file. A photo is a PNG.", (p) => ({
    engine: fixed("CYCLES", "the booth renders with Cycles"),
    resolution_x: p.codec(resolution("width")),
    resolution_y: p.codec(resolution("height")),
    resolution_percentage: fixed(100, "set resolution_x and resolution_y"),
    film_transparent: p.bool("transparentBackground"),
    filepath: session("renderFilepath"),
    use_file_extension: fixed(true),
    image_settings: ptr("ImageFormatSettings"),
  })),
  ImageFormatSettings: rnaType("output", "ImageFormatSettings", `${RENDER}.image_settings`, "A photo is an 8 bit PNG.", () => ({
    file_format: fixed("PNG", "photos are PNG"),
    color_depth: fixed("8", "photos are 8 bit"),
  })),
  CyclesRenderSettings: rnaType("output", "CyclesRenderSettings", "bpy.data.scenes['Scene'].cycles",
    "Samples and time limit. The rest is fixed to the booth's render settings.", (p) => ({
      samples: p.num("samples", "samples"),
      time_limit: p.num("timeLimitS", "timeLimitS", "s, 0 for none"),
      device: fixed("CPU", "Cycles runs on the CPU in WebAssembly"),
      use_denoising: p.bool("denoise"),
      denoiser: fixed("OPENIMAGEDENOISE", "the booth runs Open Image Denoise on the graphics card"),
      denoising_prefilter: fixed("FAST", "the albedo and normal guides go to the denoiser unfiltered"),
      use_adaptive_sampling: fixed(true),
      ...cyclesFilm,
      pixel_filter_type: fixed("BLACKMAN_HARRIS"),
    })),
  ViewSettings: rnaType("viewTransform", "ColorManagedViewSettings", "bpy.data.scenes['Scene'].view_settings", "Blender 5.2's own AgX.", (p) => ({
    view_transform: fixed("AgX", "photos are developed with AgX"),
    look: p.choice("look", AGX_LOOK_NAMES),
    exposure: fixed(0, "brighten with light energy or the world's Strength"),
    gamma: fixed(1),
  })),

  // -- lights ----------------------------------------------------------------------------------
  LightObject: rnaType("light", "Object", "bpy.data.objects[{name}]",
    "An area light. It always faces the subject, as a Blender light with a Track To would.", (p) => ({
      name: p.text("name", "objects"),
      type: fixed("LIGHT"),
      data: ptr("AreaLight"),
      booth: ptr("BoothLight"),
      ...placement(p),
    })),
  AreaLight: rnaType("area", "AreaLight", "bpy.data.lights[{name}]", "Blender's area light: true watts, linear colour.", (p) => ({
    name: p.codec(dataName),
    type: fixed("AREA", "the booth has area lights only"),
    energy: p.num("powerW", "powerW", "W"),
    size: p.num("width", "lightSize", "m"),
    size_y: p.num("height", "lightSize", "m"),
    shape: p.codec(lightShape),
    spread: p.num("spreadDeg", "spreadDeg", "rad", RAD),
    color: p.codec(lightColor),
    use_temperature: p.codec(lightUseTemperature),
    temperature: p.codec(lightTemperature),
    use_shadow: fixed(true, "every booth light casts shadows"),
    shadow_soft_size: missing("an area light's softness is data.size and data.size_y"),
    spot_size: missing("the booth has area lights only: narrow one with data.spread"),
  })),
  BoothLight: rnaType("light", "BoothLightSettings", "bpy.data.objects[{name}].booth", "Booth settings Blender has no attribute for.", (p) => ({
    part_only: p.bool("partOnly"),
  })),
  ScrimObject: rnaType("light", "Object", "bpy.data.objects[{name}]",
    "A scrim: a card glowing with a vertical gradient, invisible to the camera. A MESH in Blender.", (p) => ({
      name: p.text("name", "objects"),
      type: fixed("MESH", "a scrim is an emissive card"),
      data: missing("a scrim's settings are obj.booth (top_radiance, bottom_radiance, width, height, color)"),
      booth: ptr("BoothScrim"),
      ...placement(p),
    })),
  BoothScrim: rnaType("scrim", "BoothScrimSettings", "bpy.data.objects[{name}].booth", "Scrim settings. Radiance is Blender emission strength.", (p) => ({
    top_radiance: p.num("topRadiance", "radiance"),
    bottom_radiance: p.num("bottomRadiance", "radiance"),
    width: p.num("width", "lightSize", "m"),
    height: p.num("height", "lightSize", "m"),
    shape: p.codec(lightShape),
    color: p.codec(lightColor),
    use_temperature: p.codec(lightUseTemperature),
    temperature: p.codec(lightTemperature),
    part_only: p.bool("partOnly"),
  })),

  // -- camera ----------------------------------------------------------------------------------
  CameraObject: rnaType("camera", "Object", "bpy.data.objects['Camera']", "The one camera. It orbits its target and never rolls.", (p) => ({
    name: fixed("Camera", "the booth has one camera"),
    type: fixed("CAMERA"),
    location: p.codec(cameraLocation),
    rotation_euler: p.codec(cameraRotation),
    data: ptr("Camera"),
    booth: ptr("BoothCamera"),
    constraints: missing("the camera always looks at its target, scene.camera.booth.target"),
    matrix_world: missing("place the camera with location and aim it with booth.target or rotation_euler"),
  })),
  Camera: rnaType("camera", "Camera", "bpy.data.cameras['Camera']", "Perspective, 36 mm sensor, fit AUTO.", (p) => ({
    name: fixed("Camera"),
    type: fixed("PERSP", "the booth camera is perspective"),
    lens: p.num("focalMm", "focalMm", "mm"),
    lens_unit: fixed("MILLIMETERS"),
    sensor_width: fixed(36, "the booth's sensor is 36 mm"),
    sensor_fit: fixed("AUTO"),
    clip_start: p.codec({ type: "float m", wrap: "float", fields: [], readOnly: "fixed by the booth", get: (_, ctx) => ctx.scene.camera.clipStartM }),
    dof: ptr("CameraDOF"),
    angle: missing("set the field of view with lens (mm)"),
  })),
  CameraDOF: rnaType("camera", "CameraDOFSettings", "bpy.data.cameras['Camera'].dof", "Depth of field is always on.", (p) => ({
    use_dof: fixed(true, "the booth always renders depth of field; aperture_fstop up to 64 is near sharp"),
    aperture_fstop: p.num("fStop", "fStop"),
    focus_distance: p.codec(focusDistance),
    focus_object: missing("the focus is the camera's target unless dof.focus_distance is set"),
  })),
  BoothCamera: rnaType("camera", "BoothCameraSettings", "bpy.data.objects['Camera'].booth", "The point the camera orbits and looks at.", (p) => ({
    target: p.codec(cameraTarget),
  })),

  // -- world: the node tree render_scene.py builds, fixed -------------------------------------------
  World: rnaType("world", "World", "bpy.data.worlds['World']", "The HDR world.", () => ({
    name: fixed("World", "the booth has one world"),
    use_nodes: fixed(true),
    node_tree: ptr("WorldNodeTree"),
    color: missing("the world is an HDR image: nodes['Background'].inputs['Strength'] and nodes['Environment Texture'].image"),
  })),
  WorldNodeTree: rnaType("world", "ShaderNodeTree", WORLD_TREE, "Fixed: Mapping, Environment Texture, Background.", () => ({
    nodes: coll("world.nodes"),
    links: missing("the world's node tree is fixed: set the inputs of its nodes"),
  })),
  WorldBackground: rnaType("world", "ShaderNodeBackground", `${WORLD_TREE}.nodes['Background']`, "", () => ({
    name: fixed("Background"), type: fixed("BACKGROUND"), inputs: coll("world.background.inputs"),
  })),
  WorldColorInput: linkedSocket("NodeSocketColor", `${WORLD_TREE}.nodes['Background']`, "Color",
    "the world's colour is the HDR image: dim it with inputs['Strength']"),
  WorldStrengthInput: socket("world", "NodeSocketFloat", `${WORLD_TREE}.nodes['Background']`, "Strength", (p) => p.num("strength", "worldStrength")),
  WorldMapping: rnaType("world", "ShaderNodeMapping", `${WORLD_TREE}.nodes['Mapping']`, "", () => ({
    name: fixed("Mapping"), type: fixed("MAPPING"), inputs: coll("world.mapping.inputs"),
  })),
  WorldVectorInput: linkedSocket("NodeSocketVector", `${WORLD_TREE}.nodes['Mapping']`, "Vector", "linked from the Texture Coordinate node"),
  WorldLocationInput: fixedSocket("NodeSocketVectorTranslation", `${WORLD_TREE}.nodes['Mapping']`, "Location", [0, 0, 0], "the world only turns"),
  WorldRotationInput: socket("world", "NodeSocketVectorEuler", `${WORLD_TREE}.nodes['Mapping']`, "Rotation",
    (p) => p.codec(turnAboutZ<Studio["world"]>("rotationDeg", "worldRotationDeg", "the world turns about Z only: rotation x and y must be 0"))),
  WorldScaleInput: fixedSocket("NodeSocketVectorXYZ", `${WORLD_TREE}.nodes['Mapping']`, "Scale", [1, 1, 1], "the world only turns"),
  WorldEnvironment: rnaType("world", "ShaderNodeTexEnvironment", `${WORLD_TREE}.nodes['Environment Texture']`, "", (p) => ({
    name: fixed("Environment Texture"), type: fixed("TEX_ENVIRONMENT"),
    image: p.codec(worldImage),
  })),
  Image: rnaType("image", "Image", "bpy.data.images[{name}]", "An HDR the booth ships.", (p) => ({
    name: p.codec({ type: "str", wrap: null, fields: [], readOnly: "the file's name", get: (i) => i.file }),
    filepath: p.codec({ type: "str", wrap: null, fields: [], readOnly: "the booth ships its HDRs", get: (i) => i.url }),
    source: fixed("FILE"),
  })),

  // -- backdrop --------------------------------------------------------------------------------
  BackdropObject: rnaType("backdrop", "Object", "bpy.data.objects['Backdrop']", "The sweep: floor, cove and wall.", () => ({
    name: fixed("Backdrop"), type: fixed("MESH"),
    active_material: ptr("BackdropMaterial"),
    hide_render: missing("the sweep is always there; scene.render.film_transparent keeps only its shadows"),
    location: missing("the sweep stands where the booth puts it"),
  })),
  BackdropMaterial: rnaType("backdrop", "Material", "bpy.data.materials['Backdrop']", "", () => ({
    name: fixed("Backdrop"), use_nodes: fixed(true), node_tree: ptr("BackdropNodeTree"),
    diffuse_color: missing("set node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value"),
  })),
  BackdropNodeTree: rnaType("backdrop", "ShaderNodeTree", BACKDROP_TREE, "Fixed: one Principled BSDF.", () => ({
    nodes: coll("backdrop.nodes"), links: missing("the backdrop's node tree is fixed: set the inputs of its Principled BSDF"),
  })),
  BackdropPrincipled: rnaType("backdrop", "ShaderNodeBsdfPrincipled", `${BACKDROP_TREE}.nodes['Principled BSDF']`, "", () => ({
    name: fixed("Principled BSDF"), type: fixed("BSDF_PRINCIPLED"), inputs: coll("backdrop.principled.inputs"),
  })),
  BackdropBaseColorInput: socket("backdrop", "NodeSocketColor", `${BACKDROP_TREE}.nodes['Principled BSDF']`, "Base Color", (p) => p.codec(backdropColor)),
  BackdropMetallicInput: fixedSocket("NodeSocketFloatFactor", `${BACKDROP_TREE}.nodes['Principled BSDF']`, "Metallic", 0, "the sweep is a dielectric"),
  BackdropRoughnessInput: socket("backdrop", "NodeSocketFloatFactor", `${BACKDROP_TREE}.nodes['Principled BSDF']`, "Roughness",
    (p) => p.num("roughness", "backdropRoughness")),

  // -- the part ----------------------------------------------------------------------------------
  PartObject: rnaType("pose", "Object", "bpy.data.objects[{name}]", "The one printed part. It rests on a face, centred on the turntable.", (p) => ({
    name: p.codec(partName),
    type: fixed("MESH"),
    location: p.codec(partLocation),
    dimensions: p.codec(partDimensions),
    rotation_euler: p.codec(turnAboutZ<Pose>("turntableDeg", "turntableDeg",
      "the part rests on a face: choose it with obj.booth.rest_face, and turn it with rotation_euler.z")),
    active_material: ptr("FilamentMaterial"),
    booth: ptr("BoothPart"),
    data: missing("the part's mesh is the sliced print: change it with obj.booth.slicing or import another file"),
    scale: missing("the part is printed at its own size"),
    modifiers: missing("the part is the sliced print as it is"),
  })),
  BoothPart: rnaType("pose", "BoothPartSettings", "bpy.data.objects[{name}].booth", "How the part is posed, sliced and made.", (p) => ({
    rest_face: p.choice("restFace", bpyEnum(REST_FACES)),
    slicing: ptr("BoothSlicing"),
    filament: ptr("BoothFilament"),
  })),
  BoothSlicing: rnaType("slicing", "BoothSlicingSettings", "bpy.data.objects[{name}].booth.slicing",
    "Slicing for an STL, in the slicer's millimetres. A change re-slices; a G-code keeps its own.", (p) => ({
      layer_height_mm: p.num("layerHeight", "layerHeight", "mm"),
      outer_line_width_mm: p.num("outerLineWidth", "lineWidth", "mm"),
      inner_line_width_mm: p.num("innerLineWidth", "lineWidth", "mm"),
      wall_count: p.num("wallCount", "wallCount"),
      top_shell_layers: p.num("topShellLayers", "topShellLayers"),
      top_surface_pattern: p.choice("topSurfacePattern", bpyEnum(TOP_SURFACE_PATTERNS)),
      seam_position: p.choice("seamPosition", bpyEnum(SEAM_POSITIONS)),
    })),
  BoothFilament: rnaType("filament", "BoothFilamentSettings", "bpy.data.objects[{name}].booth.filament",
    "The filament. Its colour, IOR and anisotropy are on the material's Principled BSDF.", (p) => ({
      preset: p.codec(filamentPreset),
      gloss: p.num("gloss", "gloss"),
      bed: p.choice("bed", bpyEnum(["auto", ...BED_TYPES])),
      recipe: ptr("BoothRecipe"),
      imperfections: ptr("BoothImperfections"),
    })),
  BoothRecipe: rnaType("recipe", "BoothFilamentRecipe", "bpy.data.objects[{name}].booth.filament.recipe", "Optical numbers Blender has no input for.", (p) => ({
    variation: p.num("vary", "vary"),
    plate_roughness: p.num("peiRough", "roughness"),
    plate_far_roughness: p.num("peiFarRough", "roughness"),
    roughness: ptr("BoothRoughness"),
  })),
  BoothRoughness: rnaType("roughness", "BoothFilamentRoughness", "bpy.data.objects[{name}].booth.filament.recipe.roughness",
    "Roughness per printed feature, before gloss.", (p) => ({
      wall: p.num(0, "roughness"),
      top: p.num(1, "roughness"),
      bridge: p.num(2, "roughness"),
      bottom: p.num(3, "roughness"),
    })),
  BoothImperfections: rnaType("imperfections", "BoothImperfections", "bpy.data.objects[{name}].booth.filament.imperfections",
    "How layer heat and print speed show on the surface.", (p) => ({
      heat_gloss: p.num("heatGloss", "imperfection"),
      soft_lines: p.num("softLines", "imperfection"),
      speed_gloss: p.num("speedGloss", "imperfection"),
      cooling_tau_s: p.num("tauS", "coolingTauS", "s"),
      fan_cooling: p.num("fanCooling", "fanCooling"),
      overlay: p.choice("overlay", bpyEnum(OVERLAYS)),
    })),
  FilamentMaterial: rnaType("recipe", "Material", "bpy.data.materials['Filament']", "The printed filament.", () => ({
    name: fixed("Filament"), use_nodes: fixed(true), node_tree: ptr("FilamentNodeTree"),
    diffuse_color: missing("set node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value"),
  })),
  FilamentNodeTree: rnaType("recipe", "ShaderNodeTree", FILAMENT_TREE, "Fixed: one Principled BSDF.", () => ({
    nodes: coll("filament.nodes"), links: missing("the filament's node tree is fixed: set the inputs of its Principled BSDF"),
  })),
  FilamentPrincipled: rnaType("recipe", "ShaderNodeBsdfPrincipled", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "", () => ({
    name: fixed("Principled BSDF"), type: fixed("BSDF_PRINCIPLED"), inputs: coll("filament.principled.inputs"),
  })),
  FilamentBaseColorInput: socket("recipe", "NodeSocketColor", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "Base Color", (p) => p.codec(filamentColor)),
  FilamentMetallicInput: fixedSocket("NodeSocketFloatFactor", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "Metallic", 0, "filament is a dielectric"),
  FilamentRoughnessInput: linkedSocket("NodeSocketFloatFactor", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "Roughness",
    "the filament has a roughness per printed feature: obj.booth.filament.recipe.roughness, and obj.booth.filament.gloss over all of them"),
  FilamentIorInput: socket("recipe", "NodeSocketFloat", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "IOR", (p) => p.num("ior", "ior")),
  FilamentAnisotropicInput: socket("recipe", "NodeSocketFloatFactor", `${FILAMENT_TREE}.nodes['Principled BSDF']`, "Anisotropic",
    (p) => p.num("anisotropy", "anisotropy")),
};

/**
 * Document fields no attribute reaches, each with the reason. The coverage
 * test fails on a leaf that is in neither this list nor the table.
 */
export const UNMAPPED: Readonly<Record<string, string>> = {
  "version": "the format of the saved setup, not a setting",
  "studio.lights[].id": "a light's identity: Python holds it in the object's handle",
  "studio.lights[].kind": "chosen when the light is added: object.light_add makes an area light, booth.scrim_add a scrim",
  "output.viewTransform.kind": "always AgX: scene.view_settings.view_transform reads 'AgX'",
};

/** Every document path the table reads or writes, `[]` standing for any light. */
export function reachedFields(): readonly string[] {
  const out = new Set<string>();
  const join = (base: string, rest: string) => (base === "" ? rest : `${base}.${rest}`);
  for (const t of Object.values(RNA)) {
    const base = OWNERS[t.owner].path;
    if (base === null) continue;
    for (const prop of Object.values(t.props)) {
      if (prop.kind === "num" || prop.kind === "bool" || prop.kind === "choice" || prop.kind === "text") out.add(join(base, prop.key));
      if (prop.kind === "codec") for (const f of prop.codec.fields) out.add(join(base, f));
    }
  }
  return [...out].sort();
}

// ---- collections -----------------------------------------------------------------------------

export interface Member { readonly name: string; readonly handle: Handle; readonly type: RnaTypeName }

export interface CollectionContext { readonly doc: Readonly<BoothDocument>; readonly partName: string | null }

export interface CollectionDef {
  /** What a member is, for the reference. */
  readonly item: string;
  /** In order. host.ts makes the names unique, Blender style. */
  readonly members: (ctx: CollectionContext) => readonly Member[];
  /** collection.remove(member): the edit, or why that member stays. */
  readonly remove?: (member: Member) => Edit | string;
  /** collection.new(...) does not exist in the booth: this says what to do instead. */
  readonly newHint: string;
}

export type CollectionName =
  | "objects" | "lights" | "cameras" | "worlds" | "materials" | "images" | "scenes"
  | "world.nodes" | "world.background.inputs" | "world.mapping.inputs"
  | "backdrop.nodes" | "backdrop.principled.inputs" | "filament.nodes" | "filament.principled.inputs";

const FIXED_TREE = "the node tree is fixed: set the inputs of its nodes";
const ADD_LIGHTS = "add a light with bpy.ops.object.light_add(type='AREA', location=...) or a scrim with bpy.ops.booth.scrim_add(location=..., size=(w, h))";

const fixedMembers = (members: readonly Member[]) => () => members;
const objectMembers = ({ doc, partName }: CollectionContext): readonly Member[] => [
  { name: "Camera", handle: CAMERA, type: "CameraObject" },
  ...(partName === null ? [] : [{ name: partName, handle: PART, type: "PartObject" } as const]),
  { name: "Backdrop", handle: BACKDROP, type: "BackdropObject" },
  ...doc.studio.lights.map((l): Member => ({ name: l.name, handle: lightHandle(l.id), type: l.kind === "area" ? "LightObject" : "ScrimObject" })),
];
const removeObject = (member: Member): Edit | string =>
  member.handle.t === "light" ? removeLight(member.handle.id) : `the booth's ${member.name} cannot be removed`;

export const COLLECTIONS: { readonly [K in CollectionName]: CollectionDef } = {
  objects: { item: "Object: Camera, the part once one is open, Backdrop, then every light and scrim", members: objectMembers, remove: removeObject, newHint: ADD_LIGHTS },
  lights: {
    item: "AreaLight, named as their objects",
    members: (ctx) => uniqueNames(objectMembers(ctx)).filter((o) => o.type === "LightObject").map((o) => ({ ...o, type: "AreaLight" })),
    remove: removeObject,
    newHint: ADD_LIGHTS,
  },
  cameras: { item: "Camera", members: fixedMembers([{ name: "Camera", handle: CAMERA, type: "Camera" }]), newHint: "the booth has one camera: bpy.context.scene.camera" },
  worlds: { item: "World", members: fixedMembers([{ name: "World", handle: WORLD, type: "World" }]), newHint: "the booth has one world" },
  materials: {
    item: "Material: Backdrop and Filament",
    members: fixedMembers([{ name: "Backdrop", handle: BACKDROP, type: "BackdropMaterial" }, { name: "Filament", handle: PART, type: "FilamentMaterial" }]),
    newHint: "the booth has two materials: bpy.data.materials['Backdrop'] and ['Filament']",
  },
  images: {
    item: "Image: the HDRs the booth ships",
    members: fixedMembers(HDR_IMAGES.map((i) => ({ name: i.file, handle: { t: "image", id: i.id }, type: "Image" }))),
    newHint: "the booth ships its HDRs: pick one from bpy.data.images",
  },
  scenes: { item: "Scene", members: fixedMembers([{ name: "Scene", handle: SCENE, type: "Scene" }]), newHint: "the booth has one scene" },
  "world.nodes": {
    item: "ShaderNode: Mapping, Environment Texture, Background",
    members: fixedMembers([
      { name: "Mapping", handle: WORLD, type: "WorldMapping" },
      { name: "Environment Texture", handle: WORLD, type: "WorldEnvironment" },
      { name: "Background", handle: WORLD, type: "WorldBackground" },
    ]),
    newHint: FIXED_TREE,
  },
  "world.background.inputs": {
    item: "NodeSocket: Color, Strength",
    members: fixedMembers([{ name: "Color", handle: WORLD, type: "WorldColorInput" }, { name: "Strength", handle: WORLD, type: "WorldStrengthInput" }]),
    newHint: FIXED_TREE,
  },
  "world.mapping.inputs": {
    item: "NodeSocket: Vector, Location, Rotation, Scale",
    members: fixedMembers([
      { name: "Vector", handle: WORLD, type: "WorldVectorInput" },
      { name: "Location", handle: WORLD, type: "WorldLocationInput" },
      { name: "Rotation", handle: WORLD, type: "WorldRotationInput" },
      { name: "Scale", handle: WORLD, type: "WorldScaleInput" },
    ]),
    newHint: FIXED_TREE,
  },
  "backdrop.nodes": { item: "ShaderNode: Principled BSDF", members: fixedMembers([{ name: "Principled BSDF", handle: BACKDROP, type: "BackdropPrincipled" }]), newHint: FIXED_TREE },
  "backdrop.principled.inputs": {
    item: "NodeSocket: Base Color, Metallic, Roughness",
    members: fixedMembers([
      { name: "Base Color", handle: BACKDROP, type: "BackdropBaseColorInput" },
      { name: "Metallic", handle: BACKDROP, type: "BackdropMetallicInput" },
      { name: "Roughness", handle: BACKDROP, type: "BackdropRoughnessInput" },
    ]),
    newHint: FIXED_TREE,
  },
  "filament.nodes": { item: "ShaderNode: Principled BSDF", members: fixedMembers([{ name: "Principled BSDF", handle: PART, type: "FilamentPrincipled" }]), newHint: FIXED_TREE },
  "filament.principled.inputs": {
    item: "NodeSocket: Base Color, Metallic, Roughness, IOR, Anisotropic",
    members: fixedMembers([
      { name: "Base Color", handle: PART, type: "FilamentBaseColorInput" },
      { name: "Metallic", handle: PART, type: "FilamentMetallicInput" },
      { name: "Roughness", handle: PART, type: "FilamentRoughnessInput" },
      { name: "IOR", handle: PART, type: "FilamentIorInput" },
      { name: "Anisotropic", handle: PART, type: "FilamentAnisotropicInput" },
    ]),
    newHint: FIXED_TREE,
  },
};

/** "Key", "Key" becomes "Key", "Key.001", as Blender names a second object. Earlier members keep their names. */
export function uniqueNames(members: readonly Member[]): readonly Member[] {
  const taken = new Set<string>();
  return members.map((member) => {
    const name = uniqueName(member.name, taken);
    taken.add(name);
    return name === member.name ? member : { ...member, name };
  });
}

/** `name`, or the first free `stem.001`, `stem.002`, ... when it is taken. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const stem = name.replace(/\.\d{3}$/, "");
  for (let n = 1; ; n++) {
    const candidate = `${stem}.${String(n).padStart(3, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---- operators -------------------------------------------------------------------------------

export type OpResult = "FINISHED" | "CANCELLED";

/** What an operator may do. AgentHost implements it for the running script. */
export interface OpHost {
  /** One booth.update. A DocumentError becomes a ValueError naming `what`. */
  edit(edit: Edit, what: string): void;
  /** Adds a light or a scrim in one booth.update, placed by the location codec, and makes it bpy.context.object. */
  addLight(kind: StudioLight["kind"], name: string, location: Json, size: Json): void;
  /** Reads a file from the agent's machine, opens it and waits until it is sliced. The part becomes bpy.context.object. */
  open(path: string, accept: "stl" | "gcode"): Promise<void>;
  /** Takes a photo through the photo card, as PHOTO does. */
  photo(writeStill: boolean): Promise<OpResult>;
  /** A raster render of the current setup at a small size. */
  preview(writeStill: boolean): Promise<void>;
}

export type OpParam =
  | { readonly kind: "enum"; readonly items: readonly string[]; readonly default: string | null }
  | { readonly kind: "bool"; readonly default: boolean }
  | { readonly kind: "vector"; readonly size: number; readonly default: null }
  | { readonly kind: "path" }
  /** Accepted at its default only: any other value would be ignored, so it is refused. */
  | { readonly kind: "fixed"; readonly default: Json; readonly why: string };

export type OpArgs = Readonly<Record<string, Json>>;

export interface OpDef {
  readonly doc: string;
  /** Unknown keyword arguments raise TypeError, as Blender's do. */
  readonly params: Readonly<Record<string, OpParam>>;
  /** A promise makes the operator blocking: the script waits for it and the tab stays live. */
  readonly run: (args: OpArgs, host: OpHost) => OpResult | Promise<OpResult>;
}

export type OpName =
  | "object.light_add" | "booth.scrim_add" | "wm.stl_import" | "booth.gcode_import"
  | "render.render" | "render.opengl" | "booth.look_apply" | "booth.filament_apply";

const LOOK_ENUM = bpyEnum(LOOK_IDS);
const PRESET_ENUM = bpyEnum(FILAMENT_PRESET_IDS);

const LIGHT_TYPES: Readonly<Record<string, string>> = {
  POINT: "A point light is a small area light: light_add(type='AREA', ...), then data.size = 0.05.",
  SPOT: "A spot is an area light with a small size and a narrow spread: light_add(type='AREA', ...), then data.size = 0.1 and data.spread = math.radians(30).",
  SUN: "For sunlight use a small, strong area light far away, or brighten the world: scene.world.node_tree.nodes['Background'].inputs['Strength'].",
};

const enumParam = (items: readonly string[], dflt: string | null = null): OpParam => ({ kind: "enum", items, default: dflt });
const boolParam = (dflt: boolean): OpParam => ({ kind: "bool", default: dflt });
const vectorParam = (size: number): OpParam => ({ kind: "vector", size, default: null });
const fixedParam = (dflt: Json, why: string): OpParam => ({ kind: "fixed", default: dflt, why });
const PATH: OpParam = { kind: "path" };
const STILLS = fixedParam(false, "the booth renders stills");

export const OPS: { readonly [K in OpName]: OpDef } = {
  "object.light_add": {
    doc: "Adds an area light facing the subject and makes it bpy.context.object. Without location it takes a free spot. Only type='AREA' exists.",
    params: {
      type: enumParam(["AREA", ...Object.keys(LIGHT_TYPES)], "POINT"),
      location: vectorParam(3),
      rotation: fixedParam([0, 0, 0], "a booth light always faces the subject, so place it with location alone"),
      align: fixedParam("WORLD", "a booth light always faces the subject"),
      radius: fixedParam(1, "set data.size and data.size_y after adding it"),
      scale: fixedParam([0, 0, 0], "set data.size and data.size_y after adding it"),
    },
    run: (args, host) => {
      if (args.type !== "AREA") throw new HostError("RuntimeError", `light_add: the booth has area lights only (type='AREA'). ${LIGHT_TYPES[String(args.type)]}`);
      host.addLight("area", "Area", args.location, null);
      return "FINISHED";
    },
  },
  "booth.scrim_add": {
    doc: "Adds a scrim, a card glowing with a vertical gradient that the camera does not see, and makes it bpy.context.object. size is (width, height) in metres.",
    params: { location: vectorParam(3), size: vectorParam(2) },
    run: (args, host) => {
      host.addLight("scrim", "Scrim", args.location, args.size);
      return "FINISHED";
    },
  },
  "wm.stl_import": {
    doc: "Opens an STL from the agent's machine as the part, replacing the one before, and waits until it is sliced. A relative path or // is the agent's folder.",
    params: {
      filepath: PATH,
      global_scale: fixedParam(1, "the part is printed at its own size"),
      forward_axis: fixedParam("Y", "the part keeps the printer's axes"),
      up_axis: fixedParam("Z", "the part keeps the printer's axes"),
      use_scene_unit: fixedParam(false, "an STL is read in millimetres"),
    },
    run: async (args, host): Promise<OpResult> => {
      await host.open(String(args.filepath), "stl");
      return "FINISHED";
    },
  },
  "booth.gcode_import": {
    doc: "Opens a .gcode or .gcode.3mf from the agent's machine as the part, with the slicing it was printed with.",
    params: { filepath: PATH },
    run: async (args, host): Promise<OpResult> => {
      await host.open(String(args.filepath), "gcode");
      return "FINISHED";
    },
  },
  "render.render": {
    doc: "Takes a Cycles photo, as PHOTO does, and waits for it. The photo card in the tab shows it. With write_still=True it is written to scene.render.filepath: a path ending in .png is the file, anything else a folder.",
    params: { write_still: boolParam(false), animation: STILLS },
    run: (args, host) => host.photo(args.write_still === true),
  },
  "render.opengl": {
    doc: "A quick raster render of the current setup, 768 px on the long edge, to look at before a photo. Not a Cycles photo.",
    params: { write_still: boolParam(false), animation: STILLS },
    run: async (args, host): Promise<OpResult> => {
      await host.preview(args.write_still === true);
      return "FINISHED";
    },
  },
  "booth.look_apply": {
    doc: "Replaces the lights, backdrop, world and floor cards with one of the booth's looks.",
    params: { look: enumParam(Object.keys(LOOK_ENUM)) },
    run: (args, host) => {
      host.edit(applyLook(LOOK_ENUM[String(args.look)]), "booth.look_apply");
      return "FINISHED";
    },
  },
  "booth.filament_apply": {
    doc: "Copies a filament preset's recipe in and resets gloss. Imperfections and bed stay.",
    params: { preset: enumParam(Object.keys(PRESET_ENUM)) },
    run: (args, host) => {
      host.edit(applyFilamentPreset(PRESET_ENUM[String(args.preset)]), "booth.filament_apply");
      return "FINISHED";
    },
  },
};

/** Blender operators agents reach for, with the booth's way instead. */
export const OPS_MISSING: Readonly<Record<string, string>> = {
  "import_mesh.stl": "bpy.ops.import_mesh.stl was removed in Blender 4.2. Use bpy.ops.wm.stl_import(filepath=...)",
  "mesh.primitive_cube_add": "the booth holds one printed part: bpy.ops.wm.stl_import or bpy.ops.booth.gcode_import",
  "mesh.primitive_plane_add": "for a reflector or a glowing card use bpy.ops.booth.scrim_add(location=..., size=(w, h))",
  "object.camera_add": "the booth has one camera: bpy.context.scene.camera",
  "object.delete": "selection is not in the booth: remove a light with bpy.data.objects.remove(obj)",
  "object.select_all": "selection is not in the booth: operators act on what you name",
  "wm.read_factory_settings": "apply a look with bpy.ops.booth.look_apply(look=...)",
  "wm.save_as_mainfile": "the setup saves itself in the browser; Setup, Export JSON writes it as a file",
  "wm.save_mainfile": "the setup saves itself in the browser; Setup, Export JSON writes it as a file",
};

// ---- the reference -------------------------------------------------------------------------------

function rangeText(b: Bounds, scale: number): string {
  const f = (v: number) => fmt(v * scale);
  const low = b.gt !== undefined ? `more than ${f(b.gt)}` : b.min !== undefined ? f(b.min) : null;
  if (b.max === undefined) return low === null ? "any" : b.gt !== undefined ? low : `at least ${low}`;
  if (low === null) return `at most ${f(b.max)}`;
  return b.gt !== undefined ? `${low}, at most ${f(b.max)}` : `${low} to ${f(b.max)}`;
}

/** The range of a num prop in bpy units: "0 to 1000000". Shared with host.ts's out-of-range errors. */
export function propRange(bounds: BoundsKey, scale: number): string {
  return rangeText(BOUNDS[bounds], scale);
}

function describe(prop: Prop): string {
  switch (prop.kind) {
    case "num": {
      const b: Bounds = BOUNDS[prop.bounds];
      return `${b.int ? "int" : "float"}${prop.unit === "" ? "" : ` ${prop.unit}`}, ${rangeText(b, prop.scale)}`;
    }
    case "bool": return "bool";
    case "choice": return `enum in [${Object.keys(prop.map).map((k) => pyRepr(k)).join(", ")}]`;
    case "text": return `str, unique among bpy.data.${prop.unique}`;
    case "codec": {
      const c = prop.codec;
      const range = c.bounds === undefined ? "" : `, ${rangeText(BOUNDS[c.bounds], c.scale ?? 1)}`;
      return `${c.type}${range}${c.readOnly === undefined ? "" : `. Read-only: ${c.readOnly}`}`;
    }
    case "fixed": return `${pyRepr(prop.value)}, fixed${prop.why === "" ? "" : `: ${prop.why}`}`;
    case "pointer": return `${RNA[prop.type].pyClass}, see ${prop.type}`;
    case "collection": return `collection of ${COLLECTIONS[prop.collection].item}`;
    case "session": return prop.key === "active"
      ? "Object or None, read-only: what the last operator added or imported"
      : `str, where render.render(write_still=True) writes, kept for this agent session, default ${pyRepr(DEFAULT_RENDER_FILEPATH)}`;
    case "missing": return `not in the booth: ${prop.hint}`;
  }
}

function describeParam(name: string, p: OpParam): string {
  switch (p.kind) {
    case "enum": return `${name}: enum in [${p.items.map((i) => pyRepr(i)).join(", ")}]${p.default === null ? ", required" : `, default ${pyRepr(p.default)}`}`;
    case "bool": return `${name}: bool, default ${pyRepr(p.default)}`;
    case "vector": return `${name}: float[${p.size}], optional`;
    case "path": return `${name}: str, required, a path on the agent's machine`;
    case "fixed": return `${name}: only ${pyRepr(p.default)}: ${p.why}`;
  }
}

function typeSection(name: RnaTypeName): string {
  const t = RNA[name];
  const lines = [`${name}: ${t.pyClass}, ${t.path.replace("{name}", "<name>")}`];
  if (t.doc !== "") lines.push(`  ${t.doc}`);
  for (const [attr, prop] of Object.entries(t.props)) lines.push(`  .${attr}: ${describe(prop)}`);
  return lines.join("\n");
}

function opSection(name: OpName): string {
  const op = OPS[name];
  return [`bpy.ops.${name}(...)`, `  ${op.doc}`, ...Object.entries(op.params).map(([p, param]) => `  ${describeParam(p, param)}`)].join("\n");
}

const PREAMBLE = [
  "The booth's bpy: Blender 5.2's Python API over the booth's one scene.",
  "Reading an attribute reads the booth now. Each assignment is one edit to it, checked against the booth's limits.",
  "Ranges below are those limits in bpy units. Lengths are metres and angles radians unless a name says otherwise.",
  "Each script starts with fresh globals; the scene, scene.render.filepath and bpy.context.object carry over.",
].join("\n");

/** bpy.booth.reference(only): every type and operator, or the one named (a type, a Python class or an operator). */
export function referenceText(only: string | null = null): string {
  const types = Object.keys(RNA) as RnaTypeName[];
  const ops = Object.keys(OPS) as OpName[];
  if (only !== null) {
    const opName = only.replace(/^bpy\.ops\./, "");
    const picked = [
      ...types.filter((t) => t === only || RNA[t].pyClass === only).map(typeSection),
      ...ops.filter((o) => o === opName).map(opSection),
    ];
    if (picked.length === 0) throw new HostError("ValueError", `reference: no type or operator named ${pyRepr(only)}. Types: ${types.join(", ")}. Operators: ${ops.join(", ")}`);
    return picked.join("\n\n");
  }
  return [
    PREAMBLE,
    ...types.map(typeSection),
    "Operators",
    ...ops.map(opSection),
    ["Blender operators the booth does not have", ...Object.entries(OPS_MISSING).map(([o, hint]) => `  bpy.ops.${o}: ${hint}`)].join("\n"),
  ].join("\n\n");
}
