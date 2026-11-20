/**
 * denoise.ts: Intel Open Image Denoise's RT filter on WebGPU.
 *
 * The filter Blender runs for Cycles with the "Fast" prefilter: HDR colour plus the noisy
 * albedo and normal guides into OIDN 2.5's UNet with its rt_hdr_alb_nrm weights
 * (public/oidn/, Apache-2.0). Everything around the network follows OIDN's own code: the
 * autoexposure that picks the input scale, the PU transfer function, the 16 px tensor alignment
 * and the zero padding, and tiles that overlap by 96 px (half the 174 px receptive field,
 * rounded up to 16) so a tiled image comes out as the whole image would.
 *
 * Tensors are planar f32 on the GPU. Each convolution is 3x3 with zero padding, a bias and a
 * ReLU; an upsample and a concat are folded into the convolution that reads them.
 */
import { halfToFloat, type RadianceFrame } from "../film";

/** Where the app serves the weights. */
export const WEIGHTS_URL = `${import.meta.env.BASE_URL}oidn/rt_hdr_alb_nrm.tza`;

// ---- weights ------------------------------------------------------------------------------

export interface WeightTensor {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

/** OIDN's TZA container (core/tza.cpp): version 2, "oihw" or "x" layout, f16 or f32. */
export function parseTza(bytes: Uint8Array): Map<string, WeightTensor> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (why: string): never => {
    throw new Error(`denoiser weights: ${why}`);
  };
  if (bytes.byteLength < 12 || view.getUint16(0, true) !== 0x41d7) fail("not a TZA file");
  if (view.getUint8(2) !== 2) fail(`TZA version ${view.getUint8(2)}`);
  let p = Number(view.getBigUint64(4, true));
  const tensors = new Map<string, WeightTensor>();
  const count = view.getUint32(p, true);
  p += 4;
  for (let t = 0; t < count; t++) {
    const nameLength = view.getUint16(p, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 2, p + 2 + nameLength));
    p += 2 + nameLength;
    const rank = view.getUint8(p++);
    const dims: number[] = [];
    for (let d = 0; d < rank; d++, p += 4) dims.push(view.getUint32(p, true));
    const layout = new TextDecoder().decode(bytes.subarray(p, p + rank));
    p += rank;
    if (layout !== "oihw" && layout !== "x") fail(`${name}: layout ${layout}`);
    const type = String.fromCharCode(view.getUint8(p++));
    const offset = Number(view.getBigUint64(p, true));
    p += 8;
    const n = dims.reduce((a, b) => a * b, 1);
    const size = type === "h" ? 2 : type === "f" ? 4 : fail(`${name}: data type ${type}`);
    if (offset + n * size > bytes.byteLength) fail(`${name}: data past the end`);
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = size === 2 ? halfToFloat(view.getUint16(offset + i * 2, true)) : view.getFloat32(offset + i * 4, true);
    tensors.set(name, { dims, data });
  }
  return tensors;
}

// ---- the network --------------------------------------------------------------------------

/** One 3x3 convolution: reads src0 (upsampled 2x when `up`) then src1, both concatenated. */
interface ConvStep {
  readonly kind: "conv";
  readonly name: string;
  readonly src0: string;
  readonly src1: string | null;
  readonly up: boolean;
  readonly dst: string;
}
interface PoolStep {
  readonly kind: "pool";
  readonly src: string;
  readonly dst: string;
}
type Step = ConvStep | PoolStep;

const conv = (name: string, src0: string, dst: string, src1: string | null = null): ConvStep => ({ kind: "conv", name, src0, src1, up: src1 !== null, dst });
const pool = (src: string, dst: string): PoolStep => ({ kind: "pool", src, dst });

/**
 * OIDN's UNet (core/unet_filter.cpp addUNet). Buffers are named by level (0 is full size,
 * each next level half of it) and reused once their contents are dead.
 */
