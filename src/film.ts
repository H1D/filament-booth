/**
 * film.ts: a linear float frame in, a deliverable image out. Both photo
 * engines return RadianceFrames and both go through here, so tone, file
 * format and naming never depend on which engine ran.
 *
 * The AgX numbers exist once, as data in AGX. The CPU path below and the
 * viewport's TSL display node are both built from that table, and a unit
 * test checks they agree on probe colours.
 *
 * AGX is the Filament/three.js AgX that the old viewer's `agxMHC` was built
 * on. It is NOT the AgX of Blender 5.2.3, which ships a 3D LUT (EaryChow's
 * rework). tests/film.test.ts measures the gap against native Blender.
 */
import type { AgxLook } from "./document";
import type { FilmSection } from "./scene";

/** Scene-linear Rec.709, premultiplied alpha. `albedo` and `normal` guide the denoiser when present. */
export interface RadianceFrame {
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly rgba: Float32Array;
  readonly albedo?: Float32Array;
  readonly normal?: Float32Array;
}

/** What a look does to the log-encoded colour, in order: contrast about
 *  `pivot`, saturation about the Rec.709 luma, a power. Neutral is 1, 1, 1. */
export interface AgxLookData {
  readonly contrast: number;
  /** Where contrast pivots, in the log encoding. 0.606 is scene-linear 0.18. */
  readonly pivot: number;
  readonly saturation: number;
  readonly power: number;
}

export interface AgxData {
  readonly toRec2020: readonly number[]; // 3x3, column-major
  readonly inset: readonly number[];
  readonly outset: readonly number[];
  readonly toSrgb: readonly number[];
  readonly logMin: number;
  readonly logMax: number;
  readonly curve: readonly number[];     // polynomial coefficients, highest power first
  /** The display power applied after the outset matrix. */
  readonly gamma: number;
  readonly looks: Readonly<Record<AgxLook, AgxLookData>>;
}

const MIDDLE_GREY_LOG = 0.606; // (log2(0.18) - logMin) / (logMax - logMin)

