/**
 * The agent tests' booth: a real Booth over a print port that slices at once,
 * photo runs the test finishes by hand, and files in memory instead of the
 * bridge. agent-host.test.ts sends requests as bpy.py would; agent-python.test.ts
 * runs real Python against the same rig.
 */
import { AgentHost, type HostPorts, type JobIo } from "../src/agent/host";
import type { ImageMeta } from "../src/agent/protocol";
import { Booth, type PrintPort } from "../src/booth";
import type { SliceSettings } from "../src/document";
import { PhotoCancelled, type Photo, type PhotoProgress, type PhotoRun } from "../src/photo/photo";
import type { BeadMesh, LoadedPrint, PrintSource, SlicedPrint } from "../src/print";
import type { Scene } from "../src/scene";
import { PhotoSession } from "../src/ui/photo-session";

function meshOfHeight(heightM: number): BeadMesh {
  return {
    position: new Float32Array(300), normal: new Int16Array(300), tangent: new Int16Array(300),
    word: new Float32Array(100), index: new Uint32Array(60), tris: 20, layerCount: 100, layerHeightM: 2e-4, vRefMmS: 100,
    bboxM: { min: [-0.03, -0.02, 0], max: [0.03, 0.02, heightM] },
  };
}

function loaded(source: PrintSource, settings: SliceSettings): LoadedPrint {
  const mesh = meshOfHeight(0.1);
  const sliced: SlicedPrint = {
    settings, settingsSource: "booth", layerHeightMm: settings.layerHeight,
    layerTimeS: new Float32Array(101).fill(6), layerFan: new Float32Array(101).fill(0.5),
    filamentName: null, bedFromFile: null, note: null,
  };
  return { source, sliced, mesh, liteMesh: async () => mesh };
}

/** Slices on the next tick, so an open is awaitable but never stuck. */
export class InstantPrint implements PrintPort {
  readonly slices: SliceSettings[] = [];
  #source: PrintSource | null = null;

  async open(src: PrintSource, settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    this.#source = src;
    onStage("slicing");
    await Promise.resolve();
    this.slices.push(settings);
    return loaded(src, settings);
  }

  async reslice(settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    if (this.#source === null) throw new Error("nothing to re-slice");
    onStage("slicing");
    await Promise.resolve();
    this.slices.push(settings);
    return loaded(this.#source, settings);
  }

  dispose(): void {}
}

/** A photo run that ends when the test says so. */
export class ControlledRun implements PhotoRun {
  readonly docRev: number;
  readonly result: Promise<Photo>;
  readonly scene: Scene;
  readonly partName: string;
  cancelled = false;
  readonly #listeners = new Set<(p: PhotoProgress) => void>();
  #resolve: (photo: Photo) => void = () => {};
  #reject: (e: Error) => void = () => {};
  #over = false;

  constructor(scene: Scene, partName: string) {
    this.scene = scene;
    this.partName = partName;
    this.docRev = scene.docRev;
    this.result = new Promise<Photo>((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    this.result.catch(() => {});
  }

  onProgress(fn: (p: PhotoProgress) => void): () => void {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  }

  emit(p: PhotoProgress): void {
    for (const fn of [...this.#listeners]) fn(p);
  }

  finish(over: Partial<Photo> = {}): Photo {
    const film = this.scene.film;
    const photo: Photo = {
      png: new Blob(["a png"]), fileName: `${this.partName}_20261119-2200.png`, width: film.width, height: film.height,
      samples: film.samples, targetSamples: film.samples, stoppedBy: { kind: "samples" }, engine: "cycles", docRev: this.docRev, ...over,
    };
    this.#over = true;
    this.emit({ state: "done", photo });
    this.#resolve(photo);
    return photo;
  }

  cancel(): void {
    if (this.#over) return;
    this.#over = true;
    this.cancelled = true;
    this.emit({ state: "cancelled" });
    this.#reject(new PhotoCancelled("The photo was cancelled"));
  }

  finishNow(): void {}
}

export function binaryStl(name = "bracket.stl"): File {
  const bytes = new Uint8Array(84 + 50);
  new DataView(bytes.buffer).setUint32(80, 1, true);
  return new File([bytes], name);
}

export interface IoLog {
  readonly prints: string[];
  readonly progress: string[];
  readonly images: { readonly meta: ImageMeta; readonly thumbnail: Blob }[];
  /** Absolute paths written, by the rule JobIo.write documents. */
  readonly written: Map<string, Blob>;
}

/** JobIo over files in memory. The agent's folder is /agent; `//` and relative paths start there. */
export function memoryIo(files: Readonly<Record<string, Blob>> = {}): { io: JobIo; log: IoLog; cancel: () => void } {
  const controller = new AbortController();
  const log: IoLog = { prints: [], progress: [], images: [], written: new Map() };
  const absolute = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? path : `/agent/${path.replace(/^(\/\/|\.\/)/, "")}`);
  const io: JobIo = {
    signal: controller.signal,
    print: (text) => { log.prints.push(text); },
    progress: (text) => { log.progress.push(text); },
    read: async (path) => {
      const blob = files[absolute(path)];
      if (blob === undefined) throw new Error(`no such file: ${absolute(path)}`);
      return new File([blob], absolute(path).split("/").pop() ?? path);
    },
    write: async (path, name, bytes) => {
      const target = /\.png$/i.test(path) ? absolute(path) : `${absolute(path).replace(/\/?$/, "/")}${name}`;
      log.written.set(target, bytes);
      return target;
    },
    image: (meta, thumbnail) => { log.images.push({ meta, thumbnail }); },
  };
  return { io, log, cancel: () => { controller.abort("agent"); } };
}

export function hostRig(raster: HostPorts["raster"] = null) {
  const store = new Map<string, string>();
  const runs: ControlledRun[] = [];
  const print = new InstantPrint();
  const booth = new Booth({
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    print,
    takePhoto: (scene, name) => { const run = new ControlledRun(scene, name); runs.push(run); return run; },
  });
  const photos = new PhotoSession(() => booth.takePhoto(), { create: () => "blob:photo", revoke: () => {} });
  const host = new AgentHost({
    booth, photos, raster,
    develop: async (frame) => new Blob([`png ${frame.width}x${frame.height}`]),
    thumbnail: async (_, edge) => ({ blob: new Blob(["jpeg"]), width: edge, height: edge }),
  });
  return { booth, photos, runs, print, host };
}

export type Reply = { readonly ok: unknown } | { readonly error: { readonly type: string; readonly message: string } };

/** Sends requests as bpy.py does. `send` is for calls that answer at once, `sendAsync` for blocking operators. */
export function wire(host: AgentHost, io: JobIo | null) {
  return {
    send(...request: unknown[]): Reply {
      const reply = host.call(JSON.stringify(request), io);
      if (typeof reply !== "string") throw new Error(`${String(request[0])} blocked`);
      return JSON.parse(reply) as Reply;
    },
    async sendAsync(...request: unknown[]): Promise<Reply> {
      return JSON.parse(await host.call(JSON.stringify(request), io)) as Reply;
    },
  };
}

export function ok<T = unknown>(reply: Reply): T {
  if ("error" in reply) throw new Error(`${reply.error.type}: ${reply.error.message}`);
  return reply.ok as T;
}

export function err(reply: Reply): { readonly type: string; readonly message: string } {
  if (!("error" in reply)) throw new Error(`expected an error, got ${JSON.stringify(reply.ok)}`);
  return reply.error;
}
