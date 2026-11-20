/**
 * Drives the Viewport from a bare page: a document from defaultDocument()
 * with URL overrides, a print from PrintPipeline, plain buttons. No Booth,
 * no React. `window.viewportDev` is the same thing for tools/viewport/drive.mjs.
 *
 * URL parameters: look, filament, gloss, turntable, az, el, dist, tx, ty, tz,
 * focal, fstop, aspect (w:h), long, samples, transparent (0 or 1), overlay,
 * props (demo: a grey wall behind the part and a red cube beside it).
 */
import {
  DEFAULT_SLICE, FILAMENT_PRESET_IDS, LOOK_IDS, OVERLAYS, deg, defaultDocument, m, mm,
  type BoothDocument, type FilamentPresetId, type LookId,
} from "../src/document";
import { addProp, applyFilamentPreset, applyLook, focusAt, patchLight, type LightPatch } from "../src/edits";
import { develop } from "../src/film";
import { PrintPipeline, type LoadedPrint, type PrintSource } from "../src/print";
import { compileScene, framePart, type Scene } from "../src/scene";
import { Viewport, type ViewportStats } from "../src/viewport/viewport";

type Params = Record<string, string | number | boolean>;

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return options.find((o) => o === value) ?? null;
}

/** The URL's names, applied to a draft. Unknown names throw, so a typo in a driver fails loudly. */
function applyParams(d: BoothDocument, p: Params): void {
  for (const [k, raw] of Object.entries(p)) {
    const v = String(raw), n = Number(raw);
    switch (k) {
      case "look": { const id = oneOf<LookId>(LOOK_IDS, v); if (!id) throw new Error(`look ${v}`); applyLook(id)(d); break; }
      case "filament": { const id = oneOf<FilamentPresetId>(FILAMENT_PRESET_IDS, v); if (!id) throw new Error(`filament ${v}`); applyFilamentPreset(id)(d); break; }
      case "gloss": d.filament.gloss = n; break;
      case "overlay": { const o = oneOf(OVERLAYS, v); if (!o) throw new Error(`overlay ${v}`); d.filament.imperfections.overlay = o; break; }
      case "turntable": d.pose.turntableDeg = deg(n); break;
      case "az": d.camera.azimuth = deg(n); break;
      case "el": d.camera.elevation = deg(n); break;
      case "dist": d.camera.distance = m(n); break;
      case "tx": d.camera.target = [m(n), d.camera.target[1], d.camera.target[2]]; break;
      case "ty": d.camera.target = [d.camera.target[0], m(n), d.camera.target[2]]; break;
      case "tz": d.camera.target = [d.camera.target[0], d.camera.target[1], m(n)]; break;
      case "focal": d.camera.focalMm = mm(n); break;
      case "fstop": d.camera.fStop = n; break;
      case "aspect": { const [w, h] = v.split(":").map(Number); d.output.aspect = { w, h }; break; }
      case "long": d.output.longEdgePx = n; break;
      case "samples": d.output.samples = n; break;
      case "transparent": d.output.transparentBackground = v === "1" || v === "true"; break;
      case "backdrop": d.studio.backdrop.color = [n, n, n]; break;
      case "props": if (v !== "demo") throw new Error(`props ${v}`); demoProps(d); break;
      default: throw new Error(`unknown parameter ${k}`);
    }
  }
}

/** A grey wall behind the part and a red cube beside it, as Booth's add-prop does. */
function demoProps(d: BoothDocument): void {
  addProp("cube", { name: "wall", size: [m(0.3), m(0.02), m(0.3)], location: [m(0), m(0.07), m(0.15)], color: [0.3, 0.3, 0.3], roughness: 0.6 })(d);
  addProp("cube", { name: "cube", size: [m(0.05), m(0.05), m(0.05)], location: [m(-0.07), m(-0.01), m(0.025)], rotationDeg: [deg(0), deg(0), deg(25)], color: [0.8, 0.02, 0.02], roughness: 0.4 })(d);
}

const urlParams: Params = Object.fromEntries(new URLSearchParams(location.search));
const cameraFromUrl = ["az", "el", "dist", "tx", "ty", "tz"].some((k) => k in urlParams);
let doc = defaultDocument();
applyParams(doc, urlParams);
let print: LoadedPrint | null = null;
let rev = 0;
let scene: Scene = compileScene(doc, null, rev);
let cameraEdits = 0;
let lastStatus = "";

