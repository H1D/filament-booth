/**
 * booth.ts: Booth owns the document and the print slot. It is the only
 * write path for either.
 *
 * After any change it compiles a new Scene and hands it to subscribers.
 * React panels and the viewport are subscribers. Persistence is one too.
 */
import {
  DEFAULT_GLOSS, DocumentError, defaultDocument, parseDocument,
  type BoothDocument, type SliceSettings,
} from "./document";
import type { PhotoRun } from "./photo/photo";
import { FILAMENT_PRESETS, LOOK_PRESETS } from "./presets";
import type { LoadedPrint, PrintSource, PrintState } from "./print";
import { setTimer, type Schedule } from "./schedule";
import { compileScene, framePart, type Scene } from "./scene";

/**
 * The part of PrintPipeline that Booth uses. The real pipeline satisfies it
 * structurally, and tests pass a fake that needs no worker.
 */
export interface PrintPort {
  open(src: PrintSource, settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint>;
  reslice(settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint>;
  dispose(): void;
}

export interface BoothDeps {
  /** Where the document is saved. Tests pass a Map-backed stub. */
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  readonly print: PrintPort;
  /** Starts a photo for a scene. main.tsx wires PhotoDesk in here. */
  readonly takePhoto: (scene: Scene, partName: string) => PhotoRun;
  /** The debounce clock for re-slicing and saving. Defaults to setTimeout. */
  readonly schedule?: Schedule;
}

export const STORAGE_KEY = "booth.document";
const RESLICE_QUIET_MS = 300;
const SAVE_QUIET_MS = 500;

type StlSource = Extract<PrintSource, { kind: "stl" }>;

export class Booth {
  readonly #deps: BoothDeps;
  readonly #schedule: Schedule;
  #doc: BoothDocument;
  #print: PrintState = { status: "empty" };
  /** The part the scene is built from. It outlives a re-slice and an error: the last good part stays on show. */
  #shown: LoadedPrint | null = null;
  #scene: Scene;
  #rev = 0;
  readonly #listeners = new Set<() => void>();
  /** Counts every open and re-slice. A result whose job number is no longer the latest is dropped. */
  #job = 0;
  /** The STL the pipeline holds and can re-slice. Null for G-code and while an open is in flight or has failed. */
  #stl: StlSource | null = null;
  #cancelReslice: (() => void) | null = null;
  /** Set while a save is pending. */
  #cancelSave: (() => void) | null = null;
  /** Opens and re-slices that have not settled yet. */
  #working = 0;
  readonly #idleWaiters = new Set<() => void>();

  constructor(deps: BoothDeps) {
    this.#deps = deps;
    this.#schedule = deps.schedule ?? setTimer;
    this.#doc = freezeDeep(restore(deps.storage));
    this.#scene = compileScene(this.#doc, null, this.#rev);
  }

  get doc(): Readonly<BoothDocument> { return this.#doc; }
  get print(): PrintState { return this.#print; }
  get scene(): Scene { return this.#scene; }

  /** The name of the part on show, without its print extension, or null with no part. */
  get partName(): string | null {
    return this.#shown === null ? null : partNameOf(this.#shown.source);
  }

  /**
   * Resolves with the print state once no open or re-slice is pending or
   * running, the 300 ms re-slice debounce and the job it starts included. A
   * photo waits for it, so a slicing edit made just before is in the picture.
   */
  whenIdle(): Promise<PrintState> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.#working > 0 || this.#cancelReslice !== null || this.#print.status === "loading") return;
        this.#idleWaiters.delete(check);
        resolve(this.#print);
      };
      this.#idleWaiters.add(check);
      check();
    });
  }

  /**
   * The scene the document would compile to after `mutate`, without
   * committing it: nothing is saved, notified or re-sliced. An invalid result
   * throws a DocumentError as update does.
   */
  sceneWith(mutate: (draft: BoothDocument) => void): Scene {
    return compileScene(this.#revise(mutate), this.#shown, this.#rev, this.#scene);
  }

  /**
   * Fires after any document or print change, with the scene already
   * recompiled. An arrow field, so `useSyncExternalStore(booth.subscribe, ...)`
   * works without binding.
   */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  };

  /** Derived, never stored: the studio differs from the look it was copied from. */
  get lookModified(): boolean {
    const { lookBase, studio } = this.#doc;
    return lookBase !== null && !same(studio, LOOK_PRESETS[lookBase].studio);
  }

  /** Derived, never stored: the recipe or gloss differs from the preset it was copied from. */
  get filamentModified(): boolean {
    const { presetId, recipe, gloss } = this.#doc.filament;
    return presetId !== null && !(gloss === DEFAULT_GLOSS && same(recipe, FILAMENT_PRESETS[presetId].recipe));
  }

  /**
   * The one write path for settings. The mutator edits a draft: a panel's
   * own leaf change, or a named edit from edits.ts. Booth
   * validates ranges, keeps untouched sections identical by reference,
   * bumps its revision, recompiles and notifies. A change under
   * `draft.slicing` re-slices an STL after 300 ms.
   *
   * An invalid result throws a DocumentError naming the field, and the
   * document stays as it was.
   */
  update(mutate: (draft: BoothDocument) => void): void {
    const before = this.#doc;
    const after = this.#revise(mutate);
    if (after === before) return;
    this.#commit({ doc: after });
    if (after.slicing !== before.slicing) this.#scheduleReslice();
  }

  /**
   * Opens a dropped .stl, .gcode or .gcode.3mf. A second call supersedes the
   * first, and a late result from the old file is dropped. A fresh part is
   * framed once and its focus point is cleared.
   */
  open(file: File): Promise<void> {
    return this.#work(this.#open(file));
  }

  async #open(file: File): Promise<void> {
    const job = this.#supersede();
    let source: PrintSource;
    try {
      source = await sourceOf(file);
    } catch (e) {
      if (job === this.#job) this.#fail(e);
      return;
    }
    if (job !== this.#job) return;
    await this.#load(job, source);
  }

  openSample(url: string): Promise<void> {
    const job = this.#supersede();
    return this.#work(this.#load(job, { kind: "bin", url }));
  }

  /** Freezes the current scene into a photo run. */
  takePhoto(): PhotoRun {
    if (this.#shown === null) throw new Error("Open a part before taking a photo");
    return this.#deps.takePhoto(this.#scene, partNameOf(this.#shown.source));
  }

  exportJson(): string {
    return JSON.stringify(this.#doc, null, 2);
  }

  /** Validates at the boundary, then replaces the document as one update. */
  importJson(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new DocumentError("document", "not valid JSON");
    }
    const imported = parseDocument(parsed);
    this.update((draft) => { Object.assign(draft, imported); });
  }

  /** Writes a pending save now. The page calls it when it is hidden, tests call it instead of waiting. */
  flush(): void {
    if (this.#cancelSave === null) return;
    this.#cancelSave();
    this.#cancelSave = null;
    this.#write();
  }

  /** Saves, stops the timers, drops anything in flight and releases the pipeline. */
  dispose(): void {
    this.flush();
    this.#cancelPendingReslice();
    this.#job += 1;
    this.#listeners.clear();
    this.#deps.print.dispose();
  }

  // ---- document ----------------------------------------------------------------

  /** Runs the mutator on a copy and returns the validated result, the current document itself when nothing changed. */
  #revise(mutate: (draft: BoothDocument) => void): BoothDocument {
    const draft = structuredClone(this.#doc);
    mutate(draft);
    return reuseUnchanged(this.#doc, parseDocument(draft));
  }

  /** The one place state changes: scene first, so a throwing compile leaves everything as it was. */
  #commit(next: { doc?: BoothDocument; print?: PrintState; shown?: LoadedPrint | null }): void {
    const doc = next.doc ?? this.#doc;
    const print = next.print ?? this.#print;
    const shown = next.shown === undefined ? this.#shown : next.shown;
    const sceneChanged = doc !== this.#doc || shown !== this.#shown;
    if (!sceneChanged && print === this.#print) return;

    if (sceneChanged) {
      this.#scene = compileScene(doc, shown, this.#rev + 1, this.#scene);
      this.#rev += 1;
    }
    const docChanged = doc !== this.#doc;
    this.#doc = doc;
    this.#print = print;
    this.#shown = shown;
    if (docChanged) this.#scheduleSave();
    this.#notify();
  }

  #notify(): void {
    for (const fn of [...this.#listeners]) {
      try {
        fn();
      } catch (e) {
        // One bad subscriber must not starve the others or fail the edit that already landed.
        queueMicrotask(() => { throw e; });
      }
    }
  }

  // ---- print -------------------------------------------------------------------

  /** Counts print work while it runs, so whenIdle knows when none is left. */
  async #work(job: Promise<void>): Promise<void> {
    this.#working += 1;
    try {
      await job;
    } finally {
      this.#working -= 1;
      for (const check of [...this.#idleWaiters]) check();
    }
  }

  /** Starts a new job number, so everything still in flight from before is stale. */
  #supersede(): number {
    this.#cancelPendingReslice();
    return ++this.#job;
  }

  async #load(job: number, source: PrintSource): Promise<void> {
    const settings = this.#doc.slicing;
    this.#stl = null;
    this.#commit({ print: { status: "loading", stage: "reading", source } });
    let loaded: LoadedPrint;
    try {
      loaded = await this.#deps.print.open(source, settings, (stage) => this.#stage(job, stage, source));
    } catch (e) {
      if (job === this.#job) this.#fail(e);
      return;
    }
    if (job !== this.#job) return;
    try {
      // The part and its framing land in one commit, so no subscriber sees the new part through the old camera.
      const doc = this.#revise((draft) => {
        Object.assign(draft.camera, framePart(loaded.mesh, draft.camera, draft.output.aspect));
        draft.camera.focusPartPoint = null;
      });
      this.#stl = source.kind === "stl" ? source : null;
      this.#commit({ doc, shown: loaded, print: { status: "ready", loaded } });
    } catch (e) {
      this.#fail(e);
      return;
    }
    if (source.kind === "stl") this.#resliceIfStale(settings);
  }

  #stage(job: number, stage: string, source: PrintSource): void {
    if (job !== this.#job) return;
    const now = this.#print;
    if (now.status === "loading" && now.stage === stage) return;
    this.#commit({ print: { status: "loading", stage, source } });
  }

  #fail(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.#commit({ print: { status: "error", message, loaded: this.#shown } });
  }

  #scheduleReslice(): void {
    this.#cancelPendingReslice();
    this.#cancelReslice = this.#schedule(() => {
      this.#cancelReslice = null;
      void this.#work(this.#reslice());
    }, RESLICE_QUIET_MS);
  }

  #cancelPendingReslice(): void {
    this.#cancelReslice?.();
    this.#cancelReslice = null;
  }

