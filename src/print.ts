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
import type { BedType, Imperfections, Mm, SliceSettings } from "./document";

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
  throw new Error("not implemented");
}
export function unpackBeadWord(word: number, field: WordField): number {
  throw new Error("not implemented");
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
  tris: number;
  layerCount: number;
  layerHeightM: number;
  vRefMmS: number;        // median wall speed: the zero of relative speed
  bboxM: { min: [number, number, number]; max: [number, number, number] };
}
/** Plate face ⇔ position.z ≤ PLATE_EPS — the only spelling of that test. */
export const PLATE_EPS = 5e-6;

/** Layer warmth curve from timing + imperfection settings. ONE pure owner:
 *  preview uploads it as a small data texture indexed by `layer`; the photo
 *  compiler expands it per-vertex for Cycles. Median 0, ±1 at p10/p90. */
export function layerHeatCurve(s: SlicedPrint, imp: Imperfections): Float32Array {
  throw new Error("not implemented");
  // TODO: h[k] = 1/(1 + t(1+fanCooling·fan)/tau); rescale per-part (old applyImperfections)
}

// ---- worker protocol (wire types stay in this file; callers see domain) ----

type PrintRequest =
  | { id: number; op: "open"; src: PrintSource; settings: SliceSettings } // → sliced + full mesh
  | { id: number; op: "reslice"; settings: SliceSettings } // STL only; reuses the cached file
  | { id: number; op: "lite" };                             // sweep cached centreline, lite rings
type PrintReply =
  | { id: number; stage: "reading" | "slicing" | "parsing" | "walls" | "sweeping" }
  | { id: number; sliced: SlicedPrint; mesh: BeadMesh }     // buffers transferred
  | { id: number; mesh: BeadMesh }                          // lite reply
  | { id: number; error: string };

export interface LoadedPrint {
  source: PrintSource;
  sliced: SlicedPrint;
  mesh: BeadMesh;
  /** Lazily built, cached; null until first resolved. Moving-frames only. */
  liteMesh(): Promise<BeadMesh>;
}

export type PrintState =
  | { status: "empty" }
  | { status: "loading"; stage: string; source: PrintSource }
  | { status: "ready"; loaded: LoadedPrint }
  | { status: "error"; message: string; loaded: LoadedPrint | null }; // keep last good part on show

/**
 * PrintPipeline — the domain face of the worker. Deep interface: three
 * calls hide slicing (the Muon3D Orca engine in WASM, one fresh worker per slice), parsing, exposedInner,
 * centreline, both sweeps, caching and job supersession.
 * Concurrency rule: at most one job is live; a new call supersedes —
 * the superseded promise rejects with Superseded and its reply is dropped.
 */
export class PrintPipeline {
  constructor(spawn: () => Worker) {
    throw new Error("not implemented");
  }
  /** STL sliced with `settings`; G-code/3mf parsed; .bin read. */
  open(src: PrintSource, settings: SliceSettings, onStage: (s: string) => void): Promise<LoadedPrint> {
    throw new Error("not implemented");
    // TODO: post {op:"open"}; wire stage replies; transfer nothing back except mesh buffers
  }
  /** Only reachable when source.kind === "stl" — Booth enforces; the type
   *  of `src` there makes the G-code case unrepresentable in the panel. */
  reslice(settings: SliceSettings, onStage: (s: string) => void): Promise<LoadedPrint> {
    throw new Error("not implemented");
  }
  dispose(): void { throw new Error("not implemented"); }
}
export class Superseded extends Error {}

/** Worker-side entry (src/print/worker.ts calls this). Ported from the old
 *  beads-worker.js: parse, exposedInner, centreline, ringTables, sweep,
 *  gcodeFrom3mf, binaryStl, thin. Changes against the port source:
 *  (1) sweep emits Z-up positions, a tangent and the packed BEAD_WORD;
 *  (2) an STL is sliced by the Muon3D engine with the full SliceSettings,
 *      in a fresh worker per slice, and its G-code carries LINE_WIDTH tags;
 *  (3) the centreline is cached so the lite mesh never re-slices.
 *  The calibration constants (BULGE 0.045, TOP_R 0.04, JITTER 0.004, ...) sit
 *  in one block at the top of the worker, checked by the parity test. */
export function runPrintWorker(): void { throw new Error("not implemented"); }