const statusEl = document.getElementById("status");
const canvas = document.getElementById("view");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#view is missing");

const viewport = await Viewport.create(canvas, {
  onCameraEdited: (c) => {
    cameraEdits++;
    edit((d) => { Object.assign(d.camera, c); });
  },
  onFocusPicked: (p) => edit(focusAt([m(p[0]), m(p[1]), m(p[2])])),
  onStatus: (text) => {
    lastStatus = text;
    if (statusEl) statusEl.textContent = `${viewport.stats.backend} · ${text}`;
  },
});

function recompile(): void {
  scene = compileScene(doc, print, ++rev, scene);
  viewport.show(scene);
}

function edit(mutate: (d: BoothDocument) => void): void {
  const next = structuredClone(doc);
  mutate(next);
  doc = next;
  recompile();
}

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Milliseconds from now until the viewport has a settled still of the latest scene. */
async function waitConverged(timeoutMs = 60000): Promise<number> {
  const t0 = performance.now();
  await nextFrame();
  while (!viewport.stats.converged) {
    if (performance.now() - t0 > timeoutMs) throw new Error(`not converged after ${timeoutMs} ms: ${lastStatus}`);
    await nextFrame();
  }
  return +(performance.now() - t0).toFixed(1);
}

async function timedEdit(mutate: (d: BoothDocument) => void): Promise<number> {
  const t0 = performance.now();
  edit(mutate);
  await waitConverged();
  return +(performance.now() - t0).toFixed(1);
}

const pipeline = new PrintPipeline(() => new Worker(new URL("../src/print/worker.ts", import.meta.url), { type: "module" }));
let files: File[] = [];

async function sourceOf(file: File): Promise<PrintSource> {
  if (/\.bin$/i.test(file.name)) return { kind: "bin", url: URL.createObjectURL(file) };
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const fileHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { kind: /\.stl$/i.test(file.name) ? "stl" : "gcode", file, fileHash };
}

/** Opens file `index`, frames it as Booth does (unless the URL set the camera), and shows it. */
async function open(index = 0, withLite = true): Promise<{ file: string; tris: number; vertices: number; layers: number; openMs: number; shownMs: number }> {
  const file = files[index];
  if (!file) throw new Error(`no file ${index} chosen`);
  const t0 = performance.now();
  const loaded = await pipeline.open(await sourceOf(file), DEFAULT_SLICE, (s) => { if (statusEl) statusEl.textContent = s; });
  const openMs = performance.now() - t0;
  print = loaded;
  edit((d) => {
    if (!cameraFromUrl) Object.assign(d.camera, framePart(loaded.mesh, d.camera, d.output.aspect));
    d.camera.focusPartPoint = null;
  });
  viewport.setLiteMesh(null);
  if (withLite) void loaded.liteMesh().then((lite) => { if (print === loaded) viewport.setLiteMesh(lite); }, () => {});
  const shownMs = await waitConverged(120000);
  return { file: file.name, tris: loaded.mesh.tris, vertices: loaded.mesh.word.length, layers: loaded.mesh.layerCount, openMs: +openMs.toFixed(0), shownMs };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Runs accumulate on the current scene. `abort` names a reason to abort with after `abortAfterMs`. */
async function photo(opts: { abortAfterMs?: number; abort?: string } = {}): Promise<{ png?: string; width?: number; height?: number; samples?: number; ms: number; passes: number; error?: string; linear?: { meanR: number; meanAlpha: number; maxR: number } }> {
  const ctl = new AbortController(), t0 = performance.now();
  let passes = 0;
  if (opts.abortAfterMs !== undefined) setTimeout(() => ctl.abort(opts.abort ?? "cancel"), opts.abortAfterMs);
  try {
    const frame = await viewport.accumulate(scene, () => { passes++; }, ctl.signal);
    const png = new Uint8Array(await (await develop(frame, scene.film)).arrayBuffer());
    let r = 0, a = 0, maxR = 0;
    for (let i = 0; i < frame.rgba.length; i += 4) { r += frame.rgba[i]; a += frame.rgba[i + 3]; maxR = Math.max(maxR, frame.rgba[i]); }
    const px = frame.rgba.length / 4;
    const linear = { meanR: +(r / px).toFixed(4), meanAlpha: +(a / px).toFixed(4), maxR: +maxR.toFixed(3) };
    return { png: toBase64(png), width: frame.width, height: frame.height, samples: frame.samples, ms: +(performance.now() - t0).toFixed(0), passes, linear };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), ms: +(performance.now() - t0).toFixed(0), passes };
  }
}

