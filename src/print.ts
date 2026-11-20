/**
 * print.ts — file → beads. Owns the toolpath vocabulary and the print worker.
 *
 * The pipeline is a content-addressed chain, all inside ONE worker so the
 * G-code text and centreline never cross a thread boundary twice:
 *
 *   SourceFile ──slice/parse──▶ SlicedPrint ──▶ Centreline ──sweep──▶ BeadMesh
 *
 * Each stage is cached in the worker by (fileHash, SliceSettings) / (lite).
 * Changing a slice setting re-runs from SlicedPrint; asking for the lite
 * mesh reuses the cached centreline (the old code re-sliced the STL).
 *
 * Frame rule: runs/centreline are millimetres on the plate. BeadMesh is
 * emitted in Blender Z-up metres — the app frame. The single Z→Y swap for
 * three.js lives in viewport.ts; Cycles consumes the mesh as-is.
 */
import type { BedType, Mm, SliceSettings } from "./document";
import { PrintSession } from "./print/session";
import type { Job, Stage } from "./print/session";

// ---- source: the editable/frozen distinction is a type, not a flag ---------

export type PrintSource =
  /** An STL the booth slices itself with `doc.slicing`. */
  | { kind: "stl"; file: File; fileHash: string }
  /** G-code carries its slicing. The panel shows `SlicedPrint.settings`
   *  read-only when `settingsSource` is "file". */
  | { kind: "gcode"; file: File; fileHash: string }
  /** Prebuilt centreline (.bin) for the bundled sample parts. */
  | { kind: "bin"; url: string };

export interface SlicedPrint {
  settings: SliceSettings;      // effective settings (from file or from us)
  settingsSource: "file" | "booth";
  layerHeightMm: Mm;
  /** Per-Z-layer tables, index = round(Z / H), entry 0 unused (as the old
   *  .bin). Owned here; imperfections.ts logic below reads only these. */
  layerTimeS: Float32Array;
  layerFan: Float32Array;       // 0..1 duty
  filamentName: string | null;  // slicer header, for display + preset hint
  bedFromFile: BedType | null;  // curr_bed_type, finally actually read
  note: string | null;          // e.g. "plate 1 of 3"
}

// ---- centreline & mesh (ported from beads-worker.js, shapes kept) ----------

export interface Centreline {
  n: number;
  p: Float32Array;    // xy metres, plate frame
  zq: Uint16Array;    // Z in 0.01 mm
  wq: Uint8Array;     // width in 5 µm
  fl: Uint8Array;     // bit0 run-start, bits1–2 FeatureCode
  vq: Uint8Array;     // speed in 2 mm/s
  h: Mm;              // layer height — .bin gains this field (was pinned 0.2)
  /** Per point: which faces neighbouring material hides (print/cover.ts COVER_*). */
  cover?: Uint8Array;
}

/**
 * One number per vertex, packed as the existing worker packs it and kept as
 * a Float32 so the WebGL2 fallback can read it. This is the only definition
 * of the layout: the worker packs with `packBeadWord`, the bead shader and
 * the Cycles upload unpack through these fields.
 */
export interface WordField { readonly scale: number; readonly size: number } // floor(word / scale) mod size
export const BEAD_WORD = {
  feature: { scale: 1, size: 4 },      // FeatureCode
  layer: { scale: 4, size: 2048 },     // round(Z / layer height), clamped
  speed: { scale: 8192, size: 256 },   // bead speed in SPEED_STEP_MMS units
} as const satisfies Record<string, WordField>;
export const SPEED_STEP_MMS = 2;
export function packBeadWord(feature: number, layer: number, speedQ: number): number {
  return feature * BEAD_WORD.feature.scale
    + Math.min(layer, BEAD_WORD.layer.size - 1) * BEAD_WORD.layer.scale
    + Math.min(speedQ, BEAD_WORD.speed.size - 1) * BEAD_WORD.speed.scale;
}
export function unpackBeadWord(word: number, field: WordField): number {
  return Math.floor(word / field.scale) % field.size;
}

/**
 * Swept bead mesh, Blender Z-up metres, bed at z = 0, XY centred on the
 * bounding box. Buffers are transferred from the worker and then never
 * written, so both renderers may hold the same arrays.
 */
