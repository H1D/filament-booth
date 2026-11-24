/**
 * webgpu.ts: WebGPU compute path-tracing photo engine implementing Cycles 5.2.3
 * materials, lighting, camera/DoF, floor card ring, HDR world and OIDN guides.
 *
 * Expensive GPU allocations (Part BLAS, Part vertex attributes, Studio BLAS, HDR
 * importance tables) are cached separately and released after IDLE_MS or when the
 * tab hides, so editing lights, camera, film, world or turntable reuses the part
 * BVH in ~0 ms.
 */
import { hiddenFacesSettled } from "../print";
import type { BackdropSection, BeadMaterial, PartSection, PropItem } from "../scene";
import { decodeRgbe, partNormals, partRoughness, pathTangents, plateMask, visiblePart, visibleTriangles, type WorldImage } from "./cycles-upload";
import type { PhotoEngine } from "./photo";
import { BVH_NODE_WORDS, buildBvhParallel, buildBvhSync, type BvhData } from "./webgpu-bvh";
import { PATH_TRACE_WGSL, RESOLVE_WGSL } from "./webgpu-shader";
import { buildBlackmanHarrisCdf, buildHdrCdf, GGX_TABLE_FLOATS, packGgxTables, type HdrImportanceData } from "./webgpu-tables";

const BASE = import.meta.env.BASE_URL;
export const IDLE_MS = 120_000;
const TILE_SIZE = 512;
const PASS_INTERVAL_MS = 450;

const USAGE = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const MAP_MODE_READ = 0x1;

export interface WebGpuRenderStats {
  readonly bvhMs: number;
  readonly uploadMs: number;
  readonly samplingMs: number;
  readonly readbackMs: number;
  readonly totalMs: number;
  readonly triangles: number;
  readonly nodes: number;
  readonly vramBytes: number;
  readonly bvhCached: boolean;
}

export interface WebGpuEngineOptions {
  readonly onStats?: (stats: WebGpuRenderStats) => void;
}

interface GpuRuntime {
  readonly device: GPUDevice;
  readonly tracePipeline: GPUComputePipeline;
  readonly resolvePipeline: GPUComputePipeline;
  readonly ggxData: Float32Array;
  readonly maxBindingBytes: number;
  readonly maxBufferBytes: number;
}

interface PartBlasGpu {
  readonly mesh: PartSection["mesh"];
  readonly hidden: Uint8Array | undefined;
  readonly triCount: number;
  readonly nodeCount: number;
  readonly triOrder: Uint32Array;
  readonly posBuf: GPUBuffer;
  readonly trisBuf: GPUBuffer;
  readonly nodesBuf: GPUBuffer;
  readonly posBytes: number;
  readonly trisBytes: number;
  readonly nodesBytes: number;
}

interface PartShadingGpu {
  readonly mesh: PartSection["mesh"];
  readonly hidden: Uint8Array | undefined;
  readonly layers: BeadMaterial["layers"];
  readonly speedGain: number;
  readonly vertsBuf: GPUBuffer;
  readonly bytes: number;
}

interface StudioGpu {
  readonly backdrop: BackdropSection;
  readonly props: readonly PropItem[];
  readonly buf: GPUBuffer;
  readonly trisOff: number;
  readonly posOff: number;
  readonly normOff: number;
  readonly matsOff: number;
  readonly bytes: number;
}

interface HdrGpu {
  readonly hdrId: string;
  readonly width: number;
  readonly height: number;
  readonly envPower: number;
  readonly buf: GPUBuffer;
  readonly bytes: number;
}

