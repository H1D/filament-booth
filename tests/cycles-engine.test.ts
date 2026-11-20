/**
 * The Cycles engine's worker reuse, against stand-in workers: a finished render's worker waits
 * for a photo that changes only the camera or the film, and nothing else reuses it.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cyclesEngine, IDLE_MS } from "../src/photo/cycles";
import type { RenderRequest, WorkerReply } from "../src/photo/cycles-worker";
import type { Scene } from "../src/scene";
import { fixture } from "../tools/parity/fixtures";

class StandIn {
  static made: StandIn[] = [];
  /** The worker the engine sent its latest render to. */
  static last: StandIn | null = null;
  readonly posted: unknown[] = [];
  terminated = false;
  onmessage: ((event: { data: WorkerReply }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  constructor() {
    StandIn.made.push(this);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
    if ((message as { type: string }).type === "render") StandIn.last = this;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: WorkerReply): void {
    this.onmessage?.({ data });
  }
  get requests(): RenderRequest[] {
    return this.posted.filter((m) => (m as { type: string }).type === "render") as RenderRequest[];
  }
}

const passes = (scene: Scene) => ({ samples: scene.film.samples, rgba: new Float32Array(scene.film.width * scene.film.height * 4), albedo: null, normal: null });
const stats = { syncMs: 0, bvhMs: 0, samplingMs: 0, snapshotMs: 0, heapBytes: 0, cyclesPeakBytes: 0, threads: 1 };

/** Renders `scene` on `engine` and has its worker answer `reply`; returns that worker. */
async function shoot(engine: ReturnType<typeof cyclesEngine>, scene: Scene, reply: "done" | "failed" = "done"): Promise<StandIn> {
  const photo = engine.render(scene, () => {}, new AbortController().signal);
  const worker = StandIn.last;
  if (!worker) throw new Error("no render was posted");
  if (reply === "done") worker.reply({ type: "done", passes: passes(scene), stats });
  else worker.reply({ type: "failed", message: "out of memory" });
  await photo.catch(() => {});
  return worker;
}

const small = { width: 8, height: 5, samples: 4 };

beforeEach(() => {
  StandIn.made = [];
  StandIn.last = null;
  vi.stubGlobal("Worker", StandIn);
  vi.stubGlobal("location", { href: "http://booth.test/" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a photo with another camera or film renders again on the last render's worker", async () => {
  const engine = cyclesEngine(), scene = fixture("a", small);
  const first = await shoot(engine, scene);
  expect(first.terminated).toBe(false);
  const moved = await shoot(engine, { ...scene, camera: { ...scene.camera, fovYRad: 0.3 } });
  const bigger = await shoot(engine, { ...scene, film: { ...scene.film, width: 16, height: 10, samples: 64 } });
  expect([moved, bigger]).toEqual([first, first]);
  expect(StandIn.made).toHaveLength(1);
  expect(first.requests.map((r) => r.again)).toEqual([false, true, true]);
});

test("another part, light, backdrop or world, or the part's hidden faces come since, gets a fresh worker", async () => {
  const engine = cyclesEngine(), scene = fixture("a", small), b = fixture("b", small);
  const part = scene.part;
  if (!part) throw new Error("fixture a has a part");
  const changes: Scene[] = [
    { ...scene, part: { ...part } },
    { ...scene, lights: b.lights },
    { ...scene, backdrop: b.backdrop },
    { ...scene, world: { ...scene.world, strength: 2 } },
  ];
  let last = await shoot(engine, scene);
  for (const changed of changes) {
    const next = await shoot(engine, changed);
    expect(next).not.toBe(last);
    expect(last.terminated).toBe(true);
    expect(next.requests[0].again).toBe(false);
    last = next;
  }
  const culled = changes[3];
  if (!culled.part) throw new Error("no part");
  culled.part.mesh.hidden = new Uint8Array(culled.part.mesh.tris);
  const next = await shoot(engine, culled);
  expect(next).not.toBe(last);
  expect(next.requests[0].again).toBe(false);
  expect(await shoot(engine, { ...culled, camera: { ...culled.camera, fovYRad: 0.3 } })).toBe(next);
});

test("a parked worker is ended after IDLE_MS", async () => {
  vi.useFakeTimers();
  const engine = cyclesEngine(), scene = fixture("a", small);
  const worker = await shoot(engine, scene);
  vi.advanceTimersByTime(IDLE_MS - 1);
  expect(worker.terminated).toBe(false);
  vi.advanceTimersByTime(1);
  expect(worker.terminated).toBe(true);
  const next = await shoot(engine, scene);
  expect(next).not.toBe(worker);
  expect(next.requests[0].again).toBe(false);
});

test("a failed or cancelled render's worker is ended, not kept", async () => {
  const engine = cyclesEngine(), scene = fixture("a", small);
  const failed = await shoot(engine, scene, "failed");
  expect(failed.terminated).toBe(true);
  vi.useFakeTimers();
  const controller = new AbortController();
  const photo = engine.render(scene, () => {}, controller.signal);
  const cancelled = StandIn.last;
  expect(cancelled).not.toBe(failed);
  controller.abort(new Error("cancelled by the user"));
  await expect(photo).rejects.toThrow("cancelled by the user");
  cancelled?.reply({ type: "cancelled" });
  expect(cancelled?.terminated).toBe(true);
  expect(await shoot(engine, scene)).not.toBe(cancelled);
});
