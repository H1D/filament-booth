/**
 * cycles.ts: the Cycles photo engine. Blender's Cycles path tracer (CPU kernel, compiled to
 * WebAssembly from cycles/) renders in a worker; this side only posts the scene, forwards
 * passes and turns aborts into finish or cancel.
 *
 * A finished render's worker stays for IDLE_MS with its Cycles session. When the next photo
 * changes only the camera or the film (the other sections of the scene are the same objects, see
 * scene.ts), it renders again there, without uploading the scene or building the BVH again;
 * otherwise it is terminated, so the browser reclaims its whole heap, and a fresh worker renders.
 * A failed or cancelled render's worker is always terminated. Cancel rejects at once; the worker
 * stops Cycles and is then terminated.
 */
import type { RadianceFrame } from "../film";
import { hiddenFacesSettled } from "../print";
import type { Scene } from "../scene";
import type { Passes } from "./cycles-upload";
import { estimateHeapBytes, HEAP_LIMIT_BYTES, visibleTriangles } from "./cycles-upload";
import type { PhotoEngine } from "./photo";
import type { RenderRequest, RenderStats, WorkerReply } from "./cycles-worker";

const BASE = import.meta.env.BASE_URL;
/** A worker that has not confirmed a cancel by then is terminated anyway. */
const CANCEL_GRACE_MS = 3000;
/** How long a finished render's worker waits for the next photo of its part, holding its heap. */
export const IDLE_MS = 120_000;

/** The worker of the last finished render, waiting for another photo of its scene. */
interface Parked {
  readonly worker: Worker;
  readonly scene: Scene;
  /** Whether the part's hidden faces had come when it rendered (BeadMesh.hidden arrives late). */
  readonly culled: boolean;
  readonly timer: ReturnType<typeof setTimeout>;
}

const culled = (scene: Scene): boolean => scene.part?.mesh.hidden !== undefined;

/** Whether `next` is `last` but for its camera and film, so Cycles can render it again. */
export function sameButFrame(last: Scene, lastCulled: boolean, next: Scene): boolean {
  return next.part === last.part && culled(next) === lastCulled && next.lights === last.lights &&
    next.backdrop === last.backdrop && next.world === last.world;
}

export interface CyclesEngineOptions {
  /** Called once per finished render, for tooling. */
  readonly onStats?: (stats: RenderStats) => void;
}

export function cyclesEngine(options: CyclesEngineOptions = {}): PhotoEngine {
  let parked: Parked | null = null;
  const unpark = (): Parked | null => {
    const p = parked;
    parked = null;
    if (p) clearTimeout(p.timer);
    return p;
  };
  const take = (scene: Scene): { worker: Worker; again: boolean } => {
    const p = unpark();
    if (p && sameButFrame(p.scene, p.culled, scene)) return { worker: p.worker, again: true };
    p?.worker.terminate();
    return { worker: new Worker(new URL("./cycles-worker.ts", import.meta.url), { type: "module", name: "cycles" }), again: false };
  };
  const park = (worker: Worker, scene: Scene, wasCulled: boolean): void => {
    unpark()?.worker.terminate();
    parked = { worker, scene, culled: wasCulled, timer: setTimeout(() => { parked = null; worker.terminate(); }, IDLE_MS) };
  };
  return {
    id: "cycles",
    fits: async (scene) => {
      // Development only: lets tools/e2e/drive.ts check the fallback on a machine where Cycles runs.
      if (import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("no-cycles")) {
        return { reason: "switched off by ?no-cycles" };
      }
      const machine = await machineFits();
      if (machine !== true) return machine;
      // A photo right after a load waits the moment it takes for the faces no ray reaches.
      if (scene.part) await hiddenFacesSettled(scene.part.mesh);
      const need = estimateHeapBytes(scene.part ? visibleTriangles(scene.part.mesh) : 0, scene.film.width * scene.film.height);
      return need <= HEAP_LIMIT_BYTES
        ? true
        : { reason: `needs about ${(need / 1e9).toFixed(1)} GB, over the 4 GB WebAssembly limit` };
    },
    render: (scene, onPass, signal) => {
      if (signal.aborted && signal.reason !== "finish") return Promise.reject(signal.reason);
      const { worker, again } = take(scene), wasCulled = culled(scene);
      return render(scene, again, worker, () => park(worker, scene, wasCulled), onPass, signal, options);
    },
  };
}

function render(
  scene: Scene,
  again: boolean,
  worker: Worker,
  park: () => void,
  onPass: (frame: RadianceFrame, fraction: number) => void,
  signal: AbortSignal,
  options: CyclesEngineOptions,
): Promise<RadianceFrame> {
  return new Promise((resolve, reject) => {
    const { width, height, samples } = scene.film;
    const toFrame = (p: Passes): RadianceFrame => ({
      width, height, samples: p.samples, rgba: p.rgba, albedo: p.albedo ?? undefined, normal: p.normal ?? undefined,
    });
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
      if (reply.type === "done" && !settled) park();
      else if (reply.type !== "pass") worker.terminate();
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
      again,
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
