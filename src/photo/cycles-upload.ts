/**
 * cycles-upload.ts: a Scene into the Cycles C API (cycles/api/), the passes back out. Runs in
 * the Cycles worker and, for the tests, in Node. No DOM and no worker globals.
 *
 * The part's per-vertex data is derived here, once: the roughness table expanded to a `rough`
 * attribute, `layers.flatten` applied to wall normals, the plate mask from PLATE_EPS, and the
 * path tangent. tools/blender/render_scene.py derives the same arrays independently in NumPy,
 * so the parity tool checks this code too.
 */
import { BEAD_WORD, PLATE_EPS, SPEED_STEP_MMS, unpackBeadWord, type BeadMesh } from "../print";
import { ROUGH_MIN, type BackdropSection, type BeadMaterial, type Emitter, type FloorCardRing, type PartSection, type Scene } from "../scene";

/** The exports of public/cycles/cycles_booth.mjs. Pointers are byte offsets into wasmMemory. */
export interface CyclesModule {
  readonly wasmMemory: WebAssembly.Memory;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  UTF8ToString(ptr: number): string;
  stringToUTF8(text: string, ptr: number, maxBytes: number): void;
  lengthBytesUTF8(text: string): number;
  _cb_session_create(width: number, height: number, threads: number): number;
  _cb_film(samples: number, adaptiveThreshold: number, maxBounces: number, diffuseBounces: number,
    glossyBounces: number, transmissionBounces: number, clampDirect: number, clampIndirect: number,
    filterWidthPx: number, transparent: number, auxPasses: number): void;
  _cb_camera(px: number, py: number, pz: number, tx: number, ty: number, tz: number,
    ux: number, uy: number, uz: number, fovY: number, apertureRadius: number,
    focusDistance: number, clipStart: number): void;
  _cb_mesh(nverts: number, ntris: number, positions: number, indices: number, normals: number): number;
  _cb_mesh_attribute(mesh: number, name: number, components: number, data: number): number;
  _cb_object(mesh: number, shader: number, tfm: number, flags: number): number;
  _cb_shader_bead(r: number, g: number, b: number, ior: number, anisotropy: number,
    mottleScale: number, mottleAmp: number, roughMin: number, plateRough: number,
    plateTextured: number, grainPerM: number, bumpDistanceM: number): number;
  _cb_shader_principled(r: number, g: number, b: number, roughness: number): number;
  _cb_area_light(frame: number, sizeX: number, sizeY: number, ellipse: number, powerW: number,
    r: number, g: number, b: number, spread: number, partOnly: number): number;
  _cb_scrim(frame: number, sizeX: number, sizeY: number, ellipse: number, r: number, g: number,
    b: number, top: number, bottom: number, partOnly: number): number;
  _cb_floor_ring(cx: number, cy: number, cz: number, inner: number, outer: number, key: number,
    far: number, keyAzimuth: number): number;
  _cb_world_image(rgb: number, width: number, height: number, strength: number, rotationZ: number): number;
  _cb_world_color(r: number, g: number, b: number, strength: number): void;
  _cb_render_start(): number;
  _cb_render_state(): number;
  _cb_render_sample(): number;
  _cb_finish(): void;
  _cb_cancel(): void;
  _cb_passes_version(): number;
  _cb_passes_lock(): number;
  _cb_pass(which: number): number;
  _cb_passes_unlock(): void;
  _cb_time_ms(which: number): number;
  _cb_heap_bytes(): number;
  _cb_cycles_peak_bytes(): number;
  _cb_threads(): number;
  _cb_error(): number;
  _cb_set_log_level(level: number): void;
  _cb_take_log(): number;
  _cb_session_free(): void;
}

type CyclesFactory = (options: { boothPoolSize: number }) => Promise<CyclesModule>;

/** Loads and instantiates the module. `poolSize` workers start up front: Cycles runs one
 *  thread per hardware thread plus its own. */
export async function loadCycles(moduleUrl: string, poolSize: number): Promise<CyclesModule> {
  // The one boundary where the Emscripten glue meets our types.
  const glue = (await import(/* @vite-ignore */ moduleUrl)) as { default: CyclesFactory };
  return glue.default({ boothPoolSize: poolSize });
}