const UNET: readonly Step[] = [
  conv("enc_conv0", "in", "a0"),
  conv("enc_conv1", "a0", "b0"), pool("b0", "p1"),
  conv("enc_conv2", "p1", "a1"), pool("a1", "p2"),
  conv("enc_conv3", "p2", "a2"), pool("a2", "p3"),
  conv("enc_conv4", "p3", "a3"), pool("a3", "p4"),
  conv("enc_conv5a", "p4", "a4"),
  conv("enc_conv5b", "a4", "b4"),
  conv("dec_conv4a", "b4", "a3", "p3"),
  conv("dec_conv4b", "a3", "b3"),
  conv("dec_conv3a", "b3", "a2", "p2"),
  conv("dec_conv3b", "a2", "b2"),
  conv("dec_conv2a", "b2", "a1", "p1"),
  conv("dec_conv2b", "a1", "b1"),
  conv("dec_conv1a", "b1", "b0", "in"),
  conv("dec_conv1b", "b0", "a0"),
  conv("dec_conv0", "a0", "b0"),
];
/** The UNet's output buffer. */
const OUT = "b0";

/** A step with the channel counts it reads, as they are when it runs. */
type Planned =
  | (ConvStep & { readonly c0: number; readonly c1: number; readonly cout: number })
  | (PoolStep & { readonly c: number });

/**
 * Walks the UNet once: the channels each step reads, and the channels each buffer must hold
 * (the most it ever holds). A buffer's contents change size as it is reused.
 */
function planNet(weights: Map<string, WeightTensor>): { steps: Planned[]; capacity: Map<string, number> } {
  const live = new Map<string, number>([["in", 9]]);
  const capacity = new Map<string, number>([["in", 9]]);
  const liveOf = (name: string) => {
    const c = live.get(name);
    if (c === undefined) throw new Error(`denoiser: ${name} read before it is written`);
    return c;
  };
  const steps = UNET.map((step): Planned => {
    let planned: Planned;
    if (step.kind === "pool") {
      planned = { ...step, c: liveOf(step.src) };
    } else {
      const [cout, cin] = weightOf(weights, step.name).dims;
      const c0 = liveOf(step.src0);
      const c1 = step.src1 === null ? 0 : liveOf(step.src1);
      if (c0 + c1 !== cin) throw new Error(`denoiser weights: ${step.name} reads ${cin} channels, the network has ${c0 + c1}`);
      planned = { ...step, c0, c1, cout };
    }
    const written = planned.kind === "pool" ? planned.c : planned.cout;
    live.set(step.dst, written);
    capacity.set(step.dst, Math.max(capacity.get(step.dst) ?? 0, written));
    return planned;
  });
  return { steps, capacity };
}

const levelOf = (buffer: string): number => (buffer === "in" ? 0 : Number(buffer.slice(1)));

function weightOf(weights: Map<string, WeightTensor>, name: string): WeightTensor {
  const w = weights.get(`${name}.weight`);
  if (!w || w.dims.length !== 4 || w.dims[2] !== 3 || w.dims[3] !== 3) throw new Error(`denoiser weights: no 3x3 ${name}`);
  return w;
}

/** Bytes per pixel of a tile's tensor for every buffer of the network, f32. */
function bytesPerPixel(channels: Map<string, number>): number {
  let sum = 0;
  for (const [name, c] of channels) sum += (c * 4) / 4 ** levelOf(name);
  return sum;
}

// ---- autoexposure and tiles ---------------------------------------------------------------

/**
 * OIDN's input scale for HDR colour (devices/cpu/cpu_autoexposure.cpp): the image is averaged
 * in 16 px bins, and 0.18 is divided by the geometric mean luminance of the bins above 1e-8.
 * `rgba` is RGBA, row major.
 */
export function autoexposure(rgba: Float32Array, width: number, height: number): number {
  const BIN = 16;
  const binsH = Math.ceil(height / BIN);
  const binsW = Math.ceil(width / BIN);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < binsH; i++) {
    const h0 = Math.floor((i * height) / binsH);
    const h1 = Math.floor(((i + 1) * height) / binsH);
    for (let j = 0; j < binsW; j++) {
      const w0 = Math.floor((j * width) / binsW);
      const w1 = Math.floor(((j + 1) * width) / binsW);
      let L = 0;
      for (let y = h0; y < h1; y++) {
        for (let x = w0; x < w1; x++) {
          const o = (y * width + x) * 4;
          L += 0.212671 * hdr(rgba[o]) + 0.71516 * hdr(rgba[o + 1]) + 0.072169 * hdr(rgba[o + 2]);
        }
      }
      L /= (h1 - h0) * (w1 - w0);
      if (L > 1e-8) {
        sum += Math.log2(L);
        count++;
      }
    }
  }
  return count > 0 ? 0.18 / 2 ** (sum / count) : 1;
}

