/**
 * photo-session.ts: what the photo card shows, as one state machine.
 *
 * A PhotoRun reports its own states. The session turns them into three
 * things the card needs: the run in flight (or how the last one ended), the
 * photos taken this session, and which of them is on show. The thumbnails
 * and their object URLs live here, so a finished photo has one owner that
 * revokes the URL when the photo is dropped.
 *
 * It also keeps the newest photo of each scene, for the download of every
 * scene at once, and runs a queue that photographs scenes one after another.
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
  /** The newest photo of each scene. Not bounded by MAX_SHOTS: it is what "download all" saves. */
  readonly byScene: ReadonlyMap<string, Photo>;
  /** Scenes waiting for their photo, in order, after the one rendering now. Empty with no queue. */
  readonly queued: readonly string[];
  /** The scene the running photo is of, or null. */
  readonly sceneId: string | null;
  /** How many scenes the queue in flight started with, or 0 with no queue. */
  readonly batchSize: number;
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

const EMPTY: SessionState = { run: { phase: "idle" }, shots: [], shownId: null, byScene: new Map(), queued: [], sceneId: null, batchSize: 0 };

export class PhotoSession {
  readonly state = new Store<SessionState>(EMPTY);
  readonly #start: (sceneId?: string) => PhotoRun;
  readonly #urls: UrlApi;
  readonly #activeScene: () => string | null;
  #run: PhotoRun | null = null;
  #stopListening: (() => void) | null = null;
  #nextId = 1;

  /**
   * `start` photographs a scene by id, or the one on show without one.
   * `activeScene` names the scene on show, so a plain take() is filed under it.
   */
  constructor(start: (sceneId?: string) => PhotoRun, urls: UrlApi = browserUrls, activeScene: () => string | null = () => null) {
    this.#start = start;
    this.#urls = urls;
    this.#activeScene = activeScene;
  }

  get running(): boolean {
    return this.state.get().run.phase === "running";
  }

  /**
   * Starts a photo and returns its run. Returns null when a photo is already
   * running, or when it could not start (no part open), which shows as a
   * failed run with the reason.
   */
  take(sceneId?: string): PhotoRun | null {
    if (this.running) return null;
    return this.#begin(sceneId);
  }

  /**
   * Photographs each scene in turn. A failed photo moves on to the next scene,
   * and cancel ends the whole queue. Does nothing while a photo is running.
   */
  takeAll(sceneIds: readonly string[]): void {
    if (this.running || sceneIds.length === 0) return;
    const [first, ...rest] = sceneIds;
    this.state.set({ ...this.state.get(), queued: rest, batchSize: sceneIds.length });
    this.#begin(first);
  }

  #begin(sceneId: string | undefined): PhotoRun | null {
    let run: PhotoRun;
    try {
      run = this.#start(sceneId);
    } catch (e) {
      this.state.set({ ...this.state.get(), run: { phase: "failed", message: e instanceof Error ? e.message : String(e) }, sceneId: null });
      this.#next();
      return null;
    }
    this.#detach();
    this.#run = run;
    this.state.set({ ...this.state.get(), run: { phase: "running", progress: { state: "preparing", message: "Starting" } }, sceneId: sceneId ?? this.#activeScene() });
    this.#stopListening = run.onProgress((p) => { this.#onProgress(run, p); });
    // The result promise also settles on cancel. Its outcome arrives through onProgress, so this only keeps a rejection from going unhandled.
    run.result.then(
      (photo) => { this.#onProgress(run, { state: "done", photo }); },
      (e: unknown) => {
        if (e instanceof PhotoCancelled) this.#onProgress(run, { state: "cancelled" });
        else this.#onProgress(run, { state: "failed", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return run;
  }

  /**
   * Keeps the newest photos only of these scenes, or of none: a removed scene
   * has nothing to download, and a new part makes every photo out of date.
   */
  keepScenePhotos(sceneIds: readonly string[]): void {
    const s = this.state.get();
    if ([...s.byScene.keys()].every((id) => sceneIds.includes(id))) return;
    this.state.set({ ...s, byScene: new Map([...s.byScene].filter(([id]) => sceneIds.includes(id))) });
  }

  /** Stops the photo in flight and drops the rest of the queue. */
  cancel(): void {
    if (this.state.get().queued.length > 0) this.state.set({ ...this.state.get(), queued: [] });
    this.#run?.cancel();
  }
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
    this.state.set(EMPTY);
  }

  /** Starts the next queued scene, once the photo before it has settled. */
  #next(): void {
    const [next, ...rest] = this.state.get().queued;
    if (next === undefined) {
      if (this.state.get().batchSize !== 0) this.state.set({ ...this.state.get(), batchSize: 0 });
      return;
    }
    this.state.set({ ...this.state.get(), queued: rest });
    this.#begin(next);
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
        this.#next();
        return;
      case "cancelled":
        this.#detach();
        this.state.set({ ...this.state.get(), run: { phase: "cancelled" }, queued: [], sceneId: null, batchSize: 0 });
        return;
      case "failed":
        this.#detach();
        this.state.set({ ...this.state.get(), run: { phase: "failed", message: p.message }, sceneId: null });
        this.#next();
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
    const byScene = s.sceneId === null ? s.byScene : new Map(s.byScene).set(s.sceneId, photo);
    this.state.set({ ...s, run: { phase: "idle" }, shots: all, shownId: shot.id, byScene, sceneId: null });
  }
}
