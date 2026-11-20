/**
 * film.ts: a linear float frame in, a deliverable image out. Both photo
 * engines return RadianceFrames and both go through here, so tone, file
 * format and naming never depend on which engine ran.
 *
 * The tone map is Blender 5.2.3's AgX, not an approximation. tools/blender/
 * bake_agx.py bakes Blender's own colour config into public/lut/, and this
 * file and the preview shader both read those files, so they cannot drift.
 * Per pixel, for linear Rec.709 `rgb` (the layout and ranges are in
 * manifest.json, and bake_agx.py documents how each file was made):
 *
 *   e  = toWorking * rgb                       Rec.709 to E-Gamut
 *   t  = max((log2 e - log2Min) / (log2Max - log2Min), tFloor)     per channel, unclamped
 *   s  = clamp((log2 rgb - log2Min) / (preLog2Max - log2Min), 0, 1) per channel
 *   t' = clamp(t + trilinear(pre, s), 0, 1)    skipped for the "none" look
 *   c  = tetrahedral(base, t')
 *   out = srgbEncode(max(c, 0) ^ 2.4)
 *
 * Sampling the same files in a shader, as 3D textures of N^3 texels, red along
 * x, green along y, blue along z. Both are RGB16F (three.js Data3DTexture,
 * HalfFloatType; pad each texel to RGBA with alpha 1, since RGBFormat is gone):
 *
 *   texel centre of grid node k is (k + 0.5) / N, so for a coordinate x in
 *   0..1 the texture coordinate is (x * (N - 1) + 0.5) / N.
 *   pre:  LinearFilter, clamp to edge. Hardware trilinear is the same
 *         interpolation as here. Skip it for "none".
 *   base: NearestFilter and four texelFetch calls, never LinearFilter.
 *         Trilinear on this cube is up to 13.8/255 away from Blender because
 *         the cube is clipped to the display gamut, so it must be tetrahedral:
 *         with u = x * (N - 1), i = min(floor(u), N - 2), f = u - i, order the
 *         three fractions descending as fa >= fb >= fc along axes a, b, c, then
 *           c = (1 - fa) * T(i) + (fa - fb) * T(i + ea)
 *             + (fb - fc) * T(i + ea + eb) + fc * T(i + 1)
 *         where ea, eb are the unit steps along axes a and b.
 *   Do the arithmetic in float, then clamp and encode as above.
 */
import { AGX_LOOKS, type AgxLook } from "./document";
import type { FilmSection } from "./scene";

/** Scene-linear Rec.709, premultiplied alpha. `albedo` and `normal` guide the denoiser when present (a final Cycles frame). */
export interface RadianceFrame {
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly rgba: Float32Array;
  readonly albedo?: Float32Array;
  readonly normal?: Float32Array;
}

/** public/lut/manifest.json, written by tools/blender/bake_agx.py. */
export interface AgxManifest {
  readonly format: "agx-lut-2";
  readonly blender: string;
  /** Rec.709 to E-Gamut, 3x3 row-major. */
  readonly toWorking: readonly number[];
  readonly log2Min: number;
  readonly log2Max: number;
  readonly preLog2Max: number;
  readonly tFloor: number;
  readonly base: { readonly file: string; readonly size: number };
  /** One entry per AgxLook, `null` for "none": no look, no warp. */
  readonly looks: Readonly<Record<string, { readonly file: string; readonly size: number } | null>>;
}

