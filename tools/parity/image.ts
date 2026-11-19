/**
 * 8-bit images for the parity tool: PNG in and out, Blender's Standard view transform, and the
 * comparison statistics.
 */
import { deflateSync, inflateSync } from "node:zlib";

export interface Rgba8 {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array; // RGBA, straight alpha, top row first
}

/** Standard view transform: clamp to 0..1, sRGB encode, 8 bit. A transparent film is
 *  un-premultiplied first, as Blender does before writing a PNG with alpha. */
export function standard(width: number, height: number, rgba: Float32Array, transparent: boolean): Rgba8 {
  const data = new Uint8Array(width * height * 4);
  const encode = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  };
  for (let i = 0; i < data.length; i += 4) {
    const a = transparent ? Math.min(1, Math.max(0, rgba[i + 3])) : 1;
    const k = a > 0 ? 1 / a : 0;
    data[i] = encode(rgba[i] * k);
    data[i + 1] = encode(rgba[i + 1] * k);
    data[i + 2] = encode(rgba[i + 2] * k);
    data[i + 3] = Math.round(a * 255);
  }
  return { width, height, data };
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodePng(img: Rgba8): Uint8Array {
  const raw = new Uint8Array((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1);
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(body.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, img.width);
  hv.setUint32(4, img.height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 8-bit RGB or RGBA, non-interlaced: what Blender writes. */
export function decodePng(file: Uint8Array): Rgba8 {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (pos < file.length) {
    const length = view.getUint32(pos);
    const type = new TextDecoder().decode(file.subarray(pos + 4, pos + 8));
    const body = file.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("only 8-bit non-interlaced PNG");
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`PNG colour type ${body[9]}`);
    } else if (type === "IDAT") {
      idat.push(body);
    }
    pos += length + 12;
  }
  const packed = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  idat.reduce((o, p) => (packed.set(p, o), o + p.length), 0);
  const raw = inflateSync(packed);
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      rows[y * stride + x] = (line[x] + pred) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rows.subarray(i * channels, i * channels + 3), i * 4);
    data[i * 4 + 3] = channels === 4 ? rows[i * channels + 3] : 255;
  }
  return { width, height, data };
}

/** Over a 50 % grey, so the colour of nearly transparent pixels weighs as little as it shows. */
function composite(img: Rgba8, i: number, c: number): number {
  const a = img.data[i + 3] / 255;
  return img.data[i + c] * a + 128 * (1 - a);
}

export interface Difference {
  readonly psnrDb: number;
  readonly meanAbs: number; // in 8-bit steps
  readonly over4: number; // share of pixels with a channel more than 4/255 off
  readonly alphaMeanAbs: number;
}

export function compare(a: Rgba8, b: Rgba8): Difference {
  if (a.width !== b.width || a.height !== b.height) throw new Error("size mismatch");
  let se = 0;
  let abs = 0;
  let over = 0;
  let alpha = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4) {
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      const d = composite(a, i, c) - composite(b, i, c);
      se += d * d;
      abs += Math.abs(d);
      worst = Math.max(worst, Math.abs(d));
    }
    if (worst > 4) over++;
    alpha += Math.abs(a.data[i + 3] - b.data[i + 3]);
  }
  const mse = se / (n * 3);
  return { psnrDb: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), meanAbs: abs / (n * 3), over4: over / n, alphaMeanAbs: alpha / n };
}

/** browser | Blender | difference x5, side by side, each over the grey used for comparing. */
export function sideBySide(a: Rgba8, b: Rgba8): Rgba8 {
  const { width, height } = a;
  const data = new Uint8Array(width * 3 * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const pa = composite(a, i, c);
        const pb = composite(b, i, c);
        data[((y * width * 3) + x) * 4 + c] = pa;
        data[((y * width * 3) + width + x) * 4 + c] = pb;
        data[((y * width * 3) + 2 * width + x) * 4 + c] = Math.min(255, Math.abs(pa - pb) * 5);
      }
      for (let k = 0; k < 3; k++) data[((y * width * 3) + k * width + x) * 4 + 3] = 255;
    }
  }
  return { width: width * 3, height, data };
}