  /** The old mesh stays in the scene while this runs. A re-slice keeps the camera: only an open frames. */
  async #reslice(): Promise<void> {
    const stl = this.#stl;
    if (stl === null) return;
    const job = ++this.#job;
    const settings = this.#doc.slicing;
    this.#commit({ print: { status: "loading", stage: "slicing", source: stl } });
    try {
      const loaded = await this.#deps.print.reslice(settings, (stage) => this.#stage(job, stage, stl));
      if (job !== this.#job) return;
      this.#commit({ shown: loaded, print: { status: "ready", loaded } });
    } catch (e) {
      if (job === this.#job) this.#fail(e);
      return;
    }
    this.#resliceIfStale(settings);
  }

  /** Slicing was edited while a job ran with the older values: run again with the current ones. */
  #resliceIfStale(usedByJob: SliceSettings): void {
    if (!same(usedByJob, this.#doc.slicing)) void this.#work(this.#reslice());
  }

  // ---- persistence -------------------------------------------------------------

  #scheduleSave(): void {
    if (this.#cancelSave !== null) return;
    this.#cancelSave = this.#schedule(() => {
      this.#cancelSave = null;
      this.#write();
    }, SAVE_QUIET_MS);
  }

  #write(): void {
    try {
      this.#deps.storage.setItem(STORAGE_KEY, JSON.stringify(this.#doc));
    } catch {
      // Quota or a blocked store. The session carries on and the next change tries again.
    }
  }
}

