/**
 * photo.ts: PHOTO. Takes a Scene, returns a running PhotoRun.
 *
 * The engine is chosen here, privately: Cycles in WebAssembly when it fits
 * this machine and scene, the raster accumulator otherwise. A Cycles failure
 * that is not a cancel (a wasm trap, out of memory, a crashed worker) falls
 * through to the next engine. Callers never branch on the engine.
 *
 * A Scene is immutable, so edits made after the press cannot reach a run.
 */
import type { AgxLook } from "../document";
import { develop, loadAgx, quickLook, type AgxData, type RadianceFrame } from "../film";
import type { FilmSection, Scene } from "../scene";

export interface Photo {
  readonly png: Blob;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  /** A label for the status line. */
  readonly engine: "cycles" | "raster";
  readonly docRev: number;
}

export type PhotoProgress =
  | { readonly state: "preparing"; readonly message: string }
  /** fraction is by samples. It restarts from 0 if the desk falls back to another engine. */
  | { readonly state: "rendering"; readonly fraction: number; readonly image: ImageBitmap | null; readonly etaS: number | null }
  | { readonly state: "developing" }
  | { readonly state: "done"; readonly photo: Photo }
  | { readonly state: "cancelled" }
  | { readonly state: "failed"; readonly message: string };

export interface PhotoRun {
  readonly docRev: number;
  onProgress(fn: (p: PhotoProgress) => void): () => void;
  /** Rejects with PhotoCancelled after cancel(). */
  readonly result: Promise<Photo>;
  cancel(): void;
  /** Stop sampling and develop what is there. */
  finishNow(): void;
}
export class PhotoCancelled extends Error {}

/** The engine side of the desk. Callers of the desk never see this type. */
export interface PhotoEngine {
  readonly id: "cycles" | "raster";
  /** Can this engine render this scene here? Cheap, cached per machine. */
  fits(scene: Scene): Promise<true | { reason: string }>;
  /**
   * Progressive. `onPass` buffers are reused between calls. Aborting with
   * reason "finish" resolves with the frame so far. Any other abort rejects.
   */
  render(scene: Scene, onPass: (frame: RadianceFrame, fraction: number) => void, signal: AbortSignal): Promise<RadianceFrame>;
}

/**
 * The steps that need a browser (canvas, fetch) and the clock. The defaults are
 * film.ts and Date.now; tests pass fakes.
 */
export interface PhotoTools {
  readonly loadAgx: (look: AgxLook) => Promise<AgxData>;
  readonly quickLook: (frame: RadianceFrame, lut: AgxData, maxEdgePx: number) => ImageBitmap;
  readonly develop: (frame: RadianceFrame, film: FilmSection) => Promise<Blob>;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
}

const BROWSER_TOOLS: PhotoTools = { loadAgx: (look) => loadAgx(look), quickLook, develop, now: Date.now };

const QUICK_LOOK_INTERVAL_MS = 500;
const QUICK_LOOK_EDGE_PX = 512;

export class PhotoDesk {
  readonly #engines: readonly PhotoEngine[];
  readonly #tools: PhotoTools;
  #current: Run | null = null;

  /** Engines in order of preference. The default is Cycles, then raster. */
  constructor(engines: readonly PhotoEngine[], tools: PhotoTools = BROWSER_TOOLS) {
    this.#engines = [...engines];
    this.#tools = tools;
  }

