/**
 * Drives PrintPipeline from a bare page: no three.js, no app. Prints the
 * stages, timings and mesh statistics as text. `window.printDev` is the same
 * thing for tools/print/drive.mjs.
 */
import { DEFAULT_SLICE, TOP_SURFACE_PATTERNS, mm } from "../src/document";
import type { SliceSettings } from "../src/document";
import { PrintPipeline, Superseded } from "../src/print";
import type { BeadMesh, LoadedPrint, PrintSource } from "../src/print";

const SEAMS = ["aligned", "nearest", "back", "random"] as const;

function oneOf<T extends string>(options: readonly T[], value: unknown, what: string): T {
  const hit = options.find((o) => o === value);
  if (!hit) throw new Error(`${what} must be one of ${options.join(", ")}, got ${String(value)}`);
  return hit;
}

function positive(value: unknown, what: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${what} must be a positive number, got ${String(value)}`);
  return n;
}

function settingsFrom(raw: Record<string, unknown>): SliceSettings {
  return {
    layerHeight: mm(positive(raw.layerHeight, "layerHeight")),
    outerLineWidth: mm(positive(raw.outerLineWidth, "outerLineWidth")),
    innerLineWidth: mm(positive(raw.innerLineWidth, "innerLineWidth")),
    wallCount: positive(raw.wallCount, "wallCount"),
    topShellLayers: positive(raw.topShellLayers, "topShellLayers"),
    topSurfacePattern: oneOf(TOP_SURFACE_PATTERNS, raw.topSurfacePattern, "topSurfacePattern"),
    seamPosition: oneOf(SEAMS, raw.seamPosition, "seamPosition"),
  };
}

function field(id: string): HTMLInputElement | HTMLSelectElement {
  const e = document.getElementById(id);
  if (e instanceof HTMLInputElement || e instanceof HTMLSelectElement) return e;
  throw new Error(`#${id} is missing`);
}

const formSettings = (): Record<string, unknown> =>
  Object.fromEntries(Object.keys(DEFAULT_SLICE).map((k) => [k, field(k).value]));

const out = document.getElementById("out");
function log(line: string): void {
  console.log(line);
  if (out) out.textContent += `${line}\n`;
}

const pipeline = new PrintPipeline(() => new Worker(new URL("../src/print/worker.ts", import.meta.url), { type: "module" }));
let files: File[] = [];

async function sourceOf(file: File): Promise<PrintSource> {
  if (/\.bin$/i.test(file.name)) return { kind: "bin", url: URL.createObjectURL(file) };
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const fileHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { kind: /\.stl$/i.test(file.name) ? "stl" : "gcode", file, fileHash };
}

export interface Summary {
  file: string;
  kind: PrintSource["kind"];
  stagesMs: Record<string, number>;
  totalMs: number;
  tris: number;
  vertices: number;
  layers: number;
  layerHeightMm: number;
  bboxMm: { min: number[]; max: number[] };
  vRefMmS: number;
  settingsSource: "file" | "booth" | "none";
  settings: SliceSettings | null;
  bed: string | null;
  filament: string | null;
  note: string | null;
}

const mmBox = (m: BeadMesh): Summary["bboxMm"] => ({
  min: m.bboxM.min.map((v) => +(v * 1e3).toFixed(3)), max: m.bboxM.max.map((v) => +(v * 1e3).toFixed(3)),
});

/** Runs one call, timing each stage the pipeline reports. */
function timed(label: string, start: (onStage: (s: string) => void) => Promise<LoadedPrint>): Promise<{ loaded: LoadedPrint; stagesMs: Record<string, number>; totalMs: number }> {
  const t0 = performance.now(), marks: [string, number][] = [];
  log(label);
  const call = start((stage) => {
    const at = performance.now() - t0;
    marks.push([stage, at]);
    log(`  stage ${stage} at ${at.toFixed(0)} ms`);
  });
  return call.then((loaded) => {
    const totalMs = performance.now() - t0, stagesMs: Record<string, number> = {};
    marks.forEach(([stage, at], i) => { stagesMs[stage] = +((marks[i + 1]?.[1] ?? totalMs) - at).toFixed(1); });
    return { loaded, stagesMs, totalMs: +totalMs.toFixed(1) };
  });
}

