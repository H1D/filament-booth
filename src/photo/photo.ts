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
import type { RadianceFrame } from "../film";
import type { Scene } from "../scene";

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

export class PhotoDesk {
  /** Engines in order of preference. The default is Cycles, then raster. */
  constructor(engines: readonly PhotoEngine[]) {
    throw new Error("not implemented");
  }

  /** One photo at a time: a new take cancels the one in flight. */
  take(scene: Scene, partName: string): PhotoRun {
    throw new Error("not implemented");
    // TODO: cancel the current run. For each engine whose fits() is true: render.
    //       A failure that is not an abort moves on to the next engine.
    //       onPass -> at most 2 per second -> film.quickLook -> progress.
    //       film.develop -> Photo. File name `${partName}_${yyyymmdd-hhmm}.png`.
  }
}
