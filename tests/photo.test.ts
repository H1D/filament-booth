import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultDocument } from "../src/document";
import { parseManifest, type AgxData, type RadianceFrame } from "../src/film";
import { PhotoCancelled, PhotoDesk, photoFileName, type PhotoEngine, type PhotoProgress, type PhotoRun, type PhotoTools } from "../src/photo/photo";
import { compileScene, type FilmSection } from "../src/scene";

const manifest = parseManifest(JSON.parse(readFileSync(new URL("../public/lut/manifest.json", import.meta.url), "utf8")));
const scene = compileScene(defaultDocument(), null, 7);

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function frame(samples: number): RadianceFrame {
  return { width: 4, height: 2, samples, rgba: new Float32Array(32) };
}

interface FakeBitmap extends ImageBitmap {
  closed: boolean;
}

/** The browser-only steps, the clock, and a record of what the desk asked of them. */
class Bench {
  nowMs = new Date(2026, 10, 19, 14, 5).getTime();
  readonly log: string[] = [];
  readonly bitmaps: FakeBitmap[] = [];
  readonly developed: RadianceFrame[] = [];
  readonly films: FilmSection[] = [];
  readonly png = new Blob(["png"]);
  loadGate: Deferred<void> | null = null;
  developGate: Deferred<Blob> | null = null;
  quickLookFails = false;
  loadFails: string | null = null;

  readonly tools: PhotoTools = {
    loadAgx: async (look) => {
      this.log.push("loadAgx");
      if (this.loadFails !== null) throw new Error(this.loadFails);
      await this.loadGate?.promise;
      const data: AgxData = { look, manifest, base: new Float32Array(0), pre: null };
      return data;
    },
    quickLook: () => {
      if (this.quickLookFails) throw new Error("no canvas");
      const bitmap: FakeBitmap = {
        width: 2,
        height: 1,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      this.bitmaps.push(bitmap);
      return bitmap;
    },
    develop: async (developing, film) => {
      this.developed.push(developing);
      this.films.push(film);
      return this.developGate ? this.developGate.promise : this.png;
    },
    now: () => this.nowMs,
  };

  advance(ms: number): void {
    this.nowMs += ms;
  }

  get open(): number {
    return this.bitmaps.filter((b) => !b.closed).length;
  }
}

interface Drive {
  readonly onPass: (f: RadianceFrame, fraction: number) => void;
  readonly resolve: (f: RadianceFrame) => void;
  readonly reject: (e: Error) => void;
  last: RadianceFrame | null;
}

/** An engine the test drives pass by pass. Like a real one it stops on abort: "finish" resolves with the last pass, anything else rejects. */
class FakeEngine implements PhotoEngine {
  fit: true | { reason: string } = true;
  fitsThrows: string | null = null;
  /** Keep running after an abort until release(), as a worker that is slow to unwind. */
  holdAbort = false;
  renders = 0;
  active = 0;
  maxActive = 0;
  signal: AbortSignal | null = null;
  #current: Drive | null = null;
  #release: (() => void) | null = null;

  readonly id: PhotoEngine["id"];
  readonly #bench: Bench;

  constructor(id: PhotoEngine["id"], bench: Bench) {
    this.id = id;
    this.#bench = bench;
  }

  async fits(): Promise<true | { reason: string }> {
    if (this.fitsThrows !== null) throw new Error(this.fitsThrows);
    return this.fit;
  }

  render(_scene: unknown, onPass: (f: RadianceFrame, fraction: number) => void, signal: AbortSignal): Promise<RadianceFrame> {
    this.renders++;
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.signal = signal;
    this.#bench.log.push(`render:${this.id}`);
    const promise = new Promise<RadianceFrame>((resolve, reject) => {
      const current: Drive = { onPass, resolve, reject, last: null };
      this.#current = current;
      signal.addEventListener("abort", () => {
        const stop = () => (signal.reason === "finish" && current.last ? resolve(current.last) : reject(new Error("aborted")));
        if (this.holdAbort) this.#release = stop;
        else stop();
      });
    });
    const done = () => {
      this.active--;
    };
    promise.then(done, done);
    return promise;
  }

