/**
 * Dev benchmark and parity page for WebGPU vs Cycles Wasm.
 * Supports query-parameter auto-run and RPC calls on window.__webgpuBenchRun.
 */
import type { AgxLook } from "../src/document";
import type { RadianceFrame } from "../src/film";
import { cyclesEngine, type CyclesEngineOptions } from "../src/photo/cycles";
import type { RenderStats } from "../src/photo/cycles-worker";
import { denoise } from "../src/photo/denoise";
import { webgpuEngine, type WebGpuEngineOptions, type WebGpuRenderStats } from "../src/photo/webgpu";
import type { Scene } from "../src/scene";
import { compiledFixture, isCompiledName } from "../tools/parity/compiled";
import { fixture, isFixtureName, realismFixture } from "../tools/parity/fixtures";

export interface BenchRequest {
  readonly fixture: string;
  readonly engine: "webgpu" | "cycles";
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly gcodeUrl?: string;
  readonly denoise?: boolean;
  readonly warmMutateLight?: boolean;
  readonly forceReset?: boolean;
  readonly look?: AgxLook;
}

export interface BenchResponse {
  readonly fixture: string;
  readonly engine: "webgpu" | "cycles";
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly transparent: boolean;
  readonly look: AgxLook;
  readonly renderMs: number;
  readonly denoiseMs: number;
  readonly denoiseTiles: number;
  readonly denoised: boolean;
  readonly denoiseError: string | null;
  readonly totalMs: number;
  readonly triangles: number;
  readonly webgpuStats: WebGpuRenderStats | null;
  readonly cyclesStats: RenderStats | null;
}

type Plane = "rgba" | "denoised" | "albedo" | "normal";

interface StoredFrame {
  readonly rgba: Float32Array;
  readonly denoised: Float32Array | null;
  readonly albedo: Float32Array | null;
  readonly normal: Float32Array | null;
}

declare global {
  interface Window {
    __webgpuBenchRun?: (req: BenchRequest) => Promise<BenchResponse>;
    __webgpuBenchBytes?: (plane: Plane, start: number, end: number) => string;
    __webgpuBenchStatus?: { state: string; message: string; result?: BenchResponse };
  }
}

const statusEl = document.getElementById("status");
const canvasEl = document.getElementById("preview") as HTMLCanvasElement | null;
const setStatus = (state: string, message: string, result?: BenchResponse) => {
  window.__webgpuBenchStatus = { state, message, result };
  if (statusEl) statusEl.textContent = `${state}: ${message}`;
};

let lastGpuStats: WebGpuRenderStats | null = null;
let lastCyclesStats: RenderStats | null = null;
const gpuOpts: WebGpuEngineOptions = { onStats: (s) => { lastGpuStats = s; } };
const cyOpts: CyclesEngineOptions = { onStats: (s) => { lastCyclesStats = s; } };
let gpuEngine = webgpuEngine(gpuOpts);
let cyEngine = cyclesEngine(cyOpts);
let stored: StoredFrame | null = null;

const gcodeCache = new Map<string, Promise<string>>();
function fetchGcode(url: string): Promise<string> {
  let pending = gcodeCache.get(url);
  if (!pending) {
    pending = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res.text();
    });
    gcodeCache.set(url, pending);
  }
  return pending;
}

const sceneCache = new Map<string, Promise<Scene>>();
async function baseSceneFor(req: BenchRequest): Promise<Scene> {
  const key = `${req.fixture}:${req.width}x${req.height}:${req.gcodeUrl ?? ""}`;
  let pending = sceneCache.get(key);
  if (!pending) {
    pending = (async () => {
      const opts = { width: req.width, height: req.height, samples: req.samples };
      if (isCompiledName(req.fixture)) {
        if (!req.gcodeUrl) throw new Error(`fixture ${req.fixture} needs gcodeUrl`);
        return compiledFixture(req.fixture, await fetchGcode(req.gcodeUrl), opts);
      }
      if (req.fixture === "realism") return realismFixture(opts);
      if (!isFixtureName(req.fixture)) throw new Error(`unknown fixture ${req.fixture}`);
      return fixture(req.fixture, opts);
    })();
    sceneCache.set(key, pending);
  }
  const base = await pending;
  const look = req.look ?? base.film.look;
  const lights = req.warmMutateLight
    ? { ...base.lights, emitters: base.lights.emitters.map((e) => ({ ...e })) }
    : base.lights;
  return {
    ...base,
    lights,
    film: {
      ...base.film,
      samples: req.samples,
      denoise: Boolean(req.denoise),
      look,
    },
  };
}

