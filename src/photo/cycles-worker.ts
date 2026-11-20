/**
 * cycles-worker.ts: hosts the Cycles module for one scene setup, and the engine terminates it
 * when the setup changes, after a failure or cancel, or when it has been idle a while. A wasm
 * heap never shrinks, so only a new worker returns the memory.
 *
 * After a finished render the worker keeps its Cycles session. A request marked `again` renders
 * the same scene with a new camera or film in it, so the scene upload and the BVH build, seconds
 * on a large print, happen once.
 *
 * Protocol, per render: the engine posts a RenderRequest, may post "finish" or "cancel", and
 * receives passes as they arrive and then exactly one "done", "failed" or "cancelled".
 *
 * Cancel stops Cycles here before the worker is terminated. Terminating alone leaves the render
 * threads running: they are nested workers busy in wasm, and Chromium only stops those by force
 * two seconds after their parent goes (measured: 16 cores busy for 2.2 to 2.5 s).
 */
import type { Scene } from "../scene";
import { decodeRgbe, loadCycles, readPasses, RenderState, uploadAgain, uploadScene, type CyclesModule, type Frame, type Passes } from "./cycles-upload";

interface Request {
  readonly type: "render";
  readonly moduleUrl: string;
  readonly hdrUrl: string;
  readonly poolSize: number;
}
export type RenderRequest =
  | Request & { readonly again: false; readonly scene: Scene }
  /** The last render's scene, which finished, with this camera and film. Never a worker's first. */
  | Request & { readonly again: true; readonly scene: Frame };
export type ControlMessage = RenderRequest | { readonly type: "finish" } | { readonly type: "cancel" };

export interface RenderStats {
  readonly syncMs: number; // start to first sample: scene upload to device, BVH build
  readonly bvhMs: number;
  readonly samplingMs: number;
  /** Time Cycles' session thread spent copying passes out, tracing no path meanwhile. */
  readonly snapshotMs: number;
  readonly heapBytes: number;
  /** Cycles' own high-water mark over every render of the session. */
  readonly cyclesPeakBytes: number;
  readonly threads: number;
}
export type WorkerReply =
  | { readonly type: "pass"; readonly passes: Passes }
  | { readonly type: "done"; readonly passes: Passes; readonly stats: RenderStats }
  | { readonly type: "failed"; readonly message: string }
  | { readonly type: "cancelled" };

const POLL_MS = 50;

let finishRequested = false;
let cancelRequested = false;
let module: Promise<CyclesModule> | null = null;

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

function emptyPasses(scene: Frame): Passes {
  return { samples: 0, rgba: new Float32Array(scene.film.width * scene.film.height * 4), albedo: null, normal: null };
}

async function render(request: RenderRequest): Promise<void> {
  const { scene } = request;
  finishRequested = false;
  cancelRequested = false;
  module ??= loadCycles(request.moduleUrl, request.poolSize);
  // The world image loads alongside the module, and only for a new session.
  const describe: Promise<(M: CyclesModule) => void> = request.again
    ? Promise.resolve((M) => uploadAgain(M, request.scene))
    : fetchWorld(request.hdrUrl).then((world) => (M) => uploadScene(M, request.scene, world));
  const [M, upload] = await Promise.all([module, describe]);
  if (cancelRequested) {
    post({ type: "cancelled" });
    return;
  }
  upload(M);
  // Before the start: a render again can publish its first pass at once. It counts on across renders.
  let version = M._cb_passes_version();
  if (M._cb_render_start() < 0) throw new Error(M.UTF8ToString(M._cb_error()));
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (cancelRequested) {
      M._cb_cancel();
      M._cb_session_free();
      post({ type: "cancelled" });
      return;
    }
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
    return;
  }
}

function stats(M: CyclesModule): RenderStats {
  return {
    syncMs: M._cb_time_ms(0),
    samplingMs: M._cb_time_ms(1),
    bvhMs: M._cb_time_ms(2),
    snapshotMs: M._cb_time_ms(3),
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
  if (message.type === "cancel") {
    cancelRequested = true;
    return;
  }
  render(message).catch((error: unknown) => post({ type: "failed", message: error instanceof Error ? error.message : String(error) }));
};