  pass(samples: number, fraction: number): void {
    const f = frame(samples);
    if (this.#current === null) throw new Error("not rendering");
    this.#current.last = f;
    this.#current.onPass(f, fraction);
  }

  complete(samples: number): void {
    this.#current?.resolve(frame(samples));
  }

  crash(message: string): void {
    this.#current?.reject(new Error(message));
  }

  release(): void {
    this.#release?.();
  }
}

type Rendering = Extract<PhotoProgress, { state: "rendering" }>;

function watch(run: PhotoRun): PhotoProgress[] {
  const seen: PhotoProgress[] = [];
  run.onProgress((p) => seen.push(p));
  return seen;
}

const states = (seen: readonly PhotoProgress[]) => seen.map((p) => p.state).filter((s, i, all) => s !== all[i - 1]);
const renderings = (seen: readonly PhotoProgress[]) => seen.filter((p): p is Rendering => p.state === "rendering");

function setup(ids: readonly PhotoEngine["id"][] = ["cycles"]) {
  const bench = new Bench();
  const engines = ids.map((id) => new FakeEngine(id, bench));
  const desk = new PhotoDesk(engines, bench.tools);
  return { bench, engines, desk };
}

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => consoleError.mockClear());

describe("a photo that goes well", () => {
  test("moves through preparing, rendering, developing, done and hands back the developed frame", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(16, 0.25);
    bench.advance(600);
    cycles.pass(32, 0.5);
    bench.advance(600);
    cycles.complete(64);
    const photo = await run.result;

    expect(states(seen)).toEqual(["preparing", "rendering", "developing", "done"]);
    expect(renderings(seen).map((p) => p.fraction)).toEqual([0, 0.25, 0.5]);
    expect(photo).toMatchObject({ engine: "cycles", samples: 64, width: 4, height: 2, docRev: 7, fileName: "bracket_20261119-1405.png" });
    expect(photo.png).toBe(bench.png);
    expect(run.docRev).toBe(7);
  });

  test("loads the tone map once, before any engine renders", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    for (let i = 1; i <= 4; i++) {
      cycles.pass(i, i / 4);
      bench.advance(600);
    }
    cycles.complete(4);
    await run.result;
    expect(bench.log).toEqual(["loadAgx", "render:cycles"]);
  });

  test("develops with the scene's film settings", async () => {
    const { engines: [cycles], desk, bench } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.complete(64);
    await run.result;
    expect(bench.films).toEqual([scene.film]);
  });

  test("a failed tone map load ends the photo without trying an engine", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.loadFails = "404 manifest.json";
    const run = desk.take(scene, "bracket");
    await expect(run.result).rejects.toThrow("404 manifest.json");
    expect(cycles.renders).toBe(0);
  });

  test("a development failure fails the photo and does not render again", async () => {
    const { bench, engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    bench.developGate = deferred<Blob>();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.complete(64);
    await tick();
    bench.developGate.reject(new Error("canvas lost"));
    await expect(run.result).rejects.toThrow("canvas lost");
    expect(states(seen).at(-1)).toBe("failed");
    expect(raster.renders).toBe(0);
  });
});