function summarise(loaded: LoadedPrint, run: { stagesMs: Record<string, number>; totalMs: number }): Summary {
  const { mesh, sliced, source } = loaded;
  const name = source.kind === "bin" ? source.url : source.file.name;
  const summary: Summary = {
    file: name, kind: source.kind, stagesMs: run.stagesMs, totalMs: run.totalMs, tris: mesh.tris, vertices: mesh.word.length,
    layers: mesh.layerCount, layerHeightMm: +(mesh.layerHeightM * 1e3).toFixed(4), bboxMm: mmBox(mesh), vRefMmS: mesh.vRefMmS,
    settingsSource: sliced.settingsSource, settings: sliced.settings, bed: sliced.bedFromFile, filament: sliced.filamentName, note: sliced.note,
  };
  log(`  done in ${run.totalMs} ms: ${summary.vertices} vertices, ${summary.tris} triangles, ${summary.layers} layers of ${summary.layerHeightMm} mm`);
  log(`  bbox mm ${JSON.stringify(summary.bboxMm)}, wall speed ${summary.vRefMmS} mm/s`);
  log(`  settings from ${summary.settingsSource}: ${JSON.stringify(summary.settings)}`);
  log(`  bed ${summary.bed}, filament ${summary.filament}, note ${summary.note}`);
  return summary;
}

let current: LoadedPrint | null = null;

async function open(index: number, overrides: Record<string, unknown> = {}): Promise<Summary> {
  const file = files[index];
  if (!file) throw new Error(`no file ${index} chosen`);
  const src = await sourceOf(file), settings = settingsFrom({ ...formSettings(), ...overrides });
  const run = await timed(`open ${file.name} (${src.kind})`, (onStage) => pipeline.open(src, settings, onStage));
  current = run.loaded;
  return summarise(run.loaded, run);
}

async function reslice(overrides: Record<string, unknown> = {}): Promise<Summary> {
  const settings = settingsFrom({ ...formSettings(), ...overrides });
  const run = await timed("reslice", (onStage) => pipeline.reslice(settings, onStage));
  current = run.loaded;
  return summarise(run.loaded, run);
}

async function lite(): Promise<{ tris: number; vertices: number; ms: number }> {
  if (!current) throw new Error("open a file first");
  const t0 = performance.now(), mesh = await current.liteMesh(), ms = +(performance.now() - t0).toFixed(1);
  log(`lite mesh in ${ms} ms: ${mesh.word.length} vertices, ${mesh.tris} triangles`);
  return { tris: mesh.tris, vertices: mesh.word.length, ms };
}

/** Opens file `a`, then file `b` before `a` has answered. */
async function supersede(a: number, b: number, overrides: Record<string, unknown> = {}): Promise<{ first: string; second: Summary }> {
  const fa = files[a], fb = files[b];
  if (!fa || !fb) throw new Error("choose two files");
  const sa = await sourceOf(fa), sb = await sourceOf(fb), settings = settingsFrom({ ...formSettings(), ...overrides });
  const stagesOfFirst: string[] = [];
  const first = pipeline.open(sa, settings, (s) => stagesOfFirst.push(s)).then(
    () => "resolved",
    (err: unknown) => (err instanceof Superseded ? "Superseded" : `rejected: ${String(err)}`),
  );
  const run = await timed(`open ${fb.name} (${sb.kind}) while ${fa.name} is running`, (onStage) => pipeline.open(sb, settings, onStage));
  current = run.loaded;
  const outcome = await first;
  log(`first call: ${outcome}, ${stagesOfFirst.length} stage reports reached it`);
  return { first: outcome, second: summarise(run.loaded, run) };
}

function choose(list: FileList | File[]): void {
  files = Array.from(list);
  log(`chosen: ${files.map((f) => f.name).join(", ")}`);
}

const input = field("file");
if (input instanceof HTMLInputElement) input.addEventListener("change", () => input.files && choose(input.files));
const drop = document.getElementById("drop");
drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
drop?.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer?.files.length) choose(e.dataTransfer.files);
});
const report = (p: Promise<unknown>): void => { p.catch((err: unknown) => log(`error: ${err instanceof Error ? err.message : String(err)}`)); };
document.getElementById("open")?.addEventListener("click", () => report(open(0)));
document.getElementById("reslice")?.addEventListener("click", () => report(reslice()));
document.getElementById("lite")?.addEventListener("click", () => report(lite()));

const printDev = { open, reslice, lite, supersede };
export type PrintDev = typeof printDev;
declare global { interface Window { printDev: PrintDev } }
window.printDev = printDev;