// ---- helpers -----------------------------------------------------------------

/** Missing, unreadable or invalid storage all mean a fresh document: a stale save must never keep the app from opening. */
function restore(storage: BoothDeps["storage"]): BoothDocument {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? defaultDocument() : parseDocument(JSON.parse(raw));
  } catch {
    return defaultDocument();
  }
}

/** Deep equality for plain JSON data. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(Reflect.get(a, k), Reflect.get(b, k)));
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

/**
 * Each section of `next` is replaced by the one in `prev` when they are equal,
 * so a panel that watches `doc.camera` re-renders only when the camera changed.
 * Returns `prev` itself when nothing changed.
 */
function reuseUnchanged(prev: BoothDocument, next: BoothDocument): BoothDocument {
  const keep = <T>(old: T, fresh: T): T => (same(old, fresh) ? old : fresh);
  const merged: BoothDocument = {
    version: prev.version,
    slicing: keep(prev.slicing, next.slicing),
    filament: keep(prev.filament, next.filament),
    studio: keep(prev.studio, next.studio),
    lookBase: next.lookBase,
    camera: keep(prev.camera, next.camera),
    pose: keep(prev.pose, next.pose),
    output: keep(prev.output, next.output),
  };
  const unchanged = merged.slicing === prev.slicing && merged.filament === prev.filament && merged.studio === prev.studio
    && merged.lookBase === prev.lookBase && merged.camera === prev.camera && merged.pose === prev.pose && merged.output === prev.output;
  return unchanged ? prev : freezeDeep(merged);
}

