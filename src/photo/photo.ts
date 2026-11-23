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
import type { AgxLook, FilmOptics } from "../document";
import { develop, loadAgx, quickLook, type AgxData, type RadianceFrame } from "../film";
import type { FilmSection, Scene } from "../scene";
import { setTimer, type Schedule } from "../schedule";
import { denoise } from "./denoise";

/** What ended sampling. A photo that ran to its target says so too. */
export type StoppedBy =
  | { readonly kind: "samples" }
  /** limitS is the limit the photo was taken under, so the card still says it after the setting changes. */
  | { readonly kind: "time-limit"; readonly limitS: number }
  | { readonly kind: "user" };

/** Whether the developed frame went through the denoiser, and why not when it was asked to. */
export type Denoising =
  | { readonly kind: "denoised" }
  | { readonly kind: "off" }
  | { readonly kind: "failed"; readonly reason: string };

export interface Photo {
  readonly png: Blob;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  /** Samples the developed frame holds. */
  readonly samples: number;
  /** Samples the photo was asked for. `samples` is lower when sampling stopped early. */
  readonly targetSamples: number;
  readonly stoppedBy: StoppedBy;
  readonly denoising: Denoising;
  /** A label for the status line. */
  readonly engine: "cycles" | "raster";
  readonly docRev: number;
}

export type PhotoProgress =
  | { readonly state: "preparing"; readonly message: string }
  /**
   * fraction is the larger of the share of samples taken and the share of the
   * time limit used, so the bar is full when either stop is reached. etaS is the
   * smaller of the sample estimate and the time left on the limit. The sample
   * share restarts from 0 if the desk falls back to another engine. The time
   * share does not, because the limit is for the whole photo.
   */
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
  /** Can this engine render this scene here? The machine check is cached; Cycles also waits for
   *  the part's hidden faces when a load has only just sent the mesh (about 2 s). */
  fits(scene: Scene): Promise<true | { reason: string }>;
  /**
   * Progressive. `onPass` buffers are reused between calls. Aborting with
   * reason "finish" resolves with the frame so far. Any other abort rejects.
   */
  render(scene: Scene, onPass: (frame: RadianceFrame, fraction: number) => void, signal: AbortSignal): Promise<RadianceFrame>;
}

/**
 * The steps that need a browser (canvas, fetch, WebGPU) and the clocks. The
 * defaults are film.ts, denoise.ts, Date.now and setTimeout; tests pass fakes.
 */
export interface PhotoTools {
  readonly loadAgx: (look: AgxLook) => Promise<AgxData>;
  readonly quickLook: (frame: RadianceFrame, lut: AgxData, maxEdgePx: number, optics?: FilmOptics) => ImageBitmap;
  /** The frame with its colour denoised. Rejects when it cannot be. */
  readonly denoise: (frame: RadianceFrame) => Promise<RadianceFrame>;
  readonly develop: (frame: RadianceFrame, film: FilmSection) => Promise<Blob>;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
  /** Arms the photo time limit. */
  readonly schedule: Schedule;
}

