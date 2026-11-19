/**
 * cycles.ts: the Cycles photo engine. Blender's Cycles path tracer (CPU kernel, compiled to
 * WebAssembly from cycles/) renders in a worker; this side only posts the scene, forwards
 * passes and turns aborts into finish or cancel.
 *
 * Each render gets a fresh worker, terminated when the render settles, so the browser reclaims
 * the whole heap. Cancel rejects at once; the worker stops Cycles and is then terminated.
 */
import type { RadianceFrame } from "../film";
import type { Scene } from "../scene";
import type { Passes } from "./cycles-upload";
import { estimateHeapBytes, HEAP_LIMIT_BYTES } from "./cycles-upload";
import type { PhotoEngine } from "./photo";
import type { RenderRequest, RenderStats, WorkerReply } from "./cycles-worker";

const BASE = import.meta.env.BASE_URL;
/** A worker that has not confirmed a cancel by then is terminated anyway. */
const CANCEL_GRACE_MS = 3000;

export interface CyclesEngineOptions {
  /** Called once per finished render, for tooling. */
  readonly onStats?: (stats: RenderStats) => void;
}

export function cyclesEngine(options: CyclesEngineOptions = {}): PhotoEngine {
  return {
    id: "cycles",
    fits: async (scene) => {
      const machine = await machineFits();
      if (machine !== true) return machine;
      const need = estimateHeapBytes(scene.part ? scene.part.mesh.index.length / 3 : 0, scene.film.width * scene.film.height);
      return need <= HEAP_LIMIT_BYTES
        ? true
        : { reason: `needs about ${(need / 1e9).toFixed(1)} GB, over the 4 GB WebAssembly limit` };
    },
    render: (scene, onPass, signal) => render(scene, onPass, signal, options),
  };
}

function render(
  scene: Scene,
  onPass: (frame: RadianceFrame, fraction: number) => void,
  signal: AbortSignal,
  options: CyclesEngineOptions,
): Promise<RadianceFrame> {
  return new Promise((resolve, reject) => {
    if (signal.aborted && signal.reason !== "finish") {
      reject(signal.reason);
      return;
    }
    const { width, height, samples } = scene.film;
    const toFrame = (p: Passes): RadianceFrame => ({
      width, height, samples: p.samples, rgba: p.rgba, albedo: p.albedo ?? undefined, normal: p.normal ?? undefined,
    });
    const worker = new Worker(new URL("./cycles-worker.ts", import.meta.url), { type: "module", name: "cycles" });
    let settled = false;
    const settle = () => {
      settled = true;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (signal.reason === "finish") {
        worker.postMessage({ type: "finish" });
        return;
      }
      settle();
      worker.postMessage({ type: "cancel" });
      setTimeout(() => worker.terminate(), CANCEL_GRACE_MS);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort);
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type !== "pass") worker.terminate();
      if (settled) return;
      switch (reply.type) {
        case "pass":
          onPass(toFrame(reply.passes), Math.min(1, reply.passes.samples / samples));
          break;
        case "done":
          settle();
          options.onStats?.(reply.stats);
          resolve(toFrame(reply.passes));
          break;
        case "failed":
        case "cancelled":
          settle();
          reject(new Error(`Cycles: ${reply.type === "failed" ? reply.message : "cancelled"}`));
          break;
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      if (settled) return;
      settle();
      reject(new Error(`Cycles worker: ${event.message}`));
    };
    const request: RenderRequest = {
      type: "render",
      scene,
      moduleUrl: new URL(`${BASE}cycles/cycles_booth.mjs`, location.href).href,
      hdrUrl: new URL(`${BASE}hdr/${scene.world.hdrId}.hdr`, location.href).href,
      poolSize: navigator.hardwareConcurrency + 4,
    };
    worker.postMessage(request);
    if (signal.aborted) onAbort();
  });
}

let machine: Promise<true | { reason: string }> | null = null;

/** Cross-origin isolation, shared wasm memory, wasm SIMD. Checked once per page. */
function machineFits(): Promise<true | { reason: string }> {
  machine ??= Promise.resolve().then(() => {
    if (!globalThis.crossOriginIsolated) return { reason: "the page is not cross-origin isolated" };
    try {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
      if (!(memory.buffer instanceof SharedArrayBuffer)) return { reason: "no shared WebAssembly memory" };
    } catch {
      return { reason: "no WebAssembly threads" };
    }
    if (!WebAssembly.validate(SIMD_PROBE)) return { reason: "no WebAssembly SIMD" };
    return true;
  });
  return machine;
}

/** (func (result v128) i32.const 0 i8x16.splat i8x16.popcnt): valid only with SIMD. */
const SIMD_PROBE = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11);