describe("choosing an engine", () => {
  test("skips an engine that does not fit and keeps its reason for the status line", async () => {
    const { engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    cycles.fit = { reason: "needs 3 GB of memory" };
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    raster.complete(32);
    const photo = await run.result;

    expect(cycles.renders).toBe(0);
    expect(photo.engine).toBe("raster");
    const messages = seen.flatMap((p) => (p.state === "preparing" ? [p.message] : []));
    expect(messages.some((m) => m.includes("cycles") && m.includes("needs 3 GB of memory"))).toBe(true);
  });

  test("an engine whose fits check throws is skipped", async () => {
    const { engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    cycles.fitsThrows = "no SharedArrayBuffer";
    const run = desk.take(scene, "bracket");
    await tick();
    raster.complete(32);
    expect((await run.result).engine).toBe("raster");
    expect(cycles.renders).toBe(0);
  });

  test("falls back when the first engine throws mid-render, and the fraction restarts", async () => {
    const { bench, engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(32, 0.5);
    cycles.crash("wasm trap");
    await tick();
    expect(raster.renders).toBe(1);
    raster.pass(8, 0.125);
    bench.advance(600);
    raster.complete(64);
    const photo = await run.result;

    expect(photo.engine).toBe("raster");
    expect(renderings(seen).map((p) => p.fraction)).toEqual([0, 0.5, 0, 0.125]);
    expect(bench.open).toBe(0);
  });

  test("reports every engine's reason when none can take the photo", async () => {
    const { engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    cycles.fit = { reason: "no wasm threads" };
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    raster.crash("WebGL context lost");
    const failure = await run.result.then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PhotoCancelled);
    const message = failure instanceof Error ? failure.message : "";
    for (const part of ["cycles", "no wasm threads", "raster", "WebGL context lost"]) expect(message).toContain(part);
    const last = seen.at(-1);
    expect(last).toMatchObject({ state: "failed", message });
  });

  test("with no engines the photo fails and says so", async () => {
    const { desk } = setup([]);
    await expect(desk.take(scene, "bracket").result).rejects.toThrow(/no photo engine/i);
  });
});

describe("cancel", () => {
  test("while preparing: cancelled, rejected with PhotoCancelled, no engine started", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.loadGate = deferred<void>();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    run.cancel();
    bench.loadGate.resolve();
    await tick();

    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(states(seen)).toEqual(["preparing", "cancelled"]);
    expect(cycles.renders).toBe(0);
  });

  test("while rendering: aborts the engine, closes the image, and goes quiet", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(8, 0.1);
    run.cancel();
    await tick();
    const count = seen.length;
    cycles.pass(9, 0.2);
    await tick();

    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(cycles.signal?.aborted).toBe(true);
    expect(states(seen)).toEqual(["preparing", "rendering", "cancelled"]);
    expect(seen).toHaveLength(count);
    expect(bench.open).toBe(0);
    expect(bench.developed).toHaveLength(0);
  });

  test("while developing: cancelled at once, and the late PNG does not revive it", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.developGate = deferred<Blob>();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.complete(64);
    await tick();
    expect(seen.at(-1)?.state).toBe("developing");
    run.cancel();
    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
    bench.developGate.resolve(bench.png);
    await tick();

    expect(states(seen)).toEqual(["preparing", "rendering", "developing", "cancelled"]);
  });

  test("is idempotent", async () => {
    const { engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(8, 0.1);
    run.cancel();
    run.cancel();
    await tick();
    run.cancel();
    expect(seen.filter((p) => p.state === "cancelled")).toHaveLength(1);
  });

  test("after the photo is done it changes nothing", async () => {
    const { engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.complete(64);
    const photo = await run.result;
    run.cancel();
    await tick();

    expect(await run.result).toBe(photo);
    expect(seen.at(-1)?.state).toBe("done");
  });

  test("after a failure it changes nothing", async () => {
    const { desk } = setup([]);
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await run.result.catch(() => {});
    run.cancel();
    expect(seen.at(-1)?.state).toBe("failed");
    await expect(run.result).rejects.not.toBeInstanceOf(PhotoCancelled);
  });
});

describe("finishNow", () => {
  test("mid-render develops what exists and reports the samples the frame holds", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(12, 0.19);
    bench.advance(600);
    cycles.pass(20, 0.31);
    run.finishNow();
    const photo = await run.result;

    expect(scene.film.samples).toBeGreaterThan(20);
    expect(photo.samples).toBe(20);
    expect(photo.engine).toBe("cycles");
    expect(cycles.signal?.reason).toBe("finish");
    expect(states(seen)).toEqual(["preparing", "rendering", "developing", "done"]);
    expect(bench.developed.map((f) => f.samples)).toEqual([20]);
  });

  test("before the first pass it behaves as cancel", async () => {
    const { engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    run.finishNow();

    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(cycles.signal?.reason).toBe("cancel");
    expect(states(seen)).toEqual(["preparing", "rendering", "cancelled"]);
  });

  test("while preparing it behaves as cancel", async () => {
    const { bench, desk } = setup();
    bench.loadGate = deferred<void>();
    const run = desk.take(scene, "bracket");
    run.finishNow();
    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
  });

  test("after a fallback, before the new engine's first pass, it behaves as cancel", async () => {
    const { engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(32, 0.5);
    cycles.crash("wasm trap");
    await tick();
    run.finishNow();

    await expect(run.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(raster.signal?.reason).toBe("cancel");
  });

  test("while developing it does not disturb the photo", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.developGate = deferred<Blob>();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.complete(64);
    await tick();
    run.finishNow();
    bench.developGate.resolve(bench.png);
    expect((await run.result).samples).toBe(64);
  });

  test("if the engine crashes while finishing, the photo fails and no other engine starts over", async () => {
    const { engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    cycles.holdAbort = true;
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(12, 0.19);
    run.finishNow();
    cycles.crash("out of memory");

    await expect(run.result).rejects.toThrow("out of memory");
    expect(raster.renders).toBe(0);
  });
});

describe("one photo at a time", () => {
  test("a second take cancels a render in flight and waits for its engine to stop", async () => {
    const { engines: [cycles], desk } = setup();
    cycles.holdAbort = true;
    const first = desk.take(scene, "one");
    await tick();
    cycles.pass(8, 0.1);
    const second = desk.take(scene, "two");
    await tick();

    await expect(first.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(cycles.renders).toBe(1);
    cycles.release();
    await tick();
    expect(cycles.renders).toBe(2);
    cycles.complete(64);
    expect((await second.result).fileName).toMatch(/^two_/);
    expect(cycles.maxActive).toBe(1);
  });

  test("the cancelled run stays cancelled when its engine finishes after the second take", async () => {
    const { bench, engines: [cycles], desk } = setup();
    cycles.holdAbort = true;
    const first = desk.take(scene, "one");
    await tick();
    const second = desk.take(scene, "two");
    cycles.complete(64);
    await tick();

    await expect(first.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect(bench.developed).toHaveLength(0);
    cycles.complete(32);
    expect((await second.result).samples).toBe(32);
  });

  test("a second take while the first is developing still cancels it, whenever the PNG arrives", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.developGate = deferred<Blob>();
    const first = desk.take(scene, "one");
    await tick();
    cycles.complete(64);
    await tick();
    const second = desk.take(scene, "two");
    bench.developGate.resolve(bench.png);
    await tick();
    cycles.complete(16);

    await expect(first.result).rejects.toBeInstanceOf(PhotoCancelled);
    expect((await second.result).fileName).toMatch(/^two_/);
  });

  test("a second take leaves an already finished photo alone", async () => {
    const { engines: [cycles], desk } = setup();
    const first = desk.take(scene, "one");
    await tick();
    cycles.complete(64);
    const photo = await first.result;
    const second = desk.take(scene, "two");
    await tick();
    cycles.complete(16);

    expect(await first.result).toBe(photo);
    expect((await second.result).samples).toBe(16);
  });
});

describe("quick looks", () => {
  test("at most two a second, and always one for the first pass", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    for (let i = 0; i < 10; i++) {
      cycles.pass(i + 1, (i + 1) / 20);
      bench.advance(100);
    }
    expect(bench.bitmaps).toHaveLength(2);
    cycles.pass(11, 0.55);
    expect(bench.bitmaps).toHaveLength(3);
    cycles.complete(64);
    await run.result;

    const images = new Set(renderings(seen).map((p) => p.image).filter((image) => image !== null));
    expect(images.size).toBe(3);
  });

  test("estimates the time left from the pass rate, not from the start of the render", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    bench.advance(30_000);
    cycles.pass(8, 0.1);
    bench.advance(1000);
    cycles.pass(16, 0.2);
    cycles.complete(64);
    await run.result;

    expect(renderings(seen).map((p) => p.etaS)).toEqual([null, null, 8]);
  });

  test("a quick look that fails does not cost the photo", async () => {
    const { bench, engines: [cycles], desk } = setup();
    bench.quickLookFails = true;
    const run = desk.take(scene, "bracket");
    const seen = watch(run);
    await tick();
    cycles.pass(8, 0.1);
    cycles.complete(64);

    expect((await run.result).samples).toBe(64);
    expect(renderings(seen).every((p) => p.image === null)).toBe(true);
  });
});

describe("the file name", () => {
  test("is the part name and the local time to the minute", () => {
    expect(photoFileName("bracket", new Date(2026, 0, 5, 3, 7))).toBe("bracket_20260105-0307.png");
    expect(photoFileName("bracket", new Date(2026, 11, 31, 23, 59))).toBe("bracket_20261231-2359.png");
  });

  test("replaces characters file systems reject", () => {
    const at = new Date(2026, 0, 5, 3, 7);
    expect(photoFileName('a/b\\c:d*e?f"g<h>i|j', at)).toBe("a_b_c_d_e_f_g_h_i_j_20260105-0307.png");
    expect(photoFileName("tab\there", at)).toBe("tab_here_20260105-0307.png");
    expect(photoFileName("keeps spaces and ünïcode", at)).toBe("keeps spaces and ünïcode_20260105-0307.png");
  });

  test("never ends up empty, hidden, or ending in a dot", () => {
    const at = new Date(2026, 0, 5, 3, 7);
    expect(photoFileName("", at)).toBe("photo_20260105-0307.png");
    expect(photoFileName("...", at)).toBe("photo_20260105-0307.png");
    expect(photoFileName(".hidden. ", at)).toBe("hidden_20260105-0307.png");
  });

  test("uses the time of the press, not of the end of the render", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    bench.advance(3 * 60_000);
    cycles.complete(64);
    expect((await run.result).fileName).toBe("bracket_20261119-1405.png");
  });
});

describe("subscribers", () => {
  test("one added after progress has started gets the latest state at once", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(8, 0.4);
    const late: PhotoProgress[] = [];
    run.onProgress((p) => late.push(p));

    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ state: "rendering", fraction: 0.4 });
    bench.advance(600);
    cycles.complete(64);
    await run.result;
    expect(states(late)).toEqual(["rendering", "developing", "done"]);
  });

  test("one added after the end gets the final state", async () => {
    const { engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.complete(64);
    await run.result;
    const late: PhotoProgress[] = [];
    run.onProgress((p) => late.push(p));
    expect(late.map((p) => p.state)).toEqual(["done"]);
  });

  test("an unsubscribed listener hears nothing more", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    const heard: PhotoProgress[] = [];
    const off = run.onProgress((p) => heard.push(p));
    await tick();
    off();
    const count = heard.length;
    bench.advance(600);
    cycles.pass(8, 0.4);
    cycles.complete(64);
    await run.result;
    expect(heard).toHaveLength(count);
  });

  test("one that throws does not break the run or the other subscribers", async () => {
    const { engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    run.onProgress(() => {
      throw new Error("subscriber bug");
    });
    const seen = watch(run);
    await tick();
    cycles.pass(8, 0.4);
    cycles.complete(64);

    expect((await run.result).samples).toBe(64);
    expect(states(seen)).toEqual(["preparing", "rendering", "developing", "done"]);
  });
});