// ---- files -------------------------------------------------------------------

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const HEAD_BYTES = 512;
const BINARY_STL_HEADER = 84;
const BINARY_STL_TRIANGLE = 50;

/** Names the file's kind from its extension, then checks the bytes agree. Throws a message fit to show the user. */
async function sourceOf(file: File): Promise<PrintSource> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const name = file.name.toLowerCase();
  const zip = ZIP_MAGIC.every((byte, i) => head[i] === byte);
  let kind: "stl" | "gcode";
  if (name.endsWith(".3mf")) {
    if (!zip) throw new Error(`${file.name} is not a 3MF file (it is not a zip archive)`);
    kind = "gcode";
  } else if (name.endsWith(".gcode")) {
    if (!zip && head.includes(0)) throw new Error(`${file.name} is not G-code (it holds binary data)`);
    kind = "gcode";
  } else if (name.endsWith(".stl")) {
    if (zip || !looksLikeStl(head, file.size)) throw new Error(`${file.name} is not an STL file`);
    kind = "stl";
  } else {
    throw new Error(`${file.name}: drop an .stl, .gcode or .gcode.3mf file`);
  }
  return { kind, file, fileHash: await sha256Hex(file) };
}

/** ASCII STL starts with "solid". Binary STL is an 84 byte header and 50 bytes a triangle, and a header may start with "solid" too, so the size is the check. */
function looksLikeStl(head: Uint8Array, size: number): boolean {
  const text = new TextDecoder().decode(head.subarray(0, 64)).replace(/^﻿/, "").trimStart();
  if (text.startsWith("solid")) return true;
  if (head.length < BINARY_STL_HEADER) return false;
  const triangles = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(80, true);
  return size === BINARY_STL_HEADER + BINARY_STL_TRIANGLE * triangles;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The photo's file name stem: the file or sample name without its print extension. */
function partNameOf(source: PrintSource): string {
  const raw = source.kind === "bin" ? (source.url.split(/[?#]/)[0].split("/").pop() ?? "") : source.file.name;
  return raw.replace(/\.(gcode\.3mf|3mf|gcode|stl|bin)$/i, "") || "part";
}