const BROWSER_TOOLS: PhotoTools = {
  loadAgx: (look) => loadAgx(look), quickLook, denoise: async (frame) => (await denoise(frame)).frame, develop, now: Date.now, schedule: setTimer,
};

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
  /** Why sampling was stopped early, set when the abort with reason "finish" is sent. */
  #stopReason: "user" | "time-limit" | null = null;
  /**
   * The time limit's clock. It starts once, when the first engine starts, so
   * scene upload and the BVH build count. A fallback engine inherits what is
   * left of it, because the limit caps the whole photo. If it already ran out,
   * the fallback engine stops after its first pass.
   */
  #clockStartedAt: number | null = null;
  #limitReached = false;
  #disarmClock: (() => void) | null = null;
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
    if (this.#settled || this.#finishing || this.#latest.state === "developing") return;
    if (!this.#stopSampling("user")) this.cancel();
  }

  /** False when there is nothing to develop yet. */
  #stopSampling(reason: "user" | "time-limit"): boolean {
    if (this.#settled || this.#finishing || this.#latest.state !== "rendering" || !this.#hasPass) return false;
    this.#finishing = true;
    this.#stopReason = reason;
    this.#abort.abort("finish");
    return true;
  }

  #startClock(): void {
    const { timeLimitS } = this.#scene.film;
    if (timeLimitS <= 0 || this.#clockStartedAt !== null) return;
    this.#clockStartedAt = this.#tools.now();
    this.#disarmClock = this.#tools.schedule(() => {
      this.#disarmClock = null;
      this.#limitReached = true;
      // With no pass yet there is nothing to develop. The first pass to arrive stops the run.
      this.#stopSampling("time-limit");
    }, timeLimitS * 1000);
  }

  #stopClock(): void {
    this.#disarmClock?.();
    this.#disarmClock = null;
  }

  /** How much of the time limit is used and how many seconds are left, or null with no limit. */
  #limitShare(): { readonly fraction: number; readonly leftS: number } | null {
    if (this.#clockStartedAt === null) return null;
    const limitMs = this.#scene.film.timeLimitS * 1000;
    const usedMs = Math.max(0, this.#tools.now() - this.#clockStartedAt);
    return { fraction: Math.min(1, usedMs / limitMs), leftS: Math.max(0, limitMs - usedMs) / 1000 };
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
    this.#startClock();
    const share = this.#limitShare();
    this.#publish({ state: "rendering", fraction: share?.fraction ?? 0, image: null, etaS: share?.leftS ?? null });

    const onPass = (frame: RadianceFrame, fraction: number) => {
      if (!live || this.#settled) return;
      this.#hasPass = true;
      if (this.#limitReached && this.#stopSampling("time-limit")) return;
      const at = this.#tools.now();
      first ??= { at, fraction };
      if (at - lastLookAt < QUICK_LOOK_INTERVAL_MS) return;
      lastLookAt = at;
      const shown = this.#latest;
      let image = shown.state === "rendering" ? shown.image : null;
      try {
        image = this.#tools.quickLook(frame, lut, QUICK_LOOK_EDGE_PX, this.#scene.film.optics);
      } catch (error) {
        // A missing preview must not cost the photo.
        console.error("quick look failed", error);
      }
      const sampleEtaS =
        fraction > first.fraction && at > first.at
          ? (((at - first.at) / 1000) * Math.max(0, 1 - fraction)) / (fraction - first.fraction)
          : null;
      const share = this.#limitShare();
      this.#publish({
        state: "rendering",
        fraction: share === null ? fraction : Math.max(fraction, share.fraction),
        image,
        etaS: share === null ? sampleEtaS : Math.min(sampleEtaS ?? Infinity, share.leftS),
      });
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
    this.#stopClock();
    this.#publish({ state: "developing" });
    const { frame: developing, denoising } = await this.#denoise(frame);
    if (this.#settled) return;
    let png: Blob;
    try {
      png = await this.#tools.develop(developing, this.#scene.film);
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
        targetSamples: this.#scene.film.samples,
        stoppedBy: this.#stoppedBy(frame),
        denoising,
        engine: engine.id,
        docRev: this.#scene.docRev,
      },
    });
  }

  /** A denoiser failure costs the denoising, not the photo: the noisy frame is developed instead. */
  async #denoise(frame: RadianceFrame): Promise<{ frame: RadianceFrame; denoising: Denoising }> {
    if (!this.#scene.film.denoise) return { frame, denoising: { kind: "off" } };
    if (!frame.albedo || !frame.normal) return { frame, denoising: { kind: "failed", reason: "this engine gives no albedo and normal guides" } };
    try {
      return { frame: await this.#tools.denoise(frame), denoising: { kind: "denoised" } };
    } catch (error) {
      console.error("denoise failed", error);
      return { frame, denoising: { kind: "failed", reason: errorText(error) } };
    }
  }

  #stoppedBy(frame: RadianceFrame): StoppedBy {
    // A stop that arrived after the last sample changed nothing.
    if (this.#stopReason === null || frame.samples >= this.#scene.film.samples) return { kind: "samples" };
    return this.#stopReason === "user" ? { kind: "user" } : { kind: "time-limit", limitS: this.#scene.film.timeLimitS };
  }

  /** Ignored once the run has ended, so late work from an engine cannot reopen it. */
  #publish(next: PhotoProgress): void {
    if (this.#settled) return;
    this.#deliver(next);
  }

  #end(final: Terminal): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#stopClock();
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
