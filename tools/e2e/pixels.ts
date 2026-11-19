/** pixels.ts: the image arithmetic the end-to-end flows assert with. 8-bit sRGB, Rec.709 luma. */
import { readFileSync } from "node:fs";
import { decodePng, type Rgba8 } from "../parity/image";

export type { Rgba8 };

export const readPng = (path: string): Rgba8 => decodePng(new Uint8Array(readFileSync(path)));

export const luma = (img: Rgba8, px: number): number =>
  0.2126 * img.data[px * 4] + 0.7152 * img.data[px * 4 + 1] + 0.0722 * img.data[px * 4 + 2];

export function maskFromBase64(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

export function count(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v;
  return n;
}

/** Mean luma over the pixels the mask marks, or over the whole image without one. */
export function meanLuma(img: Rgba8, mask?: Uint8Array): number {
  let sum = 0, n = 0;
  for (let px = 0; px < img.width * img.height; px++) {
    if (mask && mask[px] === 0) continue;
    sum += luma(img, px);
    n++;
  }
  return n === 0 ? NaN : sum / n;
}

/** Area-averaged downscale; alpha is averaged like the colour channels. */
export function resize(img: Rgba8, width: number, height: number): Rgba8 {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * img.height) / height), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * img.width) / width), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      const acc = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) for (let c = 0; c < 4; c++) acc[c] += img.data[(sy * img.width + sx) * 4 + c];
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(acc[c] / n);
    }
  }
  return { width, height, data };
}

/** Pixels whose green leads red and blue by more than `lead`: the part, when its filament is a saturated green. */
export function greenMask(img: Rgba8, lead = 24): Uint8Array {
  const mask = new Uint8Array(img.width * img.height);
  for (let px = 0; px < mask.length; px++) {
    const r = img.data[px * 4], g = img.data[px * 4 + 1], b = img.data[px * 4 + 2];
    mask[px] = g - Math.max(r, b) > lead ? 1 : 0;
  }
  return mask;
}

export function iou(a: Uint8Array, b: Uint8Array): number {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) {
    both += a[i] & b[i];
    either += a[i] | b[i];
  }
  return either === 0 ? NaN : both / either;
}

/**
 * Mean squared luma gradient in a box centred on (cx, cy), in pixels: how
 * sharp the edges inside it are. Squared, because blur spreads an edge's
 * gradient over more pixels and keeps its sum, so only a power above one
 * falls as the edge softens.
 */
export function sharpness(img: Rgba8, cx: number, cy: number, halfW: number, halfH: number): number {
  let sum = 0, n = 0;
  const x0 = Math.max(1, Math.round(cx - halfW)), x1 = Math.min(img.width - 2, Math.round(cx + halfW));
  const y0 = Math.max(1, Math.round(cy - halfH)), y1 = Math.min(img.height - 2, Math.round(cy + halfH));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = y * img.width + x;
    const gx = (luma(img, p + 1) - luma(img, p - 1)) / 2, gy = (luma(img, p + img.width) - luma(img, p - img.width)) / 2;
    sum += gx * gx + gy * gy;
    n++;
  }
  return sum / n;
}