/** cb_render_state values (cycles/api/booth.h RenderState). */
export const RenderState = { idle: 0, running: 1, done: 2, cancelled: 3, failed: 4 } as const;
const OBJECT_PART = 1;
const OBJECT_SHADOW_CATCHER = 2;
const PASS_RGBA = 0;
const PASS_ALBEDO = 1;
const PASS_NORMAL = 2;
const IDENTITY = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

export interface WorldImage {
  readonly width: number;
  readonly height: number;
  /** Linear RGB, top row first. */
  readonly rgb: Float32Array;
}

// ---- the part's per-vertex data ---------------------------------------------------------

/** BeadMaterial's roughness before mottle: table[layer][feature] + speedRel * speedGain. */
export function partRoughness(mesh: BeadMesh, material: BeadMaterial, out: Float32Array = new Float32Array(mesh.word.length)): Float32Array {
  const { rough, count } = material.layers;
  for (let v = 0; v < mesh.word.length; v++) {
    const word = mesh.word[v];
    const feature = unpackBeadWord(word, BEAD_WORD.feature);
    const layer = Math.min(unpackBeadWord(word, BEAD_WORD.layer), count - 1);
    const speed = unpackBeadWord(word, BEAD_WORD.speed) * SPEED_STEP_MMS;
    const speedRel = Math.min(1, Math.max(-1, speed / mesh.vRefMmS - 1));
    out[v] = rough[layer * 4 + feature] + speedRel * material.speedGain;
  }
  return out;
}

/** Unit vertex normals with each wall vertex's vertical component scaled by its layer's
 *  `flatten` (feature 0 is a wall; skins keep their normals). */
export function partNormals(mesh: BeadMesh, material: BeadMaterial, out: Float32Array = new Float32Array(mesh.normal.length)): Float32Array {
  const { flatten, count } = material.layers;
  for (let v = 0; v < mesh.word.length; v++) {
    const word = mesh.word[v];
    const isWall = unpackBeadWord(word, BEAD_WORD.feature) === 0;
    const f = isWall ? flatten[Math.min(unpackBeadWord(word, BEAD_WORD.layer), count - 1)] : 1;
    const x = mesh.normal[v * 3];
    const y = mesh.normal[v * 3 + 1];
    const z = mesh.normal[v * 3 + 2] * f;
    const s = 1 / (Math.hypot(x, y, z) || 1);
    out[v * 3] = x * s;
    out[v * 3 + 1] = y * s;
    out[v * 3 + 2] = z * s;
  }
  return out;
}

/** 1 on vertices of the face printed on the bed. */
export function plateMask(mesh: BeadMesh, out: Float32Array = new Float32Array(mesh.word.length)): Float32Array {
  for (let v = 0; v < out.length; v++) out[v] = mesh.position[v * 3 + 2] <= PLATE_EPS ? 1 : 0;
  return out;
}

/** The print path direction, dequantised. */
export function pathTangents(mesh: BeadMesh, out: Float32Array = new Float32Array(mesh.tangent.length)): Float32Array {
  for (let i = 0; i < out.length; i++) out[i] = mesh.tangent[i] / 32767;
  return out;
}

// ---- heap traffic --------------------------------------------------------------------------

function fail(M: CyclesModule, what: string): never {
  throw new Error(`${what}: ${M.UTF8ToString(M._cb_error())}`);
}

function check(M: CyclesModule, rc: number, what: string): number {
  if (rc < 0) fail(M, what);
  return rc;
}

/** Allocates `count` floats (or 32-bit ints) on the wasm heap, lets `fill` write them, calls
 *  `use` with the pointer and frees. Filling in place keeps the 10-million-triangle upload from
 *  holding a second JavaScript copy of every derived array. */
function onHeap<T>(M: CyclesModule, count: number, fill: (view: Float32Array) => void, use: (ptr: number) => T): T {
  const ptr = M._malloc(count * 4);
  if (!ptr) throw new Error(`malloc of ${count * 4} bytes failed: the wasm heap is full`);
  try {
    fill(new Float32Array(M.wasmMemory.buffer, ptr, count));
    return use(ptr);
  } finally {
    M._free(ptr);
  }
}

function copyToHeap<T>(M: CyclesModule, data: Float32Array | Uint32Array, use: (ptr: number) => T): T {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return onHeap(M, data.length, (view) => new Uint8Array(view.buffer, view.byteOffset, bytes.length).set(bytes), use);
}