  /**
   * One photo at a time: a new take cancels the one in flight, and its engine
   * is not started until the cancelled run's engine has stopped, so two runs
   * never share the renderer.
   */
  take(scene: Scene, partName: string): PhotoRun {
    const previous = this.#current;
    previous?.cancel();
    const run = new Run(this.#engines, this.#tools, scene, partName, previous?.finished ?? Promise.resolve());
    this.#current = run;
    return run;
  }
}

type Terminal = Extract<PhotoProgress, { state: "done" | "cancelled" | "failed" }>;
type Attempt = { readonly frame: RadianceFrame } | { readonly failure: string };

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `YYYYMMDD-HHMM` in local time, then the part name with characters that file
 * systems reject replaced by "_".
 */
export function photoFileName(partName: string, takenAt: Date): string {
  const unsafe = (ch: string) => '\\/:*?"<>|'.includes(ch) || ch.charCodeAt(0) < 32 || ch === "\u007f";
  const stem = Array.from(partName, (ch) => (unsafe(ch) ? "_" : ch)).join("").replace(/^\.+|[. ]+$/g, "");
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(takenAt.getFullYear()).padStart(4, "0")}${two(takenAt.getMonth() + 1)}${two(takenAt.getDate())}-${two(takenAt.getHours())}${two(takenAt.getMinutes())}`;
  return `${stem === "" ? "photo" : stem}_${stamp}.png`;
}

/**
 * One photo. Progress is a state machine whose last three states are final.
 * The bitmap in a `rendering` state belongs to the run: it is closed when a
 * later state replaces it, so a subscriber that wants to keep an image draws it
 * inside its callback or copies it.
 */
class Run implements PhotoRun {
  readonly docRev: number;
  readonly result: Promise<Photo>;
  /** Settles once no engine of this run is running. Never rejects. */
  readonly finished: Promise<void>;

  readonly #engines: readonly PhotoEngine[];
  readonly #tools: PhotoTools;
  readonly #scene: Scene;
  readonly #partName: string;
  readonly #takenAt: Date;
  readonly #abort = new AbortController();
  readonly #listeners = new Set<(p: PhotoProgress) => void>();
  #latest: PhotoProgress = { state: "preparing", message: "Getting ready" };
  #settled = false;
  #finishing = false;
  #hasPass = false;
  #resolve: (photo: Photo) => void = () => {};
  #reject: (error: Error) => void = () => {};

  constructor(engines: readonly PhotoEngine[], tools: PhotoTools, scene: Scene, partName: string, previous: Promise<void>) {
    this.#engines = engines;
    this.#tools = tools;
    this.#scene = scene;
    this.#partName = partName;
    this.#takenAt = new Date(tools.now());
    this.docRev = scene.docRev;
    this.result = new Promise<Photo>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    // The caller may only watch progress. A rejection nobody awaits must not surface as unhandled.
    this.result.catch(() => {});
    this.finished = this.#pipeline(previous);
  }

  onProgress(fn: (p: PhotoProgress) => void): () => void {
    this.#listeners.add(fn);
    this.#call(fn, this.#latest);
    return () => {
      this.#listeners.delete(fn);
    };
  }

  cancel(): void {
    if (this.#settled) return;
    this.#abort.abort("cancel");
    this.#end({ state: "cancelled" });
  }

  finishNow(): void {
    const state = this.#latest.state;
    if (this.#settled || this.#finishing || state === "developing") return;
    if (state !== "rendering" || !this.#hasPass) {
      this.cancel();
      return;
    }
    this.#finishing = true;
    this.#abort.abort("finish");
  }

  async #pipeline(previous: Promise<void>): Promise<void> {
    try {
      await previous;
      if (this.#settled) return;
      let lut: AgxData;
      try {
        lut = await this.#tools.loadAgx(this.#scene.film.look);
      } catch (error) {
        this.#end({ state: "failed", message: `Could not load the tone map: ${errorText(error)}` });
        return;
      }
      const tried: string[] = [];
      for (const engine of this.#engines) {
        if (this.#settled) return;
        const fit = await engine.fits(this.#scene).catch((error: unknown) => ({ reason: errorText(error) }));
        if (this.#settled) return;
        if (fit !== true) {
          tried.push(`${engine.id} does not fit (${fit.reason})`);
          this.#publish({ state: "preparing", message: `Skipped ${engine.id}: ${fit.reason}` });
          continue;
        }
        const attempt = await this.#render(engine, lut);
        if (this.#settled) return;
        if ("frame" in attempt) {
          await this.#develop(engine, attempt.frame);
          return;
        }
        tried.push(`${engine.id} failed (${attempt.failure})`);
        // The user asked to stop sampling. Starting another engine from zero is the opposite.
        if (this.#finishing) break;
        this.#publish({ state: "preparing", message: `${engine.id} failed: ${attempt.failure}` });
      }
      this.#end({ state: "failed", message: tried.length === 0 ? "No photo engine is available." : `Could not take the photo. ${tried.join("; ")}.` });
    } catch (error) {
      this.#end({ state: "failed", message: `The photo failed: ${errorText(error)}` });
    }
  }

  async #render(engine: PhotoEngine, lut: AgxData): Promise<Attempt> {
    let live = true;
    let first: { readonly at: number; readonly fraction: number } | null = null;
    let lastLookAt = -Infinity;
    this.#hasPass = false;
    this.#publish({ state: "rendering", fraction: 0, image: null, etaS: null });

    const onPass = (frame: RadianceFrame, fraction: number) => {
      if (!live || this.#settled) return;
      this.#hasPass = true;
      const at = this.#tools.now();
      first ??= { at, fraction };
      if (at - lastLookAt < QUICK_LOOK_INTERVAL_MS) return;
      lastLookAt = at;
      const shown = this.#latest;
      let image = shown.state === "rendering" ? shown.image : null;
      try {
        image = this.#tools.quickLook(frame, lut, QUICK_LOOK_EDGE_PX);
      } catch (error) {
        // A missing preview must not cost the photo.
        console.error("quick look failed", error);
      }
      const etaS =
        fraction > first.fraction && at > first.at
          ? (((at - first.at) / 1000) * Math.max(0, 1 - fraction)) / (fraction - first.fraction)
          : null;
      this.#publish({ state: "rendering", fraction, image, etaS });
    };

    try {
      return { frame: await engine.render(this.#scene, onPass, this.#abort.signal) };
    } catch (error) {
      return { failure: errorText(error) };
    } finally {
      live = false;
    }
  }

  async #develop(engine: PhotoEngine, frame: RadianceFrame): Promise<void> {
    this.#publish({ state: "developing" });
    let png: Blob;
    try {
      png = await this.#tools.develop(frame, this.#scene.film);
    } catch (error) {
      this.#end({ state: "failed", message: `Could not develop the photo: ${errorText(error)}` });
      return;
    }
    this.#end({
      state: "done",
      photo: {
        png,
        fileName: photoFileName(this.#partName, this.#takenAt),
        width: frame.width,
        height: frame.height,
        samples: frame.samples,
        engine: engine.id,
        docRev: this.#scene.docRev,
      },
    });
  }

  /** Ignored once the run has ended, so late work from an engine cannot reopen it. */
  #publish(next: PhotoProgress): void {
    if (this.#settled) return;
    this.#deliver(next);
  }

  #end(final: Terminal): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#deliver(final);
    if (final.state === "done") this.#resolve(final.photo);
    else this.#reject(final.state === "cancelled" ? new PhotoCancelled("The photo was cancelled") : new Error(final.message));
  }

  #deliver(next: PhotoProgress): void {
    const before = this.#latest;
    this.#latest = next;
    for (const fn of [...this.#listeners]) this.#call(fn, next);
    if (before.state === "rendering" && before.image !== null && !(next.state === "rendering" && next.image === before.image)) {
      before.image.close();
    }
  }

  #call(fn: (p: PhotoProgress) => void, progress: PhotoProgress): void {
    try {
      fn(progress);
    } catch (error) {
      console.error("photo progress subscriber threw", error);
    }
  }
}