function drawStandardPreview(frame: RadianceFrame, rgba: Float32Array): void {
  if (!canvasEl) return;
  canvasEl.width = frame.width;
  canvasEl.height = frame.height;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  const out = new Uint8ClampedArray(frame.width * frame.height * 4);
  const enc = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  };
  for (let i = 0; i < out.length; i += 4) {
    out[i + 0] = enc(rgba[i + 0]);
    out[i + 1] = enc(rgba[i + 1]);
    out[i + 2] = enc(rgba[i + 2]);
    out[i + 3] = Math.round(Math.min(1, Math.max(0, rgba[i + 3])) * 255);
  }
  ctx.putImageData(new ImageData(out, frame.width, frame.height), 0, 0);
}

window.__webgpuBenchRun = async (req: BenchRequest): Promise<BenchResponse> => {
  setStatus("building", `${req.engine} ${req.fixture} ${req.width}x${req.height} @ ${req.samples} spp`);
  if (req.forceReset) {
    if (req.engine === "webgpu") gpuEngine = webgpuEngine(gpuOpts);
    else cyEngine = cyclesEngine(cyOpts);
  }
  const scene = await baseSceneFor(req);
  lastGpuStats = null;
  lastCyclesStats = null;

  const engine = req.engine === "webgpu" ? gpuEngine : cyEngine;
  const probe = await engine.fits(scene);
  if (probe !== true) throw new Error(`${req.engine} unavailable: ${probe.reason}`);

  setStatus("rendering", `${req.engine} ${req.fixture} ${req.samples} spp`);
  const t0 = performance.now();
  const frame = await engine.render(scene, () => {}, new AbortController().signal);
  const renderMs = performance.now() - t0;

  let denoised: Float32Array | null = null;
  let denoiseMs = 0;
  let denoiseTiles = 0;
  let denoiseError: string | null = null;
  if (req.denoise) {
    setStatus("denoising", `${req.engine} ${req.fixture}`);
    try {
      const res = await denoise(frame);
      denoised = res.frame.rgba;
      denoiseMs = res.ms;
      denoiseTiles = res.tiles;
    } catch (error: unknown) {
      denoiseError = error instanceof Error ? error.message : String(error);
    }
  }

  stored = {
    rgba: frame.rgba,
    denoised,
    albedo: frame.albedo ?? null,
    normal: frame.normal ?? null,
  };
  drawStandardPreview(frame, denoised ?? frame.rgba);

  const visibleTris = scene.part
    ? (scene.part.mesh.hidden
        ? (() => {
            let n = 0;
            const h = scene.part.mesh.hidden;
            for (let i = 0; i < h.length; i++) if (!h[i]) n++;
            return n;
          })()
        : scene.part.mesh.tris)
    : 0;

  const totalMs = performance.now() - t0;
  const response: BenchResponse = {
    fixture: req.fixture,
    engine: req.engine,
    width: frame.width,
    height: frame.height,
    samples: frame.samples,
    transparent: scene.film.transparent,
    look: scene.film.look,
    renderMs,
    denoiseMs,
    denoiseTiles,
    denoised: denoised !== null,
    denoiseError,
    totalMs,
    triangles: visibleTris,
    webgpuStats: lastGpuStats,
    cyclesStats: lastCyclesStats,
  };
  setStatus("finished", `${req.engine} ${req.fixture} ${Math.round(totalMs)} ms`, response);
  return response;
};

window.__webgpuBenchBytes = (plane, start, end) => {
  const data = stored?.[plane];
  if (!data) return "";
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).subarray(start, end);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

// Optional auto-run when opened manually with ?fixture=...
const params = new URLSearchParams(location.search);
if (params.has("fixture")) {
  const req: BenchRequest = {
    fixture: params.get("fixture") ?? "a",
    engine: params.get("engine") === "cycles" ? "cycles" : "webgpu",
    width: Number(params.get("width") ?? 640),
    height: Number(params.get("height") ?? 400),
    samples: Number(params.get("samples") ?? 64),
    gcodeUrl: params.get("gcode") ?? undefined,
    denoise: params.get("denoise") === "1",
    warmMutateLight: params.get("warm") === "1",
  };
  void window.__webgpuBenchRun(req).catch((error: unknown) => {
    setStatus("failed", error instanceof Error ? error.stack ?? error.message : String(error));
  });
}