interface CacheState {
  partBlas: PartBlasGpu | null;
  partShading: PartShadingGpu | null;
  studio: StudioGpu | null;
  hdr: HdrGpu | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const alignUp = (n: number, a: number) => Math.ceil(n / a) * a;

/** Float32 to IEEE 754 binary16 bits (round-to-nearest-even). */
function floatToHalf(value: number): number {
  const f32 = Float32Array.of(value);
  const u32 = new Uint32Array(f32.buffer)[0];
  const sign = (u32 >>> 16) & 0x8000;
  const exp = (u32 >>> 23) & 0xff;
  const mant = u32 & 0x7fffff;
  if (exp === 0xff) return sign | (mant ? 0x7e00 : 0x7c00);
  const newExp = exp - 127 + 15;
  if (newExp >= 31) return sign | 0x7c00;
  if (newExp <= 0) {
    if (newExp < -10) return sign;
    const m = mant | 0x800000;
    const shift = 14 - newExp;
    return sign | (m >>> shift);
  }
  return sign | (newExp << 10) | ((mant + 0x1000) >>> 13);
}

function quantizeSnorm16(v: number): number {
  const c = v < -1 ? -1 : v > 1 ? 1 : v;
  return Math.round(c * 32767) & 0xffff;
}

function packPartVerts(mesh: PartSection["mesh"], material: BeadMaterial): Uint32Array {
  const nverts = mesh.position.length / 3;
  const normals = partNormals(mesh, material);
  const tangents = pathTangents(mesh);
  const rough = partRoughness(mesh, material);
  const plate = plateMask(mesh);
  const out = new Uint32Array(nverts * 4);
  for (let i = 0; i < nverts; i++) {
    const nx = quantizeSnorm16(normals[i * 3 + 0]);
    const ny = quantizeSnorm16(normals[i * 3 + 1]);
    const nz = quantizeSnorm16(normals[i * 3 + 2]);
    const pl = quantizeSnorm16(plate[i]);
    const tx = quantizeSnorm16(tangents[i * 3 + 0]);
    const ty = quantizeSnorm16(tangents[i * 3 + 1]);
    const tz = quantizeSnorm16(tangents[i * 3 + 2]);
    const rh = floatToHalf(rough[i]);
    const o = i * 4;
    out[o + 0] = nx | (ny << 16);
    out[o + 1] = nz | (pl << 16);
    out[o + 2] = tx | (ty << 16);
    out[o + 3] = tz | (rh << 16);
  }
  return out;
}

function normalMatrix3x3(m: readonly number[]): [number, number, number, number, number, number, number, number, number] {
  // Inverse transpose of upper 3x3 column-major Mat4.
  const a00 = m[0], a10 = m[1], a20 = m[2];
  const a01 = m[4], a11 = m[5], a21 = m[6];
  const a02 = m[8], a12 = m[9], a22 = m[10];
  const c00 = a11 * a22 - a12 * a21;
  const c01 = a12 * a20 - a10 * a22;
  const c02 = a10 * a21 - a11 * a20;
  const c10 = a02 * a21 - a01 * a22;
  const c11 = a00 * a22 - a02 * a20;
  const c12 = a01 * a20 - a00 * a21;
  const c20 = a01 * a12 - a02 * a11;
  const c21 = a02 * a10 - a00 * a12;
  const c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const inv = Math.abs(det) > 1e-18 ? 1 / det : 1;
  return [c00 * inv, c01 * inv, c02 * inv, c10 * inv, c11 * inv, c12 * inv, c20 * inv, c21 * inv, c22 * inv];
}

function invertMat4(m: readonly number[]): Float32Array {
  // Exact cofactor inverse of 4x4 column-major matrix.
  const out = new Float32Array(16);
  const b00 = m[0] * m[5] - m[1] * m[4], b01 = m[0] * m[6] - m[2] * m[4], b02 = m[0] * m[7] - m[3] * m[4];
  const b03 = m[1] * m[6] - m[2] * m[5], b04 = m[1] * m[7] - m[3] * m[5], b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12], b07 = m[8] * m[14] - m[10] * m[12], b08 = m[8] * m[15] - m[11] * m[12];
  const b09 = m[9] * m[14] - m[10] * m[13], b10 = m[9] * m[15] - m[11] * m[13], b11 = m[10] * m[15] - m[11] * m[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-24) return Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  det = 1 / det;
  out[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * det;
  out[1] = (m[2] * b10 - m[1] * b11 - m[3] * b09) * det;
  out[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * det;
  out[3] = (m[10] * b04 - m[9] * b05 - m[11] * b03) * det;
  out[4] = (m[6] * b08 - m[4] * b11 - m[7] * b07) * det;
  out[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * det;
  out[6] = (m[14] * b02 - m[12] * b05 - m[15] * b01) * det;
  out[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * det;
  out[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * det;
  out[9] = (m[1] * b08 - m[0] * b10 - m[3] * b06) * det;
  out[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * det;
  out[11] = (m[9] * b02 - m[8] * b04 - m[11] * b00) * det;
  out[12] = (m[5] * b07 - m[4] * b09 - m[6] * b06) * det;
  out[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * det;
  out[14] = (m[13] * b01 - m[12] * b03 - m[14] * b00) * det;
  out[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * det;
  return out;
}

function buildStudioData(backdrop: BackdropSection, props: readonly PropItem[]) {
  const meshes = [
    { pos: backdrop.positions, norm: backdrop.normals, idx: backdrop.index, tfm: null as readonly number[] | null, matId: 0 },
    ...props.map((p, i) => ({ pos: p.geometry.positions, norm: p.geometry.normals, idx: p.geometry.index, tfm: p.toWorld, matId: i + 1 })),
  ];
  let totalVerts = 0;
  let totalTris = 0;
  for (const m of meshes) {
    totalVerts += m.pos.length / 3;
    totalTris += m.idx.length / 3;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const idx = new Uint32Array(totalTris * 3);
  const triMat = new Uint32Array(totalTris);
  let vBase = 0;
  let tBase = 0;
  for (const m of meshes) {
    const nv = m.pos.length / 3;
    const nt = m.idx.length / 3;
    if (m.tfm === null) {
      pos.set(m.pos, vBase * 3);
      norm.set(m.norm, vBase * 3);
    } else {
      const t = m.tfm;
      const nm = normalMatrix3x3(t);
      for (let i = 0; i < nv; i++) {
        const px = m.pos[i * 3], py = m.pos[i * 3 + 1], pz = m.pos[i * 3 + 2];
        pos[(vBase + i) * 3 + 0] = t[0] * px + t[4] * py + t[8] * pz + t[12];
        pos[(vBase + i) * 3 + 1] = t[1] * px + t[5] * py + t[9] * pz + t[13];
        pos[(vBase + i) * 3 + 2] = t[2] * px + t[6] * py + t[10] * pz + t[14];
        const nx = m.norm[i * 3], ny = m.norm[i * 3 + 1], nz = m.norm[i * 3 + 2];
        const rx = nm[0] * nx + nm[1] * ny + nm[2] * nz;
        const ry = nm[3] * nx + nm[4] * ny + nm[5] * nz;
        const rz = nm[6] * nx + nm[7] * ny + nm[8] * nz;
        const inv = 1 / (Math.hypot(rx, ry, rz) || 1);
        norm[(vBase + i) * 3 + 0] = rx * inv;
        norm[(vBase + i) * 3 + 1] = ry * inv;
        norm[(vBase + i) * 3 + 2] = rz * inv;
      }
    }
    for (let i = 0; i < nt; i++) {
      idx[(tBase + i) * 3 + 0] = m.idx[i * 3 + 0] + vBase;
      idx[(tBase + i) * 3 + 1] = m.idx[i * 3 + 1] + vBase;
      idx[(tBase + i) * 3 + 2] = m.idx[i * 3 + 2] + vBase;
      triMat[tBase + i] = m.matId;
    }
    vBase += nv;
    tBase += nt;
  }

  const bvh = buildBvhSync(pos, idx, { maxLeaf: 4 });
  const nodeVec4s = bvh.nodeCount * 4;
  const trisVec4s = totalTris;
  const posVec4s = totalVerts;
  const normVec4s = totalVerts;
  const matsCount = 1 + props.length;
  const matsVec4s = matsCount * 2;

  const trisOff = nodeVec4s;
  const posOff = trisOff + trisVec4s;
  const normOff = posOff + posVec4s;
  const matsOff = normOff + normVec4s;
  const buf = new Uint32Array((matsOff + matsVec4s) * 4);
  const f32 = new Float32Array(buf.buffer);

  buf.set(bvh.nodes, 0);
  for (let i = 0; i < totalTris; i++) {
    const dst = (trisOff + i) * 4;
    buf[dst + 0] = bvh.reorderedIndices[i * 3 + 0];
    buf[dst + 1] = bvh.reorderedIndices[i * 3 + 1];
    buf[dst + 2] = bvh.reorderedIndices[i * 3 + 2];
    buf[dst + 3] = triMat[bvh.triOrder[i]];
  }
  for (let i = 0; i < totalVerts; i++) {
    const pDst = (posOff + i) * 4;
    const nDst = (normOff + i) * 4;
    f32[pDst + 0] = pos[i * 3 + 0];
    f32[pDst + 1] = pos[i * 3 + 1];
    f32[pDst + 2] = pos[i * 3 + 2];
    f32[nDst + 0] = norm[i * 3 + 0];
    f32[nDst + 1] = norm[i * 3 + 1];
    f32[nDst + 2] = norm[i * 3 + 2];
  }
  const writeMat = (matIdx: number, albedo: readonly [number, number, number], roughness: number, catcher: boolean, texture: number) => {
    const o = (matsOff + matIdx * 2) * 4;
    f32[o + 0] = albedo[0];
    f32[o + 1] = albedo[1];
    f32[o + 2] = albedo[2];
    f32[o + 3] = roughness;
    f32[o + 4] = catcher ? 1 : 0;
    f32[o + 5] = texture;
  };
  writeMat(0, backdrop.albedo, backdrop.roughness, backdrop.shadowCatcher, backdrop.texture);
  for (let i = 0; i < props.length; i++) writeMat(i + 1, props[i].albedo, props[i].roughness, false, 0);

  return { u32: buf, trisOff, posOff, normOff, matsOff };
}

function uploadStorage(device: GPUDevice, src: ArrayBufferView, extraUsage = 0): GPUBuffer {
  const size = Math.max(16, alignUp(src.byteLength, 4));
  const buffer = device.createBuffer({ size, usage: USAGE.STORAGE | USAGE.COPY_DST | extraUsage });
  device.queue.writeBuffer(buffer, 0, src.buffer, src.byteOffset, src.byteLength);
  return buffer;
}

const hdrDecoded = new Map<string, Promise<WorldImage>>();
function loadHdrImage(hdrId: string): Promise<WorldImage> {
  let pending = hdrDecoded.get(hdrId);
  if (!pending) {
    pending = fetch(new URL(`${BASE}hdr/${hdrId}.hdr`, location.href).href)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${hdrId}.hdr: HTTP ${res.status}`);
        return decodeRgbe(new Uint8Array(await res.arrayBuffer()));
      })
      .catch((error: unknown) => {
        hdrDecoded.delete(hdrId);
        throw error;
      });
    hdrDecoded.set(hdrId, pending);
  }
  return pending;
}

export function webgpuEngine(options: WebGpuEngineOptions = {}): PhotoEngine {
  let runtime: Promise<GpuRuntime> | null = null;
  const cache: CacheState = { partBlas: null, partShading: null, studio: null, hdr: null, timer: null };

  const releasePart = () => {
    if (cache.partBlas) {
      cache.partBlas.posBuf.destroy();
      cache.partBlas.trisBuf.destroy();
      cache.partBlas.nodesBuf.destroy();
      cache.partBlas = null;
    }
    if (cache.partShading) {
      cache.partShading.vertsBuf.destroy();
      cache.partShading = null;
    }
    if (cache.studio) {
      cache.studio.buf.destroy();
      cache.studio = null;
    }
    if (cache.hdr) {
      cache.hdr.buf.destroy();
      cache.hdr = null;
    }
    if (cache.timer !== null) {
      clearTimeout(cache.timer);
      cache.timer = null;
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") releasePart();
  };
  const cancelEviction = () => {
    if (cache.timer !== null) {
      clearTimeout(cache.timer);
      cache.timer = null;
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
  const scheduleEviction = () => {
    cancelEviction();
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      releasePart();
      return;
    }
    cache.timer = setTimeout(releasePart, IDLE_MS);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  };

  const getRuntime = (): Promise<GpuRuntime> => {
    runtime ??= (async () => {
      const gpu = typeof navigator === "undefined" ? undefined : navigator.gpu;
      if (!gpu) throw new Error("no WebGPU in this browser");
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("no WebGPU adapter");
      const maxBinding = adapter.limits.maxStorageBufferBindingSize;
      const maxBuf = adapter.limits.maxBufferSize;
      const device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: maxBinding,
          maxBufferSize: maxBuf,
          maxStorageBuffersPerShaderStage: Math.min(16, adapter.limits.maxStorageBuffersPerShaderStage),
        },
      });
      void device.lost.then(() => {
        releasePart();
        runtime = null;
      });
      const compileShader = async (label: string, code: string) => {
        const module = device.createShaderModule({ label, code });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter((m) => m.type === "error");
        if (errors.length > 0) {
          throw new Error(`${label} WGSL error: ${errors.map((e) => `L${e.lineNum}:${e.linePos} ${e.message}`).join(" | ")}`);
        }
        return module;
      };
      const [traceModule, resolveModule] = await Promise.all([
        compileShader("path-trace", PATH_TRACE_WGSL),
        compileShader("resolve", RESOLVE_WGSL),
      ]);
      const [tracePipeline, resolvePipeline] = await Promise.all([
        device.createComputePipelineAsync({ layout: "auto", compute: { module: traceModule, entryPoint: "main" } }),
        device.createComputePipelineAsync({ layout: "auto", compute: { module: resolveModule, entryPoint: "main" } }),
      ]);
      return {
        device, tracePipeline, resolvePipeline, ggxData: packGgxTables(),
        maxBindingBytes: device.limits.maxStorageBufferBindingSize,
        maxBufferBytes: device.limits.maxBufferSize,
      };
    })().catch((error: unknown) => {
      runtime = null;
      throw error;
    });
    return runtime;
  };

  return {
    id: "webgpu",
    fits: async (scene) => {
      if (import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("no-webgpu")) {
        return { reason: "switched off by ?no-webgpu" };
      }
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        return { reason: "no WebGPU in this browser" };
      }
      try {
        const rt = await getRuntime();
        if (scene.part) await hiddenFacesSettled(scene.part.mesh);
        const tris = scene.part ? visibleTriangles(scene.part.mesh) : 0;
        const verts = scene.part ? scene.part.mesh.position.length / 3 : 0;
        const posBytes = verts * 12;
        const triBytes = tris * 12;
        const accumVec4s = scene.film.width * scene.film.height * (scene.backdrop.shadowCatcher ? 5 : 3);
        const accumBytes = Math.max(16, accumVec4s * 16);
        if (
          Math.max(posBytes, triBytes, verts * 16, accumBytes) > rt.maxBindingBytes
          || accumBytes > rt.maxBufferBytes
        ) {
          return { reason: `scene exceeds GPU buffer limit (${(rt.maxBindingBytes / 1048576).toFixed(0)} MiB)` };
        }
        return true;
      } catch (error) {
        return { reason: error instanceof Error ? error.message : String(error) };
      }
    },
    render: async (scene, onPass, signal) => {
      if (signal.aborted && signal.reason !== "finish") throw signal.reason;
      const tStart = performance.now();
      const rt = await getRuntime();
      const { device } = rt;
      if (scene.part) await hiddenFacesSettled(scene.part.mesh);
      if (signal.aborted && signal.reason !== "finish") throw signal.reason;

      const hidden = scene.part?.mesh.hidden;
      const triCount = scene.part ? visibleTriangles(scene.part.mesh) : 0;
      const maxLeaf = rt.maxBindingBytes >= 512 * 1024 * 1024 ? 4 : rt.maxBindingBytes >= 256 * 1024 * 1024 ? 6 : 8;

      let bvhMs = 0;
      let bvhCached = false;
      const tUpload0 = performance.now();

      // Prevent idle/tab-hide eviction from destroying cached buffers while a render uses them.
      cancelEviction();

      let scopesOpen = false;
      device.pushErrorScope("out-of-memory");
      device.pushErrorScope("validation");
      scopesOpen = true;

      const transients: GPUBuffer[] = [];
      let accumBuf: GPUBuffer | null = null;
      let outRgbaBuf: GPUBuffer | null = null;
      let outAlbBuf: GPUBuffer | null = null;
      let outNrmBuf: GPUBuffer | null = null;
      let readRgbaBuf: GPUBuffer | null = null;
      let readAlbBuf: GPUBuffer | null = null;
      let readNrmBuf: GPUBuffer | null = null;

      try {
        // 1. Part BLAS
        if (scene.part) {
          if (cache.partBlas && cache.partBlas.mesh === scene.part.mesh && cache.partBlas.hidden === hidden) {
            bvhCached = true;
          } else {
            if (cache.partBlas) {
              cache.partBlas.posBuf.destroy();
              cache.partBlas.trisBuf.destroy();
              cache.partBlas.nodesBuf.destroy();
              cache.partBlas = null;
            }
            const vis = visiblePart(scene.part.mesh);
            const tBvh0 = performance.now();
            const bvh: BvhData = await buildBvhParallel(vis.position, vis.index, { maxLeaf, signal });
            bvhMs = performance.now() - tBvh0;
            if (bvh.nodes.byteLength > rt.maxBindingBytes) {
              throw new Error(`part BVH (${(bvh.nodes.byteLength / 1048576).toFixed(0)} MiB) exceeds GPU storage binding limit`);
            }
            const posBuf = uploadStorage(device, vis.position);
            const trisBuf = uploadStorage(device, bvh.reorderedIndices);
            const nodesBuf = uploadStorage(device, bvh.nodes);
            cache.partBlas = {
              mesh: scene.part.mesh, hidden, triCount, nodeCount: bvh.nodeCount, triOrder: bvh.triOrder,
              posBuf, trisBuf, nodesBuf,
              posBytes: vis.position.byteLength, trisBytes: bvh.reorderedIndices.byteLength, nodesBytes: bvh.nodes.byteLength,
            };
          }

          // 2. Part Shading Vertices
          const mat = scene.part.material;
          if (!(cache.partShading && cache.partShading.mesh === scene.part.mesh && cache.partShading.hidden === hidden
            && cache.partShading.layers === mat.layers && cache.partShading.speedGain === mat.speedGain)) {
            if (cache.partShading) {
              cache.partShading.vertsBuf.destroy();
              cache.partShading = null;
            }
            const vis = visiblePart(scene.part.mesh);
            const packed = packPartVerts(vis, mat);
            cache.partShading = {
              mesh: scene.part.mesh, hidden, layers: mat.layers, speedGain: mat.speedGain,
              vertsBuf: uploadStorage(device, packed), bytes: packed.byteLength,
            };
          }
        } else {
          // Empty dummy part buffers when scene.part === null
          bvhCached = true;
        }

        // 3. Studio BLAS
        if (!(cache.studio && cache.studio.backdrop === scene.backdrop && cache.studio.props === scene.props)) {
          if (cache.studio) {
            cache.studio.buf.destroy();
            cache.studio = null;
          }
          const st = buildStudioData(scene.backdrop, scene.props);
          cache.studio = {
            backdrop: scene.backdrop, props: scene.props,
            buf: uploadStorage(device, st.u32),
            trisOff: st.trisOff, posOff: st.posOff, normOff: st.normOff, matsOff: st.matsOff,
            bytes: st.u32.byteLength,
          };
        }

        // 4. HDR World + CDF
        if (!(cache.hdr && cache.hdr.hdrId === scene.world.hdrId)) {
          if (cache.hdr) {
            cache.hdr.buf.destroy();
            cache.hdr = null;
          }
          const worldImg = await loadHdrImage(scene.world.hdrId);
          const hdrData: HdrImportanceData = buildHdrCdf(worldImg);
          const totalF = hdrData.rgba.length + hdrData.marginalCdf.length + hdrData.condCdf.length + hdrData.pdfMap.length;
          const packedHdr = new Float32Array(totalF);
          let at = 0;
          packedHdr.set(hdrData.rgba, at); at += hdrData.rgba.length;
          packedHdr.set(hdrData.marginalCdf, at); at += hdrData.marginalCdf.length;
          packedHdr.set(hdrData.condCdf, at); at += hdrData.condCdf.length;
          packedHdr.set(hdrData.pdfMap, at);
          let envPower = 0;
          const dTheta = Math.PI / hdrData.height;
          const dPhi = (2 * Math.PI) / hdrData.width;
          for (let y = 0; y < hdrData.height; y++) {
            const sinT = Math.sin(((y + 0.5) * Math.PI) / hdrData.height);
            const rowW = sinT * dTheta * dPhi * 0.5;
            for (let x = 0; x < hdrData.width; x++) {
              const o = (y * hdrData.width + x) * 4;
              const lum = (hdrData.rgba[o] + hdrData.rgba[o + 1] + hdrData.rgba[o + 2]) * (1 / 3);
              envPower += lum * rowW;
            }
          }
          cache.hdr = {
            hdrId: scene.world.hdrId, width: hdrData.width, height: hdrData.height,
            envPower, buf: uploadStorage(device, packedHdr), bytes: packedHdr.byteLength,
          };
        }

        // 5. Aux buffer: GGX LUTs + Blackman-Harris CDF + Emitters
        const bhCdf = buildBlackmanHarrisCdf(scene.film.filterWidthPx, 65);
        const emitters = scene.lights.emitters;
        const emStride = 24;
        const auxFloats = new Float32Array(GGX_TABLE_FLOATS + bhCdf.length + Math.max(1, emitters.length) * emStride);
        const auxU32 = new Uint32Array(auxFloats.buffer);
        auxFloats.set(rt.ggxData, 0);
        const bhOff = GGX_TABLE_FLOATS;
        auxFloats.set(bhCdf, bhOff);
        const emOff = bhOff + bhCdf.length;
        let totalEmitterWeightPart = 0;
        let totalEmitterWeightStudio = 0;
        for (let i = 0; i < emitters.length; i++) {
          const e = emitters[i];
          const [sx, sy] = e.sizeM;
          const area = e.shape === "ellipse" ? Math.PI * 0.25 * sx * sy : sx * sy;
          const areaInv = 1 / Math.max(area, 1e-8);
          let tanHalf = 0;
          let normSpread = 0;
          let approxPower = 0;
          if (e.kind === "area") {
            if (e.spreadRad < Math.PI - 1e-4) {
              const hs = 0.5 * Math.max(e.spreadRad, 0);
              tanHalf = Math.tan(hs);
              normSpread = hs > 0 ? (hs > 0.05 ? 1 / (tanHalf - hs) : 3 / hs ** 3) : 1e30;
            }
            approxPower = Math.max(e.powerW, 1e-4);
          } else {
            approxPower = Math.max(0.5 * (e.topRadiance + e.bottomRadiance) * area * Math.PI, 1e-4);
          }
          totalEmitterWeightPart += approxPower;
          if (!e.partOnly) totalEmitterWeightStudio += approxPower;
          const b = emOff + i * emStride;
          auxFloats[b + 0] = e.centre[0]; auxFloats[b + 1] = e.centre[1]; auxFloats[b + 2] = e.centre[2];
          auxU32[b + 3] = (e.kind === "scrim" ? 1 : 0) | (e.shape === "ellipse" ? 2 : 0) | (e.partOnly ? 4 : 0);
          auxFloats[b + 4] = e.xAxis[0]; auxFloats[b + 5] = e.xAxis[1]; auxFloats[b + 6] = e.xAxis[2]; auxFloats[b + 7] = sx;
          auxFloats[b + 8] = e.yAxis[0]; auxFloats[b + 9] = e.yAxis[1]; auxFloats[b + 10] = e.yAxis[2]; auxFloats[b + 11] = sy;
          auxFloats[b + 12] = e.normal[0]; auxFloats[b + 13] = e.normal[1]; auxFloats[b + 14] = e.normal[2]; auxFloats[b + 15] = areaInv;
          auxFloats[b + 16] = e.color[0]; auxFloats[b + 17] = e.color[1]; auxFloats[b + 18] = e.color[2];
          auxFloats[b + 19] = e.kind === "area" ? e.powerW : e.topRadiance;
          auxFloats[b + 20] = e.kind === "area" ? e.spreadRad : e.bottomRadiance;
          auxFloats[b + 21] = tanHalf;
          auxFloats[b + 22] = normSpread;
          auxFloats[b + 23] = approxPower;
        }
        const auxBuf = uploadStorage(device, auxFloats);
        transients.push(auxBuf);

        // Dummy empty part buffers if scene.part is null (do not mix with stale cached part buffers).
        const dummyStorage = (data: Float32Array | Uint32Array) => {
          const buf = uploadStorage(device, data);
          transients.push(buf);
          return buf;
        };
        const partPosBuf = scene.part && cache.partBlas ? cache.partBlas.posBuf : dummyStorage(new Float32Array(4));
        const partVertsBuf = scene.part && cache.partShading ? cache.partShading.vertsBuf : dummyStorage(new Uint32Array(4));
        const partTrisBuf = scene.part && cache.partBlas ? cache.partBlas.trisBuf : dummyStorage(new Uint32Array(4));
        const partNodesBuf = scene.part && cache.partBlas ? cache.partBlas.nodesBuf : dummyStorage(new Uint32Array(BVH_NODE_WORDS));

        // 6. Film & output buffers
        const { width, height, samples } = scene.film;
        const npix = width * height;
        const hasSc = scene.backdrop.shadowCatcher;
        const accumVec4s = npix * 3 + (hasSc ? npix * 2 : 0);
        accumBuf = device.createBuffer({ size: Math.max(16, accumVec4s * 16), usage: USAGE.STORAGE | USAGE.COPY_DST });
        // Zero initialize accumBuf via queue (WebGPU guarantees zero-init on creation!)
        const frameBytes = npix * 16;
        outRgbaBuf = device.createBuffer({ size: frameBytes, usage: USAGE.STORAGE | USAGE.COPY_SRC });
        outAlbBuf = device.createBuffer({ size: frameBytes, usage: USAGE.STORAGE | USAGE.COPY_SRC });
        outNrmBuf = device.createBuffer({ size: frameBytes, usage: USAGE.STORAGE | USAGE.COPY_SRC });
        readRgbaBuf = device.createBuffer({ size: frameBytes, usage: USAGE.MAP_READ | USAGE.COPY_DST });
        readAlbBuf = device.createBuffer({ size: frameBytes, usage: USAGE.MAP_READ | USAGE.COPY_DST });
        readNrmBuf = device.createBuffer({ size: frameBytes, usage: USAGE.MAP_READ | USAGE.COPY_DST });

        const traceUniformBuf = device.createBuffer({ size: 28 * 16, usage: USAGE.UNIFORM | USAGE.COPY_DST });
        const resolveUniformBuf = device.createBuffer({ size: 16, usage: USAGE.UNIFORM | USAGE.COPY_DST });
        transients.push(traceUniformBuf, resolveUniformBuf);

        // Precompute static camera basis & transforms
        const cam = scene.camera;
        const fx = cam.target[0] - cam.position[0], fy = cam.target[1] - cam.position[1], fz = cam.target[2] - cam.position[2];
        const fLen = 1 / (Math.hypot(fx, fy, fz) || 1);
        const fwd: [number, number, number] = [fx * fLen, fy * fLen, fz * fLen];
        const rx = fwd[1] * cam.up[2] - fwd[2] * cam.up[1];
        const ry = fwd[2] * cam.up[0] - fwd[0] * cam.up[2];
        const rz = fwd[0] * cam.up[1] - fwd[1] * cam.up[0];
        const rLen = 1 / (Math.hypot(rx, ry, rz) || 1);
        const right: [number, number, number] = [rx * rLen, ry * rLen, rz * rLen];
        const up: [number, number, number] = [
          right[1] * fwd[2] - right[2] * fwd[1],
          right[2] * fwd[0] - right[0] * fwd[2],
          right[0] * fwd[1] - right[1] * fwd[0],
        ];
        const partToWorld = scene.part ? Float32Array.from(scene.part.toWorld) : Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        const worldToPart = invertMat4(Array.from(partToWorld));

        const traceBg = device.createBindGroup({
          layout: rt.tracePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: traceUniformBuf } },
            { binding: 1, resource: { buffer: partPosBuf } },
            { binding: 2, resource: { buffer: partVertsBuf } },
            { binding: 3, resource: { buffer: partTrisBuf } },
            { binding: 4, resource: { buffer: partNodesBuf } },
            { binding: 5, resource: { buffer: cache.studio.buf } },
            { binding: 6, resource: { buffer: cache.hdr.buf } },
            { binding: 7, resource: { buffer: auxBuf } },
            { binding: 8, resource: { buffer: accumBuf } },
          ],
        });
        const resolveBg = device.createBindGroup({
          layout: rt.resolvePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: resolveUniformBuf } },
            { binding: 1, resource: { buffer: accumBuf } },
            { binding: 2, resource: { buffer: outRgbaBuf } },
            { binding: 3, resource: { buffer: outAlbBuf } },
            { binding: 4, resource: { buffer: outNrmBuf } },
          ],
        });

        const paramsAb = new ArrayBuffer(28 * 16);
        const pU32 = new Uint32Array(paramsAb);
        const pF32 = new Float32Array(paramsAb);
        pU32[0] = width; pU32[1] = height;
        pU32[7] = samples;
        pU32[8] = scene.film.maxBounces; pU32[9] = scene.film.diffuseBounces; pU32[10] = scene.film.glossyBounces;
        pU32[11] = scene.film.transparent ? 1 : 0;
        pU32[12] = scene.part ? 1 : 0; pU32[13] = hasSc ? 1 : 0;
        pU32[14] = scene.lights.floorCards ? 1 : 0; pU32[15] = emitters.length;
        pU32[16] = cache.studio.trisOff; pU32[17] = cache.studio.posOff; pU32[18] = cache.studio.normOff; pU32[19] = cache.studio.matsOff;
        pU32[20] = bhOff; pU32[21] = emOff; pU32[22] = bhCdf.length; pU32[23] = 0;
        pU32[24] = cache.hdr.width; pU32[25] = cache.hdr.height;

        pF32[28] = scene.film.clampDirect; pF32[29] = scene.film.clampIndirect; pF32[30] = scene.film.filterWidthPx; pF32[31] = totalEmitterWeightStudio;
        pF32[32] = cam.position[0]; pF32[33] = cam.position[1]; pF32[34] = cam.position[2]; pF32[35] = cam.fovYRad;
        pF32[36] = right[0]; pF32[37] = right[1]; pF32[38] = right[2]; pF32[39] = cam.apertureRadiusM;
        pF32[40] = up[0]; pF32[41] = up[1]; pF32[42] = up[2]; pF32[43] = cam.focusDistanceM;
        pF32[44] = fwd[0]; pF32[45] = fwd[1]; pF32[46] = fwd[2]; pF32[47] = cam.clipStartM;
        pF32[48] = scene.world.strength; pF32[49] = scene.world.rotationRad;
        pF32[50] = scene.world.strength * cache.hdr.envPower; pF32[51] = totalEmitterWeightPart;

        const pMat = scene.part?.material;
        pF32[52] = pMat?.baseColor[0] ?? 0.5; pF32[53] = pMat?.baseColor[1] ?? 0.5;
        pF32[54] = pMat?.baseColor[2] ?? 0.5; pF32[55] = pMat?.ior ?? 1.5;
        pF32[56] = pMat?.anisotropy ?? 0; pF32[57] = pMat?.mottleScale ?? 0;
        pF32[58] = pMat?.mottleAmp ?? 0; pF32[59] = 0.05;
        pF32[60] = pMat?.plate.rough ?? 0.5; pF32[61] = pMat?.plate.textured ? 1 : 0;
        pF32[62] = pMat?.plate.grainPerM ?? 0; pF32[63] = pMat?.plate.bumpDistanceM ?? 0;
        const fc = scene.lights.floorCards;
        pF32[64] = fc?.centre[0] ?? 0; pF32[65] = fc?.centre[1] ?? 0; pF32[66] = fc?.centre[2] ?? 0; pF32[67] = fc?.innerRadiusM ?? 0;
        pF32[68] = fc?.outerRadiusM ?? 0; pF32[69] = fc?.keyRadiance ?? 0; pF32[70] = fc?.farRadiance ?? 0; pF32[71] = fc?.keyAzimuthRad ?? 0;
        pF32.set(partToWorld, 72);
        pF32.set(worldToPart, 88);
        pF32[104] = pMat?.surfaceWear ?? 0;
        pF32[105] = pMat?.dust ?? 0;
        pF32[106] = pMat?.subsurface ?? 0;
        pF32[107] = 0;

        const uploadMs = performance.now() - tUpload0;
        const tSample0 = performance.now();

        const rgbaOut = new Float32Array(npix * 4);
        let doneSamples = 0;
        let lastPassAt = performance.now();

        const resolveAndRead = async (sampleCount: number, withGuides: boolean) => {
          const rUni = new Uint32Array([width, height, sampleCount, hasSc ? 1 : 0]);
          device.queue.writeBuffer(resolveUniformBuf, 0, rUni);
          const enc = device.createCommandEncoder();
          const pass = enc.beginComputePass();
          pass.setPipeline(rt.resolvePipeline);
          pass.setBindGroup(0, resolveBg);
          pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8), 1);
          pass.end();
          enc.copyBufferToBuffer(outRgbaBuf!, 0, readRgbaBuf!, 0, frameBytes);
          if (withGuides) {
            enc.copyBufferToBuffer(outAlbBuf!, 0, readAlbBuf!, 0, frameBytes);
            enc.copyBufferToBuffer(outNrmBuf!, 0, readNrmBuf!, 0, frameBytes);
          }
          device.queue.submit([enc.finish()]);
          if (withGuides) {
            await Promise.all([readRgbaBuf!.mapAsync(MAP_MODE_READ), readAlbBuf!.mapAsync(MAP_MODE_READ), readNrmBuf!.mapAsync(MAP_MODE_READ)]);
            rgbaOut.set(new Float32Array(readRgbaBuf!.getMappedRange()));
            const albOut = new Float32Array(readAlbBuf!.getMappedRange().slice(0));
            const nrmOut = new Float32Array(readNrmBuf!.getMappedRange().slice(0));
            readRgbaBuf!.unmap();
            readAlbBuf!.unmap();
            readNrmBuf!.unmap();
            return { albOut, nrmOut };
          }
          await readRgbaBuf!.mapAsync(MAP_MODE_READ);
          rgbaOut.set(new Float32Array(readRgbaBuf!.getMappedRange()));
          readRgbaBuf!.unmap();
          return null;
        };

        let finishing = signal.aborted && signal.reason === "finish";
        for (let s = 0; s < samples; s++) {
          if (signal.aborted) {
            if (signal.reason === "finish" && doneSamples > 0) { finishing = true; break; }
            if (signal.reason !== "finish") throw signal.reason;
          }
          for (let ty = 0; ty < height; ty += TILE_SIZE) {
            const th = Math.min(TILE_SIZE, height - ty);
            for (let tx = 0; tx < width; tx += TILE_SIZE) {
              const tw = Math.min(TILE_SIZE, width - tx);
              if (signal.aborted && signal.reason !== "finish") throw signal.reason;
              pU32[2] = tx; pU32[3] = ty;
              pU32[4] = tw; pU32[5] = th;
              pU32[6] = s;
              device.queue.writeBuffer(traceUniformBuf, 0, paramsAb);
              const enc = device.createCommandEncoder();
              const pass = enc.beginComputePass();
              pass.setPipeline(rt.tracePipeline);
              pass.setBindGroup(0, traceBg);
              pass.dispatchWorkgroups(Math.ceil(tw / 8), Math.ceil(th / 8), 1);
              pass.end();
              device.queue.submit([enc.finish()]);
              await device.queue.onSubmittedWorkDone();
            }
          }
          doneSamples = s + 1;
          const now = performance.now();
          if (doneSamples < samples && !finishing && (doneSamples === 1 || now - lastPassAt >= PASS_INTERVAL_MS)) {
            await resolveAndRead(doneSamples, false);
            lastPassAt = performance.now();
            if (!signal.aborted || signal.reason === "finish") {
              onPass({ width, height, samples: doneSamples, rgba: rgbaOut }, doneSamples / samples);
            }
          }
          if (signal.aborted && signal.reason === "finish") break;
        }

        const samplingMs = performance.now() - tSample0;
        const tRead0 = performance.now();
        const guides = await resolveAndRead(Math.max(1, doneSamples), true);
        const readbackMs = performance.now() - tRead0;

        scopesOpen = false;
        const [validation, oom] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
        const gpuErr = validation ?? oom;
        if (gpuErr) throw new Error(`WebGPU error: ${gpuErr.message}`);

        const vramBytes =
          (cache.partBlas ? cache.partBlas.posBytes + cache.partBlas.trisBytes + cache.partBlas.nodesBytes : 0)
          + (cache.partShading ? cache.partShading.bytes : 0)
          + (cache.studio ? cache.studio.bytes : 0)
          + (cache.hdr ? cache.hdr.bytes : 0)
          + accumVec4s * 16 + frameBytes * 3;
        options.onStats?.({
          bvhMs, uploadMs, samplingMs, readbackMs, totalMs: performance.now() - tStart,
          triangles: triCount, nodes: cache.partBlas?.nodeCount ?? 0, vramBytes, bvhCached,
        });

        return {
          width, height, samples: Math.max(1, doneSamples), rgba: rgbaOut,
          albedo: guides?.albOut, normal: guides?.nrmOut,
        };
      } catch (error) {
        if (scopesOpen) {
          scopesOpen = false;
          await Promise.all([device.popErrorScope().catch(() => null), device.popErrorScope().catch(() => null)]);
        }
        throw error;
      } finally {
        for (const b of transients) b.destroy();
        accumBuf?.destroy();
        outRgbaBuf?.destroy();
        outAlbBuf?.destroy();
        outNrmBuf?.destroy();
        readRgbaBuf?.destroy();
        readAlbBuf?.destroy();
        readNrmBuf?.destroy();
        if (runtime !== null && (cache.partBlas || cache.partShading || cache.studio || cache.hdr)) {
          scheduleEviction();
        }
      }
    },
  };
}