const FLT_MAX = 3.4028234663852886e38;
/** OIDN's sanitising of HDR input: NaN to 0, then clamped to [0, FLT_MAX]. */
const hdr = (v: number): number => (v !== v || v <= 0 ? 0 : v > FLT_MAX ? FLT_MAX : v);

/** OIDN's spatial alignment of a tensor, and the tile overlap round_up(174 / 2, 16). */
export const ALIGN = 16;
export const OVERLAP = 96;

export interface Tile {
  /** The region of the image the network reads (with overlaps), in pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The tensor: the region rounded up to ALIGN, zero padded on the right and bottom. */
  readonly tw: number;
  readonly th: number;
  /** The region of the image this tile writes. */
  readonly ox: number;
  readonly oy: number;
  readonly ow: number;
  readonly oh: number;
}

const roundUp = (v: number, a: number) => Math.ceil(v / a) * a;

/** `n` spans covering `size`, split at multiples of ALIGN. */
function splits(size: number, n: number): number[] {
  const at = [0];
  for (let k = 1; k < n; k++) at.push(Math.min(size, Math.max(at[k - 1] + ALIGN, Math.round((k * size) / n / ALIGN) * ALIGN)));
  at.push(size);
  return at;
}

function spans(size: number, n: number): { start: number; end: number; outStart: number; outEnd: number }[] {
  const at = splits(size, n);
  return at.slice(0, -1).map((outStart, k) => ({
    outStart, outEnd: at[k + 1],
    start: Math.max(0, outStart - OVERLAP), end: Math.min(size, at[k + 1] + OVERLAP),
  }));
}

/**
 * The fewest tiles whose tensors hold at most `maxPixels` each, splitting the longer side
 * first. Every tile reads from a multiple of ALIGN, so pooling sees the same pixel grid as for
 * the whole image, and reads at least OVERLAP beyond what it writes except at the image edge.
 */
export function planTiles(width: number, height: number, maxPixels: number): Tile[] {
  let nw = 1;
  let nh = 1;
  for (;;) {
    const cols = spans(width, nw);
    const rows = spans(height, nh);
    const tw = Math.max(...cols.map((c) => roundUp(c.end - c.start, ALIGN)));
    const th = Math.max(...rows.map((r) => roundUp(r.end - r.start, ALIGN)));
    const canW = width / (nw + 1) >= ALIGN;
    const canH = height / (nh + 1) >= ALIGN;
    if (tw * th <= maxPixels || (!canW && !canH)) {
      return rows.flatMap((r) => cols.map((c) => ({
        x: c.start, y: r.start, w: c.end - c.start, h: r.end - r.start,
        tw: roundUp(c.end - c.start, ALIGN), th: roundUp(r.end - r.start, ALIGN),
        ox: c.outStart, oy: r.outStart, ow: c.outEnd - c.outStart, oh: r.outEnd - r.outStart,
      })));
    }
    if (canW && (tw >= th || !canH)) nw++;
    else nh++;
  }
}

// ---- WGSL ---------------------------------------------------------------------------------

/** OIDN's PU transfer function (core/color.h), normalised so 65504 maps to 1. */
const PU = `
const PU_A = 1.41283765e+03; const PU_B = 1.64593172e+00; const PU_C = 4.31384981e-01;
const PU_D = -2.94139609e-03; const PU_E = 1.92653254e-01; const PU_F = 6.26026094e-03;
const PU_G = 9.98620152e-01; const PU_Y0 = 1.57945760e-06; const PU_Y1 = 3.22087631e-02;
const PU_X0 = 2.23151711e-03; const PU_X1 = 3.70974749e-01;
fn pu_forward(y: f32) -> f32 {
  if (y <= PU_Y0) { return PU_A * y; }
  if (y <= PU_Y1) { return PU_B * pow(y, PU_C) + PU_D; }
  return PU_E * log(y + PU_F) + PU_G;
}
fn pu_inverse(x: f32) -> f32 {
  if (x <= PU_X0) { return x / PU_A; }
  if (x <= PU_X1) { return pow((x - PU_D) / PU_B, 1.0 / PU_C); }
  return exp((x - PU_G) / PU_E) - PU_F;
}`;

/** puForward(65504): the normalisation of the PU curve. */
export const PU_NORM = 0.192653254 * Math.log(65504 + 0.00626026094) + 0.998620152;

