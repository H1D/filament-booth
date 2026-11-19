/**
 * photo-session.ts: what the photo card shows, as one state machine.
 *
 * A PhotoRun reports its own states. The session turns them into three
 * things the card needs: the run in flight (or how the last one ended), the
 * photos taken this session, and which of them is on show. The thumbnails
 * and their object URLs live here, so a finished photo has one owner that
 * revokes the URL when the photo is dropped.
 */
import type { Photo, PhotoProgress, PhotoRun } from "../photo/photo";
import { PhotoCancelled } from "../photo/photo";
import { Store } from "./store";

export type LiveProgress = Exclude<PhotoProgress, { state: "done" | "cancelled" | "failed" }>;

export type RunView =
  | { readonly phase: "idle" }
  | { readonly phase: "running"; readonly progress: LiveProgress }
  | { readonly phase: "cancelled" }
  | { readonly phase: "failed"; readonly message: string };

export interface Shot {
  readonly id: number;
  readonly photo: Photo;
  /** An object URL for the PNG, owned by the session. */
  readonly url: string;
}

export interface SessionState {
  readonly run: RunView;
  /** Oldest first. */
  readonly shots: readonly Shot[];
  /** The shot on show in the card, or null. */
  readonly shownId: number | null;
}

/** The thumbnails kept. A 2000 px PNG is a few MB, so the tray is bounded. */
export const MAX_SHOTS = 12;

export interface UrlApi {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserUrls: UrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => { URL.revokeObjectURL(url); },
};

export class PhotoSession {
  readonly state = new Store<SessionState>({ run: { phase: "idle" }, shots: [], shownId: null });
  readonly #start: () => PhotoRun;
  readonly #urls: UrlApi;
  #run: PhotoRun | null = null;
  #stopListening: (() => void) | null = null;
  #nextId = 1;

  constructor(start: () => PhotoRun, urls: UrlApi = browserUrls) {
    this.#start = start;
    this.#urls = urls;
  }

  get running(): boolean {
    return this.state.get().run.phase === "running";
  }

  /** Starts a photo. A failure to start (no part open) shows as a failed run. */
  take(): void {
    if (this.running) return;
    let run: PhotoRun;
    try {
      run = this.#start();
    } catch (e) {
      this.#setRun({ phase: "failed", message: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.#detach();
    this.#run = run;
    this.#setRun({ phase: "running", progress: { state: "preparing", message: "Starting" } });
    this.#stopListening = run.onProgress((p) => { this.#onProgress(run, p); });
    // The result promise also settles on cancel. Its outcome arrives through onProgress, so this only keeps a rejection from going unhandled.
    run.result.then(
      (photo) => { this.#onProgress(run, { state: "done", photo }); },
      (e: unknown) => {
        if (e instanceof PhotoCancelled) this.#onProgress(run, { state: "cancelled" });
        else this.#onProgress(run, { state: "failed", message: e instanceof Error ? e.message : String(e) });
      },
    );
  }

  cancel(): void { this.#run?.cancel(); }
  finishNow(): void { this.#run?.finishNow(); }

  show(id: number): void {
    const s = this.state.get();
    if (s.shots.some((shot) => shot.id === id)) this.state.set({ ...s, shownId: id });
  }

  /** Closes the card's current view. The thumbnails stay. */
  dismiss(): void {
    if (this.running) return;
    this.state.set({ ...this.state.get(), run: { phase: "idle" }, shownId: null });
  }

  dispose(): void {
    this.#run?.cancel();
    this.#detach();
    for (const shot of this.state.get().shots) this.#urls.revoke(shot.url);
    this.state.set({ run: { phase: "idle" }, shots: [], shownId: null });
  }

  #detach(): void {
    this.#stopListening?.();
    this.#stopListening = null;
    this.#run = null;
  }

  #setRun(run: RunView): void {
    this.state.set({ ...this.state.get(), run });
  }

  /** Events from a run that is no longer the current one are dropped, so a late "cancelled" cannot overwrite a newer photo. Terminal events are idempotent. */
  #onProgress(run: PhotoRun, p: PhotoProgress): void {
    if (run !== this.#run) return;
    switch (p.state) {
      case "done":
        this.#detach();
        this.#addShot(p.photo);
        return;
      case "cancelled":
        this.#detach();
        this.#setRun({ phase: "cancelled" });
        return;
      case "failed":
        this.#detach();
        this.#setRun({ phase: "failed", message: p.message });
        return;
      case "preparing":
      case "rendering":
      case "developing":
        this.#setRun({ phase: "running", progress: p });
        return;
    }
  }

  #addShot(photo: Photo): void {
    const s = this.state.get();
    const shot: Shot = { id: this.#nextId++, photo, url: this.#urls.create(photo.png) };
    const all = [...s.shots, shot];
    const dropped = all.splice(0, Math.max(0, all.length - MAX_SHOTS));
    for (const old of dropped) this.#urls.revoke(old.url);
    this.state.set({ run: { phase: "idle" }, shots: all, shownId: shot.id });
  }
}