/** One look, loaded: Blender's cube plus that look's warp. Values are decoded from half float. */
export interface AgxData {
  readonly look: AgxLook;
  readonly manifest: AgxManifest;
  /** baseSize^3 RGB texels, red fastest. Display values with the 2.4 power still on. */
  readonly base: Float32Array;
  /** preSize^3 RGB texels, red fastest: the look's change to t. `null` for "none". */
  readonly pre: { readonly size: number; readonly values: Float32Array } | null;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isEntry = (x: unknown): x is { file: string; size: number } =>
  isRecord(x) && typeof x.file === "string" && typeof x.size === "number";
const isNumbers = (x: unknown, n: number): x is number[] =>
  Array.isArray(x) && x.length === n && x.every((v) => typeof v === "number" && Number.isFinite(v));

/** Boundary check for the manifest. Throws naming the field. */
export function parseManifest(json: unknown): AgxManifest {
  if (!isRecord(json) || json.format !== "agx-lut-2") throw new Error("agx manifest: unknown format");
  const num = (key: string): number => {
    const v = json[key];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`agx manifest: ${key} is not a number`);
    return v;
  };
  const { toWorking, base, looks } = json;
  if (!isNumbers(toWorking, 9)) throw new Error("agx manifest: toWorking is not nine numbers");
  if (!isEntry(base)) throw new Error("agx manifest: base is not a file entry");
  if (!isRecord(looks)) throw new Error("agx manifest: looks is missing");
  for (const look of AGX_LOOKS) {
    if (looks[look] !== null && !isEntry(looks[look])) throw new Error(`agx manifest: look ${look} is not a file entry or null`);
  }
  return {
    format: "agx-lut-2",
    blender: typeof json.blender === "string" ? json.blender : "",
    toWorking,
    log2Min: num("log2Min"),
    log2Max: num("log2Max"),
    preLog2Max: num("preLog2Max"),
    tFloor: num("tFloor"),
    base,
    looks: Object.fromEntries(AGX_LOOKS.map((look) => [look, isEntry(looks[look]) ? looks[look] : null])),
  };
}

/** One IEEE half (binary16), as its 16 bits, to a number. */
export function halfToFloat(h: number): number {
  const exponent = (h >> 10) & 31;
  const mantissa = h & 1023;
  const sign = h & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 31) return mantissa === 0 ? sign * Infinity : NaN;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/** `size`^3 little endian half-float RGB texels to floats. */
