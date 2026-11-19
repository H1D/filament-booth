/**
 * cycles-worker.ts: hosts the Cycles module for one render, then the engine terminates it.
 * A fresh worker per render returns the whole wasm heap to the browser afterwards (a wasm heap
 * never shrinks) and makes cancel immediate in every phase, BVH build included.
 *
 * Protocol: the engine posts one RenderRequest, may post "finish", and receives passes as they
 * arrive and then exactly one "done" or "failed".
 */
import type { Scene } from "../scene";
import { decodeRgbe, loadCycles, readPasses, RenderState, uploadScene, type CyclesModule, type Passes } from "./cycles-upload";

export interface RenderRequest {
  readonly type: "render";
  readonly scene: Scene;
  readonly moduleUrl: string;
  readonly hdrUrl: string;
  readonly poolSize: number;
}
export type ControlMessage = RenderRequest | { readonly type: "finish" };

export interface RenderStats {
  readonly syncMs: number; // start to first sample: scene upload to device, BVH build
  readonly bvhMs: number;
  readonly samplingMs: number;
  readonly heapBytes: number;
  readonly cyclesPeakBytes: number;
  readonly threads: number;
}
export type WorkerReply =
  | { readonly type: "pass"; readonly passes: Passes }
  | { readonly type: "done"; readonly passes: Passes; readonly stats: RenderStats }
  | { readonly type: "failed"; readonly message: string };

const POLL_MS = 50;

let finishRequested = false;

function post(reply: WorkerReply): void {
  const { passes } = "passes" in reply ? reply : { passes: null };
  const transfer = passes ? [passes.rgba, passes.albedo, passes.normal].flatMap((a) => (a ? [a.buffer] : [])) : [];
  self.postMessage(reply, { transfer });
}

async function fetchWorld(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`world ${url}: HTTP ${response.status}`);
  return decodeRgbe(new Uint8Array(await response.arrayBuffer()));
}

function emptyPasses(scene: Scene): Passes {
  return { samples: 0, rgba: new Float32Array(scene.film.width * scene.film.height * 4), albedo: null, normal: null };
}

async function render(request: RenderRequest): Promise<void> {
  const { scene } = request;
  const [M, world] = await Promise.all([loadCycles(request.moduleUrl, request.poolSize), fetchWorld(request.hdrUrl)]);
  uploadScene(M, scene, world);
  if (M._cb_render_start() < 0) throw new Error(M.UTF8ToString(M._cb_error()));
  let version = 0;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (finishRequested) M._cb_finish();
    const state = M._cb_render_state();
    if (state === RenderState.failed) throw new Error(M.UTF8ToString(M._cb_error()));
    const v = M._cb_passes_version();
    if (state === RenderState.running) {
      if (v !== version) {
        version = v;
        const passes = readPasses(M, scene.film.width, scene.film.height);
        if (passes) post({ type: "pass", passes });
      }
      continue;
    }
    const passes = readPasses(M, scene.film.width, scene.film.height) ?? emptyPasses(scene);
    post({ type: "done", passes, stats: stats(M) });
    M._cb_session_free();
    return;
  }
}

function stats(M: CyclesModule): RenderStats {
  return {
    syncMs: M._cb_time_ms(0),
    samplingMs: M._cb_time_ms(1),
    bvhMs: M._cb_time_ms(2),
    heapBytes: M._cb_heap_bytes(),
    cyclesPeakBytes: M._cb_cycles_peak_bytes(),
    threads: M._cb_threads(),
  };
}

self.onmessage = (event: MessageEvent<ControlMessage>) => {
  const message = event.data;
  if (message.type === "finish") {
    finishRequested = true;
    return;
  }
  render(message).catch((error: unknown) => post({ type: "failed", message: error instanceof Error ? error.message : String(error) }));
};