describe("image bitmaps", () => {
  test("a bitmap is closed when the next one replaces it, so one is open at a time", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    for (let i = 0; i < 3; i++) {
      cycles.pass(i + 1, (i + 1) / 4);
      bench.advance(600);
    }
    expect(bench.bitmaps).toHaveLength(3);
    expect(bench.bitmaps.map((b) => b.closed)).toEqual([true, true, false]);
    cycles.complete(64);
    await run.result;
  });

  test("none is left open once the run is done", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(8, 0.4);
    expect(bench.open).toBe(1);
    cycles.complete(64);
    await run.result;
    expect(bench.bitmaps).toHaveLength(1);
    expect(bench.open).toBe(0);
  });

  test("none is left open once the run has failed", async () => {
    const { bench, engines: [cycles], desk } = setup();
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(8, 0.4);
    cycles.crash("wasm trap");
    await run.result.catch(() => {});
    expect(bench.open).toBe(0);
  });

  test("the previous engine's last image is closed when the next engine starts", async () => {
    const { bench, engines: [cycles, raster], desk } = setup(["cycles", "raster"]);
    const run = desk.take(scene, "bracket");
    await tick();
    cycles.pass(8, 0.4);
    cycles.crash("wasm trap");
    await tick();
    expect(raster.renders).toBe(1);
    expect(bench.open).toBe(0);
    raster.complete(16);
    await run.result;
  });
});