function decodeGrid(bytes: Uint8Array, size: number, what: string): Float32Array {
  const count = size * size * size * 3;
  if (bytes.byteLength !== count * 2) throw new Error(`agx ${what}: ${bytes.byteLength} bytes, expected ${count * 2}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = halfToFloat(view.getUint16(i * 2, true));
  return out;
}

/** Pure: the loaded files for one look. `lookBytes` is null exactly for "none". */
export function parseAgx(manifest: AgxManifest, look: AgxLook, baseBytes: Uint8Array, lookBytes: Uint8Array | null): AgxData {
  const entry = manifest.looks[look];
  if ((entry === null) !== (lookBytes === null)) throw new Error(`agx ${look}: look file does not match the manifest`);
  const base = decodeGrid(baseBytes, manifest.base.size, "base");
  const pre = entry === null || lookBytes === null ? null : { size: entry.size, values: decodeGrid(lookBytes, entry.size, look) };
  return { look, manifest, base, pre };
}

const manifests = new Map<string, Promise<AgxManifest>>();
const grids = new Map<string, Promise<Uint8Array>>();

/** One fetch per URL for the life of the page. A failure is forgotten so the next call retries. */
function once<T>(cache: Map<string, Promise<T>>, url: string, read: (response: Response) => Promise<T>): Promise<T> {
  const known = cache.get(url);
  if (known) return known;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return read(response);
    })
    .catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });
  cache.set(url, pending);
  return pending;
}

const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());

/** Loads Blender's AgX cube and the warp for `look` from `baseUrl` (default: the app's public/lut/). Cached. */
export async function loadAgx(look: AgxLook, baseUrl = `${import.meta.env.BASE_URL}lut/`): Promise<AgxData> {
  const manifest = await once(manifests, `${baseUrl}manifest.json`, async (r) => parseManifest(await r.json()));
  const entry = manifest.looks[look];
  const [base, warp] = await Promise.all([
    once(grids, baseUrl + manifest.base.file, bytesOf),
    entry === null ? null : once(grids, baseUrl + entry.file, bytesOf),
  ]);
  return parseAgx(manifest, look, base, warp);
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const srgbEncode = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A tone mapper for one loaded look: reads r, g, b, writes display sRGB 0..1 to out[0..2]. No allocation per call. */
function toneMapper(lut: AgxData): (r: number, g: number, b: number, out: number[]) => void {
  const { toWorking: M, log2Min, log2Max, preLog2Max, tFloor } = lut.manifest;
  const tScale = 1 / (log2Max - log2Min);
  const sScale = 1 / (preLog2Max - log2Min);
  const { base, pre } = lut;
  const baseSize = lut.manifest.base.size;
  const t = [0, 0, 0];
  const warp = [0, 0, 0];
  const s = [0, 0, 0];

  const shaper = (e: number) => Math.max((Math.log2(Math.max(e, 1e-30)) - log2Min) * tScale, tFloor);
  const preCoord = (v: number) => clamp01((Math.log2(Math.max(v, 1e-30)) - log2Min) * sScale);

  const trilinear = (values: Float32Array, size: number, x: number, y: number, z: number, out: number[]) => {
    const m = size - 1;
    const ux = x * m, uy = y * m, uz = z * m;
    const ix = Math.min(Math.floor(ux), m - 1), iy = Math.min(Math.floor(uy), m - 1), iz = Math.min(Math.floor(uz), m - 1);
    const fx = ux - ix, fy = uy - iy, fz = uz - iz;
    const sy = 3 * size, sz = 3 * size * size;
    const o = ix * 3 + iy * sy + iz * sz;
    for (let k = 0; k < 3; k++) {
      const c00 = values[o + k] * (1 - fx) + values[o + 3 + k] * fx;
      const c10 = values[o + sy + k] * (1 - fx) + values[o + sy + 3 + k] * fx;
      const c01 = values[o + sz + k] * (1 - fx) + values[o + sz + 3 + k] * fx;
      const c11 = values[o + sy + sz + k] * (1 - fx) + values[o + sy + sz + 3 + k] * fx;
      out[k] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    }
  };

  // Tetrahedral: the cell's corners along the path from low to high, by descending fraction.
  const tetrahedral = (x: number, y: number, z: number, out: number[]) => {
    const m = baseSize - 1;
    const ux = x * m, uy = y * m, uz = z * m;
    const ix = Math.min(Math.floor(ux), m - 1), iy = Math.min(Math.floor(uy), m - 1), iz = Math.min(Math.floor(uz), m - 1);
    let fa = ux - ix, fb = uy - iy, fc = uz - iz;
    let ea = 3, eb = 3 * baseSize, ec = 3 * baseSize * baseSize;
    let swap: number;
    if (fa < fb) { swap = fa; fa = fb; fb = swap; swap = ea; ea = eb; eb = swap; }
    if (fb < fc) { swap = fb; fb = fc; fc = swap; swap = eb; eb = ec; ec = swap; }
    if (fa < fb) { swap = fa; fa = fb; fb = swap; swap = ea; ea = eb; eb = swap; }
    const o = ix * 3 + iy * 3 * baseSize + iz * 3 * baseSize * baseSize;
    const far = 3 + 3 * baseSize + 3 * baseSize * baseSize;
    const w0 = 1 - fa, w1 = fa - fb, w2 = fb - fc;
    for (let k = 0; k < 3; k++) {
      out[k] = base[o + k] * w0 + base[o + ea + k] * w1 + base[o + ea + eb + k] * w2 + base[o + far + k] * fc;
    }
  };

  return (r, g, b, out) => {
    t[0] = shaper(M[0] * r + M[1] * g + M[2] * b);
    t[1] = shaper(M[3] * r + M[4] * g + M[5] * b);
    t[2] = shaper(M[6] * r + M[7] * g + M[8] * b);
    if (pre !== null) {
      s[0] = preCoord(r);
      s[1] = preCoord(g);
      s[2] = preCoord(b);
      trilinear(pre.values, pre.size, s[0], s[1], s[2], warp);
      t[0] += warp[0];
      t[1] += warp[1];
      t[2] += warp[2];
    }
    tetrahedral(clamp01(t[0]), clamp01(t[1]), clamp01(t[2]), warp);
    for (let k = 0; k < 3; k++) out[k] = clamp01(srgbEncode(Math.max(warp[k], 0) ** 2.4));
  };
}

/** One linear Rec.709 triple to display sRGB, 0..1, as Blender's AgX view with the look the data was loaded for. */
export function agx(rgb: readonly [number, number, number], lut: AgxData): [number, number, number] {
  const out = [0, 0, 0];
  toneMapper(lut)(rgb[0], rgb[1], rgb[2], out);
  return [out[0], out[1], out[2]];
}

/**
 * The whole frame to 8-bit sRGB RGBA, straight (not premultiplied) alpha as
 * canvases and PNG want it. Non-finite samples read as 0.
 */
export function toneMapFrame(frame: RadianceFrame, lut: AgxData): Uint8ClampedArray {
  const map = toneMapper(lut);
  const out = new Uint8ClampedArray(frame.width * frame.height * 4);
  const rgb = [0, 0, 0];
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  for (let i = 0; i < out.length; i += 4) {
    const a = clamp01(finite(frame.rgba[i + 3]));
    if (a === 0) continue; // transparent black
    const k = 1 / a;
    map(finite(frame.rgba[i]) * k, finite(frame.rgba[i + 1]) * k, finite(frame.rgba[i + 2]) * k, rgb);
    out[i] = Math.round(rgb[0] * 255);
    out[i + 1] = Math.round(rgb[1] * 255);
    out[i + 2] = Math.round(rgb[2] * 255);
    out[i + 3] = Math.round(a * 255);
  }
  return out;
}

/** Box-filtered copy whose long edge is at most `maxEdgePx`, averaged in linear light. */
export function downscaleFrame(frame: RadianceFrame, maxEdgePx: number): RadianceFrame {
  const scale = Math.min(1, maxEdgePx / Math.max(frame.width, frame.height));
  if (scale === 1) return frame;
  const width = Math.max(1, Math.round(frame.width * scale)), height = Math.max(1, Math.round(frame.height * scale));
  const rgba = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * frame.height) / height), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * frame.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * frame.width) / width), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * frame.width) / width));
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          for (let c = 0; c < 4; c++) rgba[(y * width + x) * 4 + c] += frame.rgba[(sy * frame.width + sx) * 4 + c];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < 4; c++) rgba[(y * width + x) * 4 + c] /= n;
    }
  }
  return { width, height, samples: frame.samples, rgba };
}

/**
 * Pixels on an OffscreenCanvas of the frame's size, from 8-bit RGBA. The
 * canvas exists only to be encoded or handed on, so it asks to stay on the
 * CPU: where the GPU 2D path cannot read back, a GPU canvas encodes zeros.
 */
function paint(width: number, height: number, rgba: Uint8ClampedArray): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("no 2d context on OffscreenCanvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

/**
 * AgX with the film's look, sRGB encode, PNG. A transparent film keeps alpha;
 * an opaque one is written fully opaque. Loads the look's LUT files on first use.
 * Denoising happens before this, in the photo desk (src/photo/denoise.ts).
 */
export async function develop(frame: RadianceFrame, film: FilmSection): Promise<Blob> {
  const rgba = toneMapFrame(frame, await loadAgx(film.look));
  if (!film.transparent) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return paint(frame.width, frame.height, rgba).convertToBlob({ type: "image/png" });
}

/** A quick displayable version of a partial frame, for progress. Same AgX, no denoise. `lut` is loadAgx(look). */
export function quickLook(frame: RadianceFrame, lut: AgxData, maxEdgePx: number): ImageBitmap {
  const small = downscaleFrame(frame, maxEdgePx);
  return paint(small.width, small.height, toneMapFrame(small, lut)).transferToImageBitmap();
}