/** Colour, albedo and normal of the tile's region (RGBA, sanitised on the CPU) into the 9-channel tensor. */
const INPUT_WGSL = `${PU}
struct P { tw: u32, th: u32, w: u32, h: u32, scale: f32, norm: f32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> color: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> albedo: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> normal: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> dst: array<f32>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= p.tw || g.y >= p.th) { return; }
  var c = vec3<f32>(0.0);
  var a = vec3<f32>(0.0);
  var n = vec3<f32>(0.0);
  if (g.x < p.w && g.y < p.h) {
    let i = g.y * p.w + g.x;
    let y = color[i].rgb * p.scale;
    c = vec3<f32>(pu_forward(y.r), pu_forward(y.g), pu_forward(y.b)) / p.norm;
    a = albedo[i].rgb;
    n = normal[i].rgb * 0.5 + 0.5;
  }
  let plane = p.tw * p.th;
  let o = g.y * p.tw + g.x;
  dst[o] = c.r; dst[plane + o] = c.g; dst[2u * plane + o] = c.b;
  dst[3u * plane + o] = a.r; dst[4u * plane + o] = a.g; dst[5u * plane + o] = a.b;
  dst[6u * plane + o] = n.r; dst[7u * plane + o] = n.g; dst[8u * plane + o] = n.b;
}`;

/**
 * 3x3 convolution, zero padded, bias, ReLU. One invocation makes 4 horizontal pixels of 8
 * output channels. Weights are [cout / 8][cin][3x3][8].
 */
const CONV_WGSL = `
struct P { w: u32, h: u32, c0: u32, c1: u32, cout: u32, up: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src0: array<f32>;
@group(0) @binding(2) var<storage, read> src1: array<f32>;
@group(0) @binding(3) var<storage, read> wts: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> bias: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> dst: array<f32>;

var<private> acc: array<vec4<f32>, 8>;

fn add(r: array<f32, 6>, wi: u32) {
  for (var kx = 0u; kx < 3u; kx++) {
    let px = vec4<f32>(r[kx], r[kx + 1u], r[kx + 2u], r[kx + 3u]);
    let wa = wts[wi + kx * 2u];
    let wb = wts[wi + kx * 2u + 1u];
    acc[0] += px * wa.x; acc[1] += px * wa.y; acc[2] += px * wa.z; acc[3] += px * wa.w;
    acc[4] += px * wb.x; acc[5] += px * wb.y; acc[6] += px * wb.z; acc[7] += px * wb.w;
  }
}

@compute @workgroup_size(16, 4, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let x0 = i32(g.x * 4u);
  let y = i32(g.y);
  let w = i32(p.w);
  let h = i32(p.h);
  if (x0 >= w || y >= h) { return; }
  let ob = g.z;
  let cin = p.c0 + p.c1;
  let b0 = bias[ob * 2u];
  let b1 = bias[ob * 2u + 1u];
  acc[0] = vec4<f32>(b0.x); acc[1] = vec4<f32>(b0.y); acc[2] = vec4<f32>(b0.z); acc[3] = vec4<f32>(b0.w);
  acc[4] = vec4<f32>(b1.x); acc[5] = vec4<f32>(b1.y); acc[6] = vec4<f32>(b1.z); acc[7] = vec4<f32>(b1.w);
  let sw = select(p.w, p.w / 2u, p.up != 0u);
  let sh = select(p.h, p.h / 2u, p.up != 0u);
  let plane0 = sw * sh;
  let plane1 = p.w * p.h;
  for (var ic = 0u; ic < p.c0; ic++) {
    for (var ky = 0; ky < 3; ky++) {
      let yy = y + ky - 1;
      var r: array<f32, 6>;
      for (var i = 0; i < 6; i++) {
        let xx = x0 - 1 + i;
        var v = 0.0;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
          let sx = select(u32(xx), u32(xx) / 2u, p.up != 0u);
          let sy = select(u32(yy), u32(yy) / 2u, p.up != 0u);
          v = src0[ic * plane0 + sy * sw + sx];
        }
        r[i] = v;
      }
      add(r, ((ob * cin + ic) * 9u + u32(ky) * 3u) * 2u);
    }
  }
  for (var j = 0u; j < p.c1; j++) {
    let ic = p.c0 + j;
    for (var ky = 0; ky < 3; ky++) {
      let yy = y + ky - 1;
      var r: array<f32, 6>;
      for (var i = 0; i < 6; i++) {
        let xx = x0 - 1 + i;
        var v = 0.0;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) { v = src1[j * plane1 + u32(yy) * p.w + u32(xx)]; }
        r[i] = v;
      }
      add(r, ((ob * cin + ic) * 9u + u32(ky) * 3u) * 2u);
    }
  }
  let row = u32(y) * p.w;
  for (var o = 0u; o < 8u; o++) {
    let oc = ob * 8u + o;
    if (oc >= p.cout) { break; }
    let v = max(acc[o], vec4<f32>(0.0));
    let base = oc * plane1 + row + u32(x0);
    dst[base] = v.x;
    if (x0 + 1 < w) { dst[base + 1u] = v.y; }
    if (x0 + 2 < w) { dst[base + 2u] = v.z; }
    if (x0 + 3 < w) { dst[base + 3u] = v.w; }
  }
}`;