export interface BeadMesh {
  position: Float32Array; // xyz per vertex
  normal: Int16Array;     // xyz per vertex, scaled by 32767
  tangent: Int16Array;    // xyz per vertex, path direction, scaled by 32767 (anisotropy)
  word: Float32Array;     // BEAD_WORD per vertex
  index: Uint32Array;
  /**
   * Per triangle, 1 where material presses on the face so no ray can reach it (print/cover.ts).
   * Only the Cycles photo leaves those out; the preview draws every face, because its
   * single-sided material would see through the slits the per-layer wobble opens. The worker
   * works them out after it has sent the mesh and the pipeline sets them when they come (about
   * 2 s for an 8.7M-triangle part); a Cycles photo waits for them (hiddenFacesSettled).
   */
  hidden?: Uint8Array;
  tris: number;
  layerCount: number;
  layerHeightM: number;
  vRefMmS: number;        // median wall speed: the zero of relative speed
  bboxM: { min: [number, number, number]; max: [number, number, number] };
}
/** Plate face ⇔ position.z ≤ PLATE_EPS — the only spelling of that test. */
export const PLATE_EPS = 5e-6;

// ---- worker protocol (wire types stay in this file; callers see domain) ----

/** Both answer "opened", then "lite", then "hidden": what the part needs first comes first. */
type PrintRequest =
  | { id: number; op: "open"; src: PrintSource; settings: SliceSettings }
  | { id: number; op: "reslice"; settings: SliceSettings }; // STL only; reuses the cached file
type PrintReply =
  | { id: number; kind: "stage"; stage: Stage }
  | { id: number; kind: "opened"; sliced: SlicedPrint; mesh: BeadMesh } // buffers transferred
  | { id: number; kind: "lite"; mesh: BeadMesh }                        // the cached centreline in lite rings; transferred
  | { id: number; kind: "hidden"; hidden: Uint8Array | null }           // BeadMesh.hidden of the opened mesh
  | { id: number; kind: "error"; message: string };
type OpenedReply = Extract<PrintReply, { kind: "opened" }>;

export interface LoadedPrint {
  source: PrintSource;
  sliced: SlicedPrint;
  mesh: BeadMesh;
  /** Sent right after the mesh. Moving-frames only. Rejects with Superseded once a newer open or reslice has begun. */
  liteMesh(): Promise<BeadMesh>;
}

export type PrintState =
  | { status: "empty" }
  | { status: "loading"; stage: string; source: PrintSource }
  | { status: "ready"; loaded: LoadedPrint }
  | { status: "error"; message: string; loaded: LoadedPrint | null }; // keep last good part on show

export class Superseded extends Error {
  override name = "Superseded";
}

interface LiveJob {
  id: number;
  source: PrintSource;
  /** The pipeline's generation when the job began. */
  generation: number;
  onStage: (stage: string) => void;
  resolve: (loaded: LoadedPrint) => void;
  reject: (error: Error) => void;
}

/** An open whose mesh has come, waiting for its lite mesh and hidden flags. */
interface Following {
  mesh: BeadMesh;
  resolveLite: (mesh: BeadMesh) => void;
  rejectLite: (error: Error) => void;
  /** Ends the wait of hiddenFacesSettled, whether the flags came or not. */
  settle: () => void;
}

const settling = new WeakMap<BeadMesh, Promise<void>>();

/**
 * Settles once the print worker has sent the hidden faces of `mesh` (BeadMesh.hidden), or will
 * not: they follow the mesh by about 2 s on a large part. At once for a mesh the pipeline did not
 * open. A photo waits for them: they save it more than that.
 */
export function hiddenFacesSettled(mesh: BeadMesh): Promise<void> {
  return settling.get(mesh) ?? Promise.resolve();
}

/**
 * PrintPipeline — the domain face of the worker. Deep interface: three
 * calls hide slicing (the Muon3D Orca engine in WASM, one fresh worker per slice), parsing, exposedInner,
 * centreline, both sweeps, caching and job supersession.
 * Concurrency rule: at most one job is live; a new call supersedes —
 * the superseded promise rejects with Superseded and its reply is dropped.
 */