function heapString<T>(M: CyclesModule, text: string, use: (ptr: number) => T): T {
  const bytes = M.lengthBytesUTF8(text) + 1;
  const ptr = M._malloc(bytes);
  try {
    M.stringToUTF8(text, ptr, bytes);
    return use(ptr);
  } finally {
    M._free(ptr);
  }
}

function attribute(M: CyclesModule, mesh: number, name: string, components: 1 | 3, count: number, fill: (view: Float32Array) => void): void {
  onHeap(M, count * components, fill, (data) =>
    heapString(M, name, (namePtr) => check(M, M._cb_mesh_attribute(mesh, namePtr, components, data), `attribute ${name}`)));
}

// ---- the scene -----------------------------------------------------------------------------

/** Builds the whole scene in a fresh session. `threads` 0 uses every hardware thread. */
export function uploadScene(M: CyclesModule, scene: Scene, world: WorldImage, threads = 0): void {
  const { film, camera } = scene;
  check(M, M._cb_session_create(film.width, film.height, threads), "session");
  M._cb_film(film.samples, film.adaptiveThreshold, film.maxBounces, film.diffuseBounces, film.glossyBounces,
    film.transmissionBounces, film.clampDirect, film.clampIndirect, film.filterWidthPx, film.transparent ? 1 : 0, 1);
  M._cb_camera(...camera.position, ...camera.target, ...camera.up, camera.fovYRad, camera.apertureRadiusM,
    camera.focusDistanceM, camera.clipStartM);
  copyToHeap(M, world.rgb, (rgb) =>
    check(M, M._cb_world_image(rgb, world.width, world.height, scene.world.strength, scene.world.rotationRad), "world"));
  if (scene.part) uploadPart(M, scene.part);
  uploadBackdrop(M, scene.backdrop);
  for (const emitter of scene.lights.emitters) uploadEmitter(M, emitter);
  if (scene.lights.floorCards) uploadFloorCards(M, scene.lights.floorCards);
}

function uploadPart(M: CyclesModule, part: PartSection): void {
  const { mesh, material } = part;
  const nverts = mesh.position.length / 3;
  const handle = onHeap(M, nverts * 3, (normals) => partNormals(mesh, material, normals), (normals) =>
    copyToHeap(M, mesh.position, (positions) =>
      copyToHeap(M, mesh.index, (indices) =>
        check(M, M._cb_mesh(nverts, mesh.index.length / 3, positions, indices, normals), "part mesh"))));
  attribute(M, handle, "rough", 1, nverts, (out) => partRoughness(mesh, material, out));
  attribute(M, handle, "plate", 1, nverts, (out) => plateMask(mesh, out));
  // Not "tangent": Cycles resolves that name to the UV tangent, not to a mesh attribute.
  attribute(M, handle, "path_tangent", 3, nverts, (out) => pathTangents(mesh, out));
  const { baseColor, plate } = material;
  const shader = check(M, M._cb_shader_bead(...baseColor, material.ior, material.anisotropy, material.mottleScale,
    material.mottleAmp, ROUGH_MIN, plate.rough, plate.textured ? 1 : 0, plate.grainPerM, plate.bumpDistanceM), "bead shader");
  copyToHeap(M, Float32Array.from(part.toWorld), (tfm) => check(M, M._cb_object(handle, shader, tfm, OBJECT_PART), "part"));
}

function uploadBackdrop(M: CyclesModule, backdrop: BackdropSection): void {
  const handle = copyToHeap(M, backdrop.positions, (positions) =>
    copyToHeap(M, backdrop.index, (indices) =>
      copyToHeap(M, backdrop.normals, (normals) =>
        check(M, M._cb_mesh(backdrop.positions.length / 3, backdrop.index.length / 3, positions, indices, normals), "backdrop mesh"))));
  const shader = check(M, M._cb_shader_principled(...backdrop.albedo, backdrop.roughness), "backdrop shader");
  copyToHeap(M, IDENTITY, (tfm) =>
    check(M, M._cb_object(handle, shader, tfm, backdrop.shadowCatcher ? OBJECT_SHADOW_CATCHER : 0), "backdrop"));
}