/** 2x2 max pool. */
const POOL_WGSL = `
struct P { w: u32, h: u32, c: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let dw = p.w / 2u;
  let dh = p.h / 2u;
  if (g.x >= dw || g.y >= dh) { return; }
  let s = g.z * p.w * p.h + g.y * 2u * p.w + g.x * 2u;
  dst[g.z * dw * dh + g.y * dw + g.x] = max(max(src[s], src[s + 1u]), max(src[s + p.w], src[s + p.w + 1u]));
}`;

/** The tile's written region out of the tensor: inverse PU, divided by the input scale, RGB. */
const OUTPUT_WGSL = `${PU}
struct P { tw: u32, th: u32, dx: u32, dy: u32, ow: u32, oh: u32, scale: f32, norm: f32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= p.ow || g.y >= p.oh) { return; }
  let plane = p.tw * p.th;
  let s = (g.y + p.dy) * p.tw + g.x + p.dx;
  let o = (g.y * p.ow + g.x) * 3u;
  for (var c = 0u; c < 3u; c++) {
    dst[o + c] = pu_inverse(max(src[c * plane + s], 0.0) * p.norm) / p.scale;
  }
}`;

// ---- the GPU side -------------------------------------------------------------------------

/** GPUBufferUsage and GPUMapMode values from the WebGPU spec (TypeScript's DOM types lack the globals). */
const USAGE = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const MAP_MODE_READ = 0x1;

interface ConvLayer {
  readonly weights: GPUBuffer;
  readonly bias: GPUBuffer;
}

interface Net {
  readonly device: GPUDevice;
  readonly input: GPUComputePipeline;
  readonly conv: GPUComputePipeline;
  readonly pool: GPUComputePipeline;
  readonly output: GPUComputePipeline;
  readonly steps: readonly Planned[];
  readonly layers: Map<string, ConvLayer>;
  readonly capacity: Map<string, number>;
  /** Largest tile tensor, in pixels, that fits the memory budget and the device's limits. */
  readonly maxTilePixels: number;
}

/** GPU memory the network may use for one tile, besides the weights. */
const BUDGET_BYTES = 768 * 1024 ** 2;

/** Reorders [cout][cin][3][3] to [cout / 8][cin][3x3][8], zero padding cout to a multiple of 8. */
function convWeights(w: WeightTensor): Float32Array {
  const [cout, cin] = w.dims;
  const out = new Float32Array(Math.ceil(cout / 8) * cin * 9 * 8);
  for (let oc = 0; oc < cout; oc++) {
    for (let ic = 0; ic < cin; ic++) {
      for (let k = 0; k < 9; k++) out[((Math.floor(oc / 8) * cin + ic) * 9 + k) * 8 + (oc % 8)] = w.data[(oc * cin + ic) * 9 + k];
    }
  }
  return out;
}