export class PrintPipeline {
  private readonly spawn: () => Worker;
  private worker: Worker | null = null;
  /** The worker has been sent a source, so a reslice can name only the settings. */
  private warm = false;
  private job: LiveJob | null = null;
  /** By request id. At most one: a new request cuts the worker's follow-ups short. */
  private readonly following = new Map<number, Following>();
  private nextId = 1;
  /** Bumped by every open and reslice; a LoadedPrint of an older generation is stale. */
  private generation = 0;
  private source: PrintSource | null = null;

  constructor(spawn: () => Worker) {
    this.spawn = spawn;
  }

  /** STL sliced with `settings`; G-code/3mf parsed; .bin read. */
  async open(src: PrintSource, settings: SliceSettings, onStage: (s: string) => void): Promise<LoadedPrint> {
    this.generation++;
    this.stopFollowing(new Superseded("a newer print replaced this one"));
    this.source = src;
    this.warm = true;
    return this.start(src, (id) => ({ id, op: "open", src, settings }), onStage);
  }

  /** Only reachable when source.kind === "stl" — Booth enforces; the type
   *  of `src` there makes the G-code case unrepresentable in the panel. */
  async reslice(settings: SliceSettings, onStage: (s: string) => void): Promise<LoadedPrint> {
    const src = this.source;
    if (!src || src.kind !== "stl") throw new Error("only an opened STL can be re-sliced");
    this.generation++;
    this.stopFollowing(new Superseded("a newer print replaced this one"));
    const resend = !this.warm; // the worker was lost: it has to be told the file again
    this.warm = true;
    return this.start(src, (id) => (resend ? { id, op: "open", src, settings } : { id, op: "reslice", settings }), onStage);
  }

  dispose(): void {
    this.generation++;
    this.job?.reject(new Superseded("the print pipeline was disposed"));
    this.job = null;
    this.stopFollowing(new Superseded("the print pipeline was disposed"));
    this.discardWorker();
  }

  /** Called in the "opened" message's own handler, so the follow-ups of the open find their place. */
  private load(job: LiveJob, reply: OpenedReply): LoadedPrint {
    const { generation } = job, { mesh } = reply;
    let resolveLite: (m: BeadMesh) => void = () => {}, rejectLite: (e: Error) => void = () => {}, settle = () => {};
    const lite = new Promise<BeadMesh>((resolve, reject) => { resolveLite = resolve; rejectLite = reject; });
    lite.catch(() => {}); // no viewport may ever ask
    settling.set(mesh, new Promise<void>((resolve) => { settle = resolve; }));
    this.following.set(reply.id, { mesh, resolveLite, rejectLite, settle });
    return {
      source: job.source, sliced: reply.sliced, mesh,
      liteMesh: () => generation === this.generation ? lite : Promise.reject(new Superseded("a newer print replaced this one")),
    };
  }

  private follow(reply: PrintReply, after: Following): void {
    if (reply.kind === "lite") after.resolveLite(reply.mesh);
    if (reply.kind === "hidden" && reply.hidden?.length === after.mesh.tris) after.mesh.hidden = reply.hidden;
    if (reply.kind === "error") {
      // After the mesh only the lite mesh or the hidden faces can fail: the part stays on show.
      console.error(`the print worker, after the mesh: ${reply.message}`);
      after.rejectLite(new Error(reply.message));
    }
    if (reply.kind === "hidden" || reply.kind === "error") {
      after.settle();
      this.following.delete(reply.id);
    }
  }

  private stopFollowing(error: Error): void {
    for (const after of this.following.values()) {
      after.rejectLite(error);
      after.settle();
    }
    this.following.clear();
  }

