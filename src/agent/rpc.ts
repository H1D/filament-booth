/**
 * rpc.ts: a blocking call from a worker to the main thread.
 *
 * Blender's API is synchronous: `light.data.energy = 30` lands or raises
 * before the next line, and `bpy.ops.render.render()` returns when the photo
 * exists. Python runs in a worker, so a runaway loop never holds the page,
 * and each host call parks the worker on Atomics.wait until the main thread
 * answers, however long the answer takes. The page is cross-origin isolated
 * for Cycles' threads, so SharedArrayBuffer is there.
 *
 * The request travels by postMessage, the answer through one shared buffer.
 * Python is single-threaded, so one call is in flight at a time. Strings both
 * ways; this file knows nothing about what they say. An answer larger than
 * the buffer is an error naming its size, never a truncation.
 */

export const DEFAULT_CHANNEL_BYTES = 1 << 20;
const HEADER_BYTES = 8;
const WAITING = 0;
const ANSWERED = 1;
const FAILED = 2;
const TOO_BIG = 3;

/** Worker to main thread: one call. */
export interface HostRequest { readonly host: string }

export const isHostRequest = (data: unknown): data is HostRequest =>
  typeof data === "object" && data !== null && typeof (data as { host?: unknown }).host === "string";

/** The buffer one worker's calls are answered through. */
export function createChannel(bytes = DEFAULT_CHANNEL_BYTES): SharedArrayBuffer {
  return new SharedArrayBuffer(HEADER_BYTES + bytes);
}

/**
 * Worker side: `callHost(request)` posts the request and blocks the worker
 * until the main thread answers. It throws when the handler failed or the
 * answer did not fit.
 */
export function hostCaller(channel: SharedArrayBuffer, post: (message: HostRequest) => void): (request: string) => string {
  const state = new Int32Array(channel, 0, 2);
  const payload = new Uint8Array(channel, HEADER_BYTES);
  const decoder = new TextDecoder();
  return (request) => {
    Atomics.store(state, 0, WAITING);
    post({ host: request });
    while (Atomics.load(state, 0) === WAITING) Atomics.wait(state, 0, WAITING);
    const status = Atomics.load(state, 0);
    const length = Atomics.load(state, 1);
    if (status === TOO_BIG) throw new Error(`the answer is ${length} bytes, more than the ${payload.length} byte channel holds`);
    // TextDecoder refuses views of shared memory, so the bytes are copied out first.
    const text = decoder.decode(payload.slice(0, length));
    if (status === FAILED) throw new Error(text);
    return text;
  };
}

/**
 * Main side: answers every request `worker` posts with what `handler`
 * settles to. Returns the function that stops answering, after which a
 * late answer is dropped.
 */
export function serveHost(
  worker: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  channel: SharedArrayBuffer,
  handler: (request: string) => string | Promise<string>,
): () => void {
  const state = new Int32Array(channel, 0, 2);
  const payload = new Uint8Array(channel, HEADER_BYTES);
  const encoder = new TextEncoder();
  let live = true;
  const answer = (status: number, text: string) => {
    if (!live) return;
    const bytes = encoder.encode(text);
    if (bytes.length > payload.length) {
      Atomics.store(state, 1, bytes.length);
      Atomics.store(state, 0, TOO_BIG);
    } else {
      payload.set(bytes);
      Atomics.store(state, 1, bytes.length);
      Atomics.store(state, 0, status);
    }
    Atomics.notify(state, 0);
  };
  const failed = (e: unknown) => { answer(FAILED, e instanceof Error ? e.message : String(e)); };
  const onMessage = (event: MessageEvent) => {
    if (!isHostRequest(event.data)) return;
    let result: string | Promise<string>;
    try {
      result = handler(event.data.host);
    } catch (e) {
      failed(e);
      return;
    }
    if (typeof result === "string") answer(ANSWERED, result);
    else result.then((text) => { answer(ANSWERED, text); }, failed);
  };
  worker.addEventListener("message", onMessage as EventListener);
  return () => {
    live = false;
    worker.removeEventListener("message", onMessage as EventListener);
  };
}