function upload(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buffer = device.createBuffer({ size: Math.max(16, data.byteLength), usage: USAGE.STORAGE | USAGE.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  return buffer;
}

async function createNet(weightsBytes: Uint8Array): Promise<Net> {
  const gpu = typeof navigator === "undefined" ? undefined : navigator.gpu;
  if (!gpu) throw new Error("this browser has no WebGPU");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
  void device.lost.then(() => {
    net = null;
  });
  const weights = parseTza(weightsBytes);
  const { steps, capacity } = planNet(weights);
  const layers = new Map<string, ConvLayer>();
  for (const step of steps) {
    if (step.kind !== "conv") continue;
    const b = weights.get(`${step.name}.bias`);
    if (!b || b.dims[0] !== step.cout) throw new Error(`denoiser weights: no bias for ${step.name}`);
    const bias = new Float32Array(Math.ceil(step.cout / 8) * 8);
    bias.set(b.data);
    layers.set(step.name, { weights: upload(device, convWeights(weightOf(weights, step.name))), bias: upload(device, bias) });
  }
  const pipeline = (code: string) => device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code }), entryPoint: "main" } });
  const [input, convPipeline, poolPipeline, output] = await Promise.all([INPUT_WGSL, CONV_WGSL, POOL_WGSL, OUTPUT_WGSL].map(pipeline));
  // The largest single buffer is the widest full-size tensor. Per pixel a tile also holds three
  // RGBA crops and its RGB result.
  const widest = Math.max(...[...capacity].filter(([name]) => levelOf(name) === 0).map(([, c]) => c)) * 4;
  const limit = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
  const maxTilePixels = Math.floor(Math.min(BUDGET_BYTES / (bytesPerPixel(capacity) + 3 * 16 + 2 * 12), limit / widest));
  return { device, input, conv: convPipeline, pool: poolPipeline, output, steps, layers, capacity, maxTilePixels };
}

let net: Promise<Net> | null = null;

/** The network on this page's GPU, made once. A failure is forgotten so the next photo retries. */
function getNet(): Promise<Net> {
  net ??= fetch(WEIGHTS_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`${WEIGHTS_URL}: HTTP ${response.status}`);
      return createNet(new Uint8Array(await response.arrayBuffer()));
    })
    .catch((error: unknown) => {
      net = null;
      throw error;
    });
  return net;
}

function uniforms(device: GPUDevice, words: readonly number[], floats: readonly number[] = []): GPUBuffer {
  const data = new ArrayBuffer(Math.max(16, roundUp((words.length + floats.length) * 4, 16)));
  new Uint32Array(data, 0, words.length).set(words);
  new Float32Array(data, words.length * 4, floats.length).set(floats);
  const buffer = device.createBuffer({ size: data.byteLength, usage: USAGE.UNIFORM | USAGE.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

/** A tile's region of an RGBA image, row major, NaN to 0 and clamped to [lo, hi]. */
function crop(rgba: Float32Array, width: number, t: Tile, lo: number, hi: number): Float32Array {
  const out = new Float32Array(t.w * t.h * 4);
  for (let y = 0; y < t.h; y++) {
    const src = ((t.y + y) * width + t.x) * 4;
    const dst = y * t.w * 4;
    for (let i = 0; i < t.w * 4; i++) {
      const v = rgba[src + i];
      out[dst + i] = v !== v ? 0 : v < lo ? lo : v > hi ? hi : v;
    }
  }
  return out;
}

type Guided = RadianceFrame & { readonly albedo: Float32Array; readonly normal: Float32Array };

/** Runs the network over one tile and resolves with its written region, RGB. */
async function denoiseTile(n: Net, frame: Guided, t: Tile, scale: number, buffers: Map<string, GPUBuffer>): Promise<Float32Array> {
  const { device } = n;
  const transient: GPUBuffer[] = [];
  const keep = (b: GPUBuffer): GPUBuffer => {
    transient.push(b);
    return b;
  };
  const buf = (name: string): GPUBuffer => {
    const b = buffers.get(name);
    if (!b) throw new Error(`denoiser: no buffer ${name}`);
    return b;
  };
  try {
    const color = keep(upload(device, crop(frame.rgba, frame.width, t, 0, FLT_MAX)));
    const albedo = keep(upload(device, crop(frame.albedo, frame.width, t, 0, 1)));
    const normal = keep(upload(device, crop(frame.normal, frame.width, t, -1, 1)));
    const outBytes = t.ow * t.oh * 3 * 4;
    const out = keep(device.createBuffer({ size: outBytes, usage: USAGE.STORAGE | USAGE.COPY_SRC }));
    const read = keep(device.createBuffer({ size: outBytes, usage: USAGE.MAP_READ | USAGE.COPY_DST }));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    const dispatch = (pipeline: GPUComputePipeline, resources: GPUBuffer[], x: number, y: number, z: number) => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: resources.map((buffer, binding) => ({ binding, resource: { buffer } })),
      }));
      pass.dispatchWorkgroups(x, y, z);
    };
    dispatch(n.input, [keep(uniforms(device, [t.tw, t.th, t.w, t.h], [scale, PU_NORM])), color, albedo, normal, buf("in")],
      Math.ceil(t.tw / 8), Math.ceil(t.th / 8), 1);
    for (const step of n.steps) {
      if (step.kind === "pool") {
        const level = levelOf(step.src);
        const w = t.tw >> level;
        const h = t.th >> level;
        dispatch(n.pool, [keep(uniforms(device, [w, h, step.c])), buf(step.src), buf(step.dst)], Math.ceil(w / 16), Math.ceil(h / 16), step.c);
        continue;
      }
      const layer = n.layers.get(step.name);
      if (!layer) throw new Error(`denoiser: no layer ${step.name}`);
      const level = levelOf(step.dst);
      const w = t.tw >> level;
      const h = t.th >> level;
      dispatch(n.conv, [keep(uniforms(device, [w, h, step.c0, step.c1, step.cout, step.up ? 1 : 0])), buf(step.src0),
        buf(step.src1 ?? step.src0), layer.weights, layer.bias, buf(step.dst)], Math.ceil(w / 64), Math.ceil(h / 4), Math.ceil(step.cout / 8));
    }
    dispatch(n.output, [keep(uniforms(device, [t.tw, t.th, t.ox - t.x, t.oy - t.y, t.ow, t.oh], [scale, PU_NORM])), buf(OUT), out],
      Math.ceil(t.ow / 8), Math.ceil(t.oh / 8), 1);
    pass.end();
    encoder.copyBufferToBuffer(out, 0, read, 0, outBytes);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(MAP_MODE_READ);
    return new Float32Array(read.getMappedRange().slice(0));
  } finally {
    for (const b of transient) b.destroy();
  }
}