/**
 * The part's silhouette in the film, by projecting every mesh vertex with
 * the scene's camera (Blender's model, no three.js), closed over small holes
 * and eroded so edges, where the two renders disagree most, do not count.
 */
function partMask(width: number, height: number, erodePx = 3): Uint8Array {
  const part = scene.part, cam = scene.camera;
  if (!part) throw new Error("no part");
  const t = part.toWorld, p = part.mesh.position, P = cam.position;
  const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]); return a.map((x) => x / l); };
  const cross = (a: number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(sub(cam.target, P)), right = norm(cross(fwd, cam.up)), up = cross(right, fwd);
  const ty = Math.tan(cam.fovYRad / 2), tx = ty * (width / height);
  let mask = new Uint8Array(width * height);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const wx = t[0] * x + t[4] * y + t[8] * z + t[12] - P[0];
    const wy = t[1] * x + t[5] * y + t[9] * z + t[13] - P[1];
    const wz = t[2] * x + t[6] * y + t[10] * z + t[14] - P[2];
    const d = wx * fwd[0] + wy * fwd[1] + wz * fwd[2];
    const u = Math.floor(((wx * right[0] + wy * right[1] + wz * right[2]) / (d * tx) + 1) * 0.5 * width);
    const v = Math.floor((1 - (wx * up[0] + wy * up[1] + wz * up[2]) / (d * ty)) * 0.5 * height);
    if (u >= 0 && u < width && v >= 0 && v < height) mask[v * width + u] = 1;
  }
  // A square structuring element is separable: a row pass, then a column pass.
  const pass1d = (src: Uint8Array, r: number, dilate: boolean, stride: number, count: number, lines: number, lineStride: number) => {
    const out = new Uint8Array(src.length);
    for (let l = 0; l < lines; l++) for (let i = 0; i < count; i++) {
      let v = dilate ? 0 : 1;
      for (let k = Math.max(0, i - r); k <= Math.min(count - 1, i + r); k++) {
        const s0 = src[l * lineStride + k * stride];
        if (dilate ? s0 === 1 : s0 === 0) { v = dilate ? 1 : 0; break; }
      }
      if (!dilate && (i - r < 0 || i + r > count - 1)) v = 0;
      out[l * lineStride + i * stride] = v;
    }
    return out;
  };
  const morph = (src: Uint8Array, r: number, dilate: boolean) =>
    pass1d(pass1d(src, r, dilate, 1, width, height, width), r, dilate, width, height, width, 1);
  mask = morph(morph(mask, 2, true), 2 + erodePx, false);
  return mask;
}

async function pixels(base64: string, width: number, height: number): Promise<Uint8ClampedArray> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(width, height), ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/** Mean 8-bit sRGB luma inside the part mask, for each PNG, at the film's size. */
async function partBrightness(pngs: Record<string, string>): Promise<Record<string, number> & { maskPx: number }> {
  const { width, height } = scene.film;
  const mask = partMask(width, height);
  const out: Record<string, number> = {};
  let maskPx = 0;
  for (const v of mask) maskPx += v;
  for (const [name, png] of Object.entries(pngs)) {
    const px = await pixels(png, width, height);
    let sum = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) sum += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    out[name] = +(sum / maskPx).toFixed(2);
  }
  return { ...out, maskPx };
}

/** Per-pixel difference of two PNGs drawn at one size: mean and 99th percentile of |delta| in 8-bit sRGB. */
async function difference(a: string, b: string, width: number, height: number): Promise<{ mean: number; p99: number; meanA: number; meanB: number }> {
  const pa = await pixels(a, width, height), pb = await pixels(b, width, height);
  const deltas: number[] = [];
  let sa = 0, sb = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const la = 0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2];
    const lb = 0.2126 * pb[i] + 0.7152 * pb[i + 1] + 0.0722 * pb[i + 2];
    sa += la; sb += lb;
    deltas.push(Math.abs(la - lb));
  }
  deltas.sort((x, y) => x - y);
  const n = deltas.length;
  return { mean: +(deltas.reduce((s, x) => s + x, 0) / n).toFixed(2), p99: +deltas[Math.floor(n * 0.99)].toFixed(1), meanA: +(sa / n).toFixed(2), meanB: +(sb / n).toFixed(2) };
}