function uploadEmitter(M: CyclesModule, e: Emitter): void {
  const frame = Float32Array.of(...e.centre, ...e.xAxis, ...e.yAxis, ...e.normal);
  const [sx, sy] = e.sizeM;
  const ellipse = e.shape === "ellipse" ? 1 : 0;
  const partOnly = e.partOnly ? 1 : 0;
  copyToHeap(M, frame, (f) => e.kind === "area"
    ? check(M, M._cb_area_light(f, sx, sy, ellipse, e.powerW, ...e.color, e.spreadRad, partOnly), `light ${e.id}`)
    : check(M, M._cb_scrim(f, sx, sy, ellipse, ...e.color, e.topRadiance, e.bottomRadiance, partOnly), `scrim ${e.id}`));
}

function uploadFloorCards(M: CyclesModule, ring: FloorCardRing): void {
  check(M, M._cb_floor_ring(...ring.centre, ring.innerRadiusM, ring.outerRadiusM, ring.keyRadiance, ring.farRadiance,
    ring.keyAzimuthRad), "floor cards");
}

// ---- passes --------------------------------------------------------------------------------

export interface Passes {
  readonly samples: number;
  readonly rgba: Float32Array;
  readonly albedo: Float32Array | null;
  readonly normal: Float32Array | null;
}

/** Copies the newest snapshot out of the heap, or null before the first one. */
export function readPasses(M: CyclesModule, width: number, height: number): Passes | null {
  const n = width * height * 4;
  const samples = M._cb_passes_lock();
  try {
    const copy = (which: number) => {
      const ptr = M._cb_pass(which);
      return ptr ? new Float32Array(M.wasmMemory.buffer, ptr, n).slice() : null;
    };
    const rgba = copy(PASS_RGBA);
    return rgba && { samples, rgba, albedo: copy(PASS_ALBEDO), normal: copy(PASS_NORMAL) };
  } finally {
    M._cb_passes_unlock();
  }
}

// ---- world image ---------------------------------------------------------------------------

/** Radiance RGBE (.hdr), `-Y h +X w` orientation, flat or new run-length scanlines. Decodes as
 *  OpenImageIO and Blender do: mantissa * 2^(exponent - 136), no half-step offset. */
export function decodeRgbe(bytes: Uint8Array): WorldImage {
  let pos = 0;
  const line = () => {
    const start = pos;
    while (pos < bytes.length && bytes[pos] !== 0x0a) pos++;
    return new TextDecoder().decode(bytes.subarray(start, pos++));
  };
  if (!line().startsWith("#?")) throw new Error("not a Radiance HDR file");
  for (let l = line(); l !== ""; l = line()) {
    if (l.startsWith("FORMAT=") && l !== "FORMAT=32-bit_rle_rgbe") throw new Error(`unsupported HDR ${l}`);
  }
  const size = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!size) throw new Error("unsupported HDR orientation");
  const height = Number(size[1]);
  const width = Number(size[2]);
  const rgb = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const runLength = width >= 8 && width < 32768 && bytes[pos] === 2 && bytes[pos + 1] === 2 && (bytes[pos + 2] & 0x80) === 0;
    if (runLength) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        for (let x = 0; x < width;) {
          let count = bytes[pos++];
          if (count > 128) {
            count -= 128;
            const value = bytes[pos++];
            for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = value;
          } else {
            for (let i = 0; i < count; i++) scan[(x++) * 4 + c] = bytes[pos++];
          }
        }
      }
    } else {
      scan.set(bytes.subarray(pos, pos + width * 4));
      pos += width * 4;
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3];
      const f = e === 0 ? 0 : 2 ** (e - 136);
      const o = (y * width + x) * 3;
      rgb[o] = scan[x * 4] * f;
      rgb[o + 1] = scan[x * 4 + 1] * f;
      rgb[o + 2] = scan[x * 4 + 2] * f;
    }
  }
  return { width, height, rgb };
}

// ---- memory --------------------------------------------------------------------------------

/** wasm32 caps the heap at 4 GiB. */
export const HEAP_LIMIT_BYTES = 4 * 1024 ** 3;

/** Peak heap: a fixed base plus a cost per part triangle plus the film buffers. Measured with
 *  tools/parity (see cycles/README.md). */
export function estimateHeapBytes(partTriangles: number, pixels: number): number {
  return BASE_BYTES + partTriangles * BYTES_PER_TRIANGLE + pixels * BYTES_PER_PIXEL;
}
const BASE_BYTES = 310e6;
const BYTES_PER_TRIANGLE = 165;
const BYTES_PER_PIXEL = 200;