  private start(source: PrintSource, request: (id: number) => PrintRequest, onStage: (s: string) => void): Promise<LoadedPrint> {
    this.job?.reject(new Superseded("a newer print request began"));
    this.job = null;
    const worker = this.worker ?? this.spawnWorker();
    const generation = this.generation;
    return new Promise<LoadedPrint>((resolve, reject) => {
      const id = this.nextId++;
      this.job = { id, source, generation, onStage, resolve, reject };
      try {
        worker.postMessage(request(id));
      } catch (err) {
        this.job = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private spawnWorker(): Worker {
    const worker = this.spawn();
    worker.onmessage = (ev: MessageEvent<PrintReply>) => {
      const reply = ev.data, job = this.job, after = this.following.get(reply.id);
      if (after) { this.follow(reply, after); return; }
      if (!job || reply.id !== job.id) return; // late reply of a superseded job
      if (reply.kind === "stage") { job.onStage(reply.stage); return; }
      this.job = null;
      if (reply.kind === "opened") job.resolve(this.load(job, reply));
      else job.reject(new Error(reply.kind === "error" ? reply.message : `the print worker answered an open with "${reply.kind}"`));
    };
    worker.onerror = (ev: ErrorEvent) => {
      const job = this.job, error = new Error(ev.message || "the print worker crashed");
      this.job = null;
      this.discardWorker();
      job?.reject(error);
      this.stopFollowing(error);
    };
    this.worker = worker;
    return worker;
  }

  private discardWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.warm = false;
  }
}

// ---- worker side ----

/** The slice of a worker's global scope (or of a MessagePort) that the print protocol uses. */
interface Port {
  onmessage: ((ev: MessageEvent<PrintRequest>) => void) | null;
  postMessage(message: PrintReply, options: { transfer: ArrayBuffer[] }): void;
}

function transferable(buffer: ArrayBufferLike): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  throw new Error("a mesh buffer is shared memory and cannot be transferred");
}
const meshBuffers = (m: BeadMesh): ArrayBuffer[] =>
  [m.position, m.normal, m.tangent, m.word, m.index].map((a) => transferable(a.buffer));

/**
 * Answers print requests on `port`. A request arriving while a job runs aborts
 * it: the engine worker of a slice is terminated, and the aborted job sends
 * nothing more.
 */
export function servePrint(port: Port): void {
  const session = new PrintSession();
  let live: AbortController | null = null;
  const send = (reply: PrintReply, transfer: ArrayBuffer[] = []): void => port.postMessage(reply, { transfer });

  const run = async (req: PrintRequest, ctl: AbortController): Promise<void> => {
    const job: Job = {
      signal: ctl.signal,
      stage: (stage) => { if (!ctl.signal.aborted) send({ id: req.id, kind: "stage", stage }); },
      checkpoint: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        ctl.signal.throwIfAborted();
      },
    };
    try {
      const opened = await (req.op === "open" ? session.open(req.src, req.settings, job) : session.reslice(req.settings, job));
      ctl.signal.throwIfAborted();
      send({ id: req.id, kind: "opened", ...opened }, meshBuffers(opened.mesh));
      // The viewport moves the lite mesh, and only a photo needs the hidden flags: neither holds up the part.
      const lite = await session.lite(job);
      ctl.signal.throwIfAborted();
      send({ id: req.id, kind: "lite", mesh: lite }, meshBuffers(lite));
      const hidden = await session.hidden(job);
      ctl.signal.throwIfAborted();
      send({ id: req.id, kind: "hidden", hidden }); // copied: the session keeps them for a re-open
    } catch (err) {
      if (ctl.signal.aborted) return;
      send({ id: req.id, kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  port.onmessage = (ev) => {
    live?.abort();
    live = new AbortController();
    void run(ev.data, live);
  };
}

/** Worker-side entry (src/print/worker.ts calls this). Ported from the old
 *  beads-worker.js: parse, exposedInner, centreline, ringTables, sweep,
 *  gcodeFrom3mf, binaryStl, thin. Changes against the port source:
 *  (1) sweep emits Z-up positions, a tangent and the packed BEAD_WORD;
 *  (2) an STL is sliced by the Muon3D engine with the full SliceSettings,
 *      in a fresh worker per slice, and its G-code carries LINE_WIDTH tags;
 *  (3) the centreline is cached so the lite mesh never re-slices.
 *  The calibration constants (BULGE 0.045, TOP_R 0.04, JITTER 0.004, ...) sit
 *  in one block, src/print/calibration.ts, checked by the parity test. */
export function runPrintWorker(): void {
  servePrint(self);
}