/** The photo's frame on the canvas, in CSS pixels, as the viewport draws it. */
function cropOnCanvas(): { x: number; y: number; width: number; height: number } {
  const w = canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0, h = canvas instanceof HTMLCanvasElement ? canvas.clientHeight : 0;
  const s = 0.9 * Math.min(w / scene.film.width, h / scene.film.height);
  const cw = scene.film.width * s, ch = scene.film.height * s;
  return { x: (w - cw) / 2, y: (h - ch) / 2, width: cw, height: ch };
}

function input(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} is missing`);
  return e;
}

const looks = input("looks"), filaments = input("filaments");
for (const id of LOOK_IDS) looks.append(Object.assign(document.createElement("button"), { type: "button", textContent: id, onclick: () => edit(applyLook(id)) }));
for (const id of FILAMENT_PRESET_IDS) filaments.append(Object.assign(document.createElement("button"), { type: "button", textContent: id, onclick: () => edit(applyFilamentPreset(id)) }));
input("turn").onclick = () => edit((d) => { d.pose.turntableDeg = deg((d.pose.turntableDeg + 15) % 360); });
const FSTOPS = [2.8, 4, 8, 11, 22];
const fstopButton = input("fstop");
const showFstop = () => { fstopButton.textContent = `f/${doc.camera.fStop}`; };
fstopButton.onclick = () => { edit((d) => { d.camera.fStop = FSTOPS[(FSTOPS.indexOf(d.camera.fStop) + 1) % FSTOPS.length]; }); showFstop(); };
showFstop();
let focusTool = false;
const setFocusTool = (on: boolean) => { focusTool = on; viewport.setFocusTool(on); input("focus").setAttribute("aria-pressed", String(on)); };
input("focus").onclick = () => setFocusTool(!focusTool);
input("transparent").onclick = () => {
  edit((d) => { d.output.transparentBackground = !d.output.transparentBackground; });
  input("transparent").setAttribute("aria-pressed", String(doc.output.transparentBackground));
};
input("photo").onclick = () => void photo().then((r) => {
  if (!r.png) return;
  const a = Object.assign(document.createElement("a"), { href: `data:image/png;base64,${r.png}`, download: "viewport-photo.png" });
  a.click();
});
const fileInput = input("file");
if (fileInput instanceof HTMLInputElement) fileInput.addEventListener("change", () => {
  files = Array.from(fileInput.files ?? []);
  open(0).catch((err: unknown) => { if (statusEl) statusEl.textContent = `could not open: ${err instanceof Error ? err.message : String(err)}`; });
});

recompile();

const viewportDev = {
  stats: (): ViewportStats & { docRev: number; cameraEdits: number; status: string } => ({ ...viewport.stats, docRev: rev, cameraEdits, status: lastStatus }),
  choose: (list: FileList | File[]) => { files = Array.from(list); },
  /** Takes the files a driver set on #driverFiles, which, unlike #file, does not open on change. */
  chooseFromInput: () => {
    const e = input("driverFiles");
    if (e instanceof HTMLInputElement) files = Array.from(e.files ?? []);
    return files.map((f) => f.name);
  },
  open,
  waitConverged,
  /** Applies URL-style overrides; resolves with the ms until the still settles. */
  set: (p: Params) => timedEdit((d) => applyParams(d, p)),
  patchLight: (id: string, patch: LightPatch) => timedEdit(patchLight(id, patch)),
  focusTool: setFocusTool,
  focusPartPoint: () => doc.camera.focusPartPoint,
  camera: () => ({ ...doc.camera, scenePosition: scene.camera.position, focusDistanceM: scene.camera.focusDistanceM }),
  lights: () => doc.studio.lights.map((l) => ({ id: l.id, kind: l.kind, azimuth: l.azimuth, power: l.kind === "area" ? l.powerW : null })),
  photo,
  partBrightness,
  difference,
  cropOnCanvas,
  film: () => ({ width: scene.film.width, height: scene.film.height }),
  /** Re-shows the scene unchanged: the camera must not move and no edit may come back. */
  reshow: () => { viewport.show(scene); },
  /** Recompiles the document as it stands, as Booth does after any edit. */
  recompile,
};
export type ViewportDev = typeof viewportDev;
declare global { interface Window { viewportDev: ViewportDev } }
window.viewportDev = viewportDev;