export const AGX: AgxData = {
  // index.html:316 agxMHC, matrices as its mat3(vec3 column, vec3 column, vec3 column).
  toRec2020: [0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.088, 0.0433, 0.0113, 0.8956],
  inset: [
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859,
  ],
  outset: [
    1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405,
  ],
  toSrgb: [1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187],
  logMin: -12.47393,
  logMax: 4.026069,
  curve: [15.5, -40.14, 31.96, -6.868, 0.4298, 0.1191, -0.00232],
  gamma: 2.2,
  /*
   * Contrast and saturation are read from Blender 5.2.3's colour config
   * (datafiles/colormanagement/config.ocio, the "AgX - ..." looks, each a
   * log-style GradingPrimary with contrast pivot -0.2 in AgX Log). Verified
   * means a probe through native Blender agrees with agx() for that look to
   * the bounds tests/film.test.ts states.
   * UNVERIFIED: "punchy". Blender's Punchy is a GradingTone shadows lift plus
   * a CDL power of 1.0912, not a contrast change. Only the power is here.
   */
  looks: {
    "none": { contrast: 1, pivot: MIDDLE_GREY_LOG, saturation: 1, power: 1 },
    "punchy": { contrast: 1, pivot: MIDDLE_GREY_LOG, saturation: 1, power: 1.0912 },
    "low-contrast": { contrast: 0.8, pivot: MIDDLE_GREY_LOG, saturation: 1.1, power: 1 },
    "medium-low-contrast": { contrast: 0.9, pivot: MIDDLE_GREY_LOG, saturation: 1.05, power: 1 },
    "medium-high-contrast": { contrast: 1.2, pivot: MIDDLE_GREY_LOG, saturation: 1, power: 1 },
    "high-contrast": { contrast: 1.4, pivot: MIDDLE_GREY_LOG, saturation: 0.95, power: 1 },
  },
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const srgbEncode = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A tone mapper for one look: reads r, g, b, writes display sRGB 0..1 to out[0..2]. No allocation per call. */
function toneMapper(look: AgxLook): (r: number, g: number, b: number, out: number[]) => void {
  const { toRec2020: A, inset: I, outset: O, toSrgb: S, logMin, logMax, curve, gamma } = AGX;
  const { contrast, pivot, saturation, power } = AGX.looks[look];
  const span = logMax - logMin;
  const poly = (x: number) => curve.reduce((acc, c) => acc * x + c, 0);
  return (r, g, b, out) => {
    const r2 = A[0] * r + A[3] * g + A[6] * b, g2 = A[1] * r + A[4] * g + A[7] * b, b2 = A[2] * r + A[5] * g + A[8] * b;
    const encode = (v: number) => clamp01((Math.log2(Math.max(v, 1e-10)) - logMin) / span);
    let x = encode(I[0] * r2 + I[3] * g2 + I[6] * b2);
    let y = encode(I[1] * r2 + I[4] * g2 + I[7] * b2);
    let z = encode(I[2] * r2 + I[5] * g2 + I[8] * b2);
    x = clamp01((x - pivot) * contrast + pivot);
    y = clamp01((y - pivot) * contrast + pivot);
    z = clamp01((z - pivot) * contrast + pivot);
    if (saturation !== 1) {
      const luma = 0.2126 * x + 0.7152 * y + 0.0722 * z;
      x = clamp01(luma + saturation * (x - luma));
      y = clamp01(luma + saturation * (y - luma));
      z = clamp01(luma + saturation * (z - luma));
    }
    if (power !== 1) { x **= power; y **= power; z **= power; }
    x = poly(x); y = poly(y); z = poly(z);
    const lin = (v: number) => Math.max(0, v) ** gamma;
    const x2 = lin(O[0] * x + O[3] * y + O[6] * z), y2 = lin(O[1] * x + O[4] * y + O[7] * z), z2 = lin(O[2] * x + O[5] * y + O[8] * z);
    out[0] = srgbEncode(clamp01(S[0] * x2 + S[3] * y2 + S[6] * z2));
    out[1] = srgbEncode(clamp01(S[1] * x2 + S[4] * y2 + S[7] * z2));
    out[2] = srgbEncode(clamp01(S[2] * x2 + S[5] * y2 + S[8] * z2));
  };
}

/** One linear RGB triple to display-referred sRGB, 0..1. */
export function agx(rgb: readonly [number, number, number], look: AgxLook): [number, number, number] {
  const out = [0, 0, 0];
  toneMapper(look)(rgb[0], rgb[1], rgb[2], out);
  return [out[0], out[1], out[2]];
}

/**
 * The whole frame to 8-bit sRGB RGBA, straight (not premultiplied) alpha as
 * canvases and PNG want it. Non-finite samples read as 0.
 */
export function toneMapFrame(frame: RadianceFrame, look: AgxLook): Uint8ClampedArray {
  const map = toneMapper(look);
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

/** Pixels on an OffscreenCanvas of the frame's size, from 8-bit RGBA. */
function paint(width: number, height: number, rgba: Uint8ClampedArray): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context on OffscreenCanvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

/**
 * AgX with the film's look, sRGB encode, PNG. A transparent film keeps alpha;
 * an opaque one is written fully opaque.
 * Denoising is not available yet: `film.denoise` and the frame's guides are
 * ignored, and the PNG is the undenoised frame.
 */
export function develop(frame: RadianceFrame, film: FilmSection): Promise<Blob> {
  const rgba = toneMapFrame(frame, film.look);
  if (!film.transparent) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return paint(frame.width, frame.height, rgba).convertToBlob({ type: "image/png" });
}

/** A quick displayable version of a partial frame, for progress. Same AgX, no denoise. */
export function quickLook(frame: RadianceFrame, look: AgxLook, maxEdgePx: number): ImageBitmap {
  const small = downscaleFrame(frame, maxEdgePx);
  return paint(small.width, small.height, toneMapFrame(small, look)).transferToImageBitmap();
}