export interface Denoised {
  readonly frame: RadianceFrame;
  readonly tiles: number;
  readonly ms: number;
}

/**
 * The frame with its colour denoised and its alpha as it was. Rejects when the frame has no
 * guides, or WebGPU, the weights or the GPU fail; callers develop the noisy frame then.
 * `maxTilePixels` caps the tile size below what the GPU allows, for tests of the tiling.
 */
export async function denoise(frame: RadianceFrame, options: { readonly maxTilePixels?: number } = {}): Promise<Denoised> {
  const t0 = performance.now();
  const { albedo, normal } = frame;
  if (!albedo || !normal) throw new Error("the frame has no albedo and normal guides");
  const n = await getNet();
  const { device } = n;
  const tiles = planTiles(frame.width, frame.height, Math.min(n.maxTilePixels, options.maxTilePixels ?? Infinity));
  const tw = Math.max(...tiles.map((t) => t.tw));
  const th = Math.max(...tiles.map((t) => t.th));
  // WebGPU reports a failed allocation or dispatch here, not by throwing.
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  const buffers = new Map<string, GPUBuffer>();
  const rgba = new Float32Array(frame.rgba);
  let failure: unknown = null;
  try {
    for (const [name, c] of n.capacity) {
      const level = levelOf(name);
      buffers.set(name, device.createBuffer({ size: Math.max(16, c * (tw >> level) * (th >> level) * 4), usage: USAGE.STORAGE }));
    }
    const scale = autoexposure(frame.rgba, frame.width, frame.height);
    const guided: Guided = { ...frame, albedo, normal };
    for (const t of tiles) {
      const rgb = await denoiseTile(n, guided, t, scale, buffers);
      for (let y = 0; y < t.oh; y++) {
        for (let x = 0; x < t.ow; x++) {
          const s = (y * t.ow + x) * 3;
          const d = ((t.oy + y) * frame.width + t.ox + x) * 4;
          rgba[d] = rgb[s];
          rgba[d + 1] = rgb[s + 1];
          rgba[d + 2] = rgb[s + 2];
        }
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    for (const b of buffers.values()) b.destroy();
  }
  const [validation, memory] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
  const gpuError = validation ?? memory;
  if (gpuError) throw new Error(`denoiser GPU error: ${gpuError.message}`);
  if (failure !== null) throw failure;
  return { frame: { ...frame, rgba }, tiles: tiles.length, ms: performance.now() - t0 };
}
