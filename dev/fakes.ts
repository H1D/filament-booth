/**
 * fakes.ts: stand-ins for the three parts that do not exist yet in this
 * checkout (the print pipeline, the photo engine and the WebGPU viewport), so
 * the panels and the app shell can be driven end to end in a plain browser.
 *
 * Each fake keeps the real contract: the same method names, the same stage
 * words, the same progress states, the same frozen scene as input. They are
 * slow on purpose, so a test can observe "re-slicing" and a photo in flight.
 */
import type { PrintPort } from "../src/booth";
import { mm, type BedType, type SliceSettings } from "../src/document";
import { PhotoCancelled, type Photo, type PhotoProgress, type PhotoRun } from "../src/photo/photo";
import { packBeadWord, type BeadMesh, type LoadedPrint, type PrintSource, type SlicedPrint } from "../src/print";
import type { Scene } from "../src/scene";
import type { ViewportLike } from "../src/ui/wire";
import type { ViewportEvents } from "../src/viewport/viewport";

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

// ---- print ----------------------------------------------------------------------

const RING_SEGMENTS = 32;
const TOWER_HEIGHT_MM = 30;
const TOWER_RADIUS_M = 0.018;

/** A hollow tube built layer by layer, so a finer layer height gives a visibly bigger mesh. */
function towerMesh(layerHeightMm: number): BeadMesh {
  const layers = Math.max(1, Math.round(TOWER_HEIGHT_MM / layerHeightMm));
  const verts = (layers + 1) * RING_SEGMENTS;
  const position = new Float32Array(verts * 3);
  const normal = new Int16Array(verts * 3);
  const tangent = new Int16Array(verts * 3);
  const word = new Float32Array(verts);
  for (let k = 0; k <= layers; k++) {
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const i = k * RING_SEGMENTS + s;
      const a = (s / RING_SEGMENTS) * Math.PI * 2;
      position.set([Math.cos(a) * TOWER_RADIUS_M, Math.sin(a) * TOWER_RADIUS_M, (k * layerHeightMm) / 1000], i * 3);
      normal.set([Math.round(Math.cos(a) * 32767), Math.round(Math.sin(a) * 32767), 0], i * 3);
      tangent.set([Math.round(-Math.sin(a) * 32767), Math.round(Math.cos(a) * 32767), 0], i * 3);
      word[i] = packBeadWord(0, k, 60);
    }
  }
  const index = new Uint32Array(layers * RING_SEGMENTS * 6);
  let n = 0;
  for (let k = 0; k < layers; k++) {
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const a = k * RING_SEGMENTS + s;
      const b = k * RING_SEGMENTS + ((s + 1) % RING_SEGMENTS);
      index.set([a, b, a + RING_SEGMENTS, b, b + RING_SEGMENTS, a + RING_SEGMENTS], n);
      n += 6;
    }
  }
  const top = (layers * layerHeightMm) / 1000;
  return {
    position, normal, tangent, word, index, tris: index.length / 3, layerCount: layers,
    layerHeightM: layerHeightMm / 1000, vRefMmS: 120,
    bboxM: { min: [-TOWER_RADIUS_M, -TOWER_RADIUS_M, 0], max: [TOWER_RADIUS_M, TOWER_RADIUS_M, top] },
  };
}

/** What a G-code file would report: its own slicing, not the booth's. */
const FILE_SETTINGS: SliceSettings = {
  layerHeight: mm(0.16), outerLineWidth: mm(0.42), innerLineWidth: mm(0.45),
  wallCount: 3, topShellLayers: 6, topSurfacePattern: "concentric", seamPosition: "back",
};

function loaded(source: PrintSource, settings: SliceSettings, settingsSource: SlicedPrint["settingsSource"]): LoadedPrint {
  const mesh = towerMesh(settings.layerHeight);
  const bed: BedType | null = settingsSource === "file" ? "textured-pei" : null;
  const sliced: SlicedPrint = {
    settings, settingsSource, layerHeightMm: settings.layerHeight,
    layerTimeS: Float32Array.from({ length: mesh.layerCount + 1 }, (_, k) => (k === 0 ? 0 : 6 + (k % 7))),
    layerFan: new Float32Array(mesh.layerCount + 1).fill(0.6),
    filamentName: settingsSource === "file" ? "PETG Basic" : null, bedFromFile: bed, note: null,
  };
  return { source, sliced, mesh, liteMesh: async () => mesh };
}

export interface PrintDelays { readonly stage: number; readonly slice: number; readonly reslice: number }
export const DEFAULT_PRINT_DELAYS: PrintDelays = { stage: 200, slice: 500, reslice: 1500 };

export class FakePrint implements PrintPort {
  readonly #delays: PrintDelays;
  #stl: PrintSource | null = null;

  constructor(delays: PrintDelays = DEFAULT_PRINT_DELAYS) {
    this.#delays = delays;
  }

  async open(src: PrintSource, settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    this.#stl = src.kind === "stl" ? src : null;
    onStage("reading");
    await sleep(this.#delays.stage);
    if (src.kind === "stl") {
      onStage("slicing");
      await sleep(this.#delays.slice);
    } else {
      onStage("parsing");
      await sleep(this.#delays.stage);
    }
    onStage("sweeping");
    await sleep(this.#delays.stage);
    return src.kind === "stl" ? loaded(src, settings, "booth") : loaded(src, FILE_SETTINGS, "file");
  }

  async reslice(settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    if (this.#stl === null) throw new Error("Only an STL can be re-sliced");
    onStage("slicing");
    await sleep(this.#delays.reslice);
    return loaded(this.#stl, settings, "booth");
  }

  dispose(): void {}
}

// ---- photo ----------------------------------------------------------------------

const TICK_MS = 200;
const TICKS = 20;
const PREVIEW_LONG_EDGE = 240;

function sized(scene: Scene, longEdge: number): { w: number; h: number } {
  const { width, height } = scene.film;
  const k = longEdge / Math.max(width, height);
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/** A gradient that grows from noisy to smooth, standing in for a render that refines. */
function paint(canvas: HTMLCanvasElement, noise: number): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, "#2b3441");
  g.addColorStop(1, "#d6a95c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#101418";
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height * 0.58, canvas.width * 0.22, canvas.height * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < noise * 400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
  }
}

const stamp = (): string => new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");

class FakeRun implements PhotoRun {
  readonly docRev: number;
  readonly result: Promise<Photo>;
  readonly #listeners = new Set<(p: PhotoProgress) => void>();
  readonly #scene: Scene;
  readonly #partName: string;
  #resolve: (photo: Photo) => void = () => {};
  #reject: (e: unknown) => void = () => {};
  #timer: ReturnType<typeof setInterval> | null = null;
  #tick = 0;
  #over = false;

  constructor(scene: Scene, partName: string) {
    this.#scene = scene;
    this.#partName = partName;
    this.docRev = scene.docRev;
    this.result = new Promise<Photo>((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    this.#emit({ state: "preparing", message: "Building the scene" });
    setTimeout(() => { this.#start(); }, 400);
  }

  onProgress(fn: (p: PhotoProgress) => void): () => void {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  }

  cancel(): void {
    if (this.#over) return;
    this.#over = true;
    this.#stop();
    this.#emit({ state: "cancelled" });
    this.#reject(new PhotoCancelled());
  }

  finishNow(): void {
    if (this.#over || this.#timer === null) return;
    this.#stop();
    void this.#develop();
  }

  #emit(p: PhotoProgress): void {
    for (const fn of [...this.#listeners]) fn(p);
  }

  #stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  #start(): void {
    if (this.#over) return;
    this.#timer = setInterval(() => { void this.#step(); }, TICK_MS);
  }

  async #step(): Promise<void> {
    this.#tick += 1;
    const { w, h } = sized(this.#scene, PREVIEW_LONG_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paint(canvas, 1 - this.#tick / TICKS);
    const image = await createImageBitmap(canvas);
    if (this.#over || this.#timer === null) return;
    const fraction = this.#tick / TICKS;
    this.#emit({ state: "rendering", fraction, image, etaS: ((TICKS - this.#tick) * TICK_MS) / 1000 });
    if (this.#tick >= TICKS) {
      this.#stop();
      await this.#develop();
    }
  }

  async #develop(): Promise<void> {
    this.#emit({ state: "developing" });
    await sleep(400);
    if (this.#over) return;
    const { w, h } = sized(this.#scene, 320);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    paint(canvas, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => { if (blob === null) reject(new Error("Could not encode the PNG")); else resolve(blob); }, "image/png");
    });
    if (this.#over) return;
    this.#over = true;
    const photo: Photo = {
      png, fileName: `${this.#partName}_${stamp()}.png`, width: this.#scene.film.width, height: this.#scene.film.height,
      samples: this.#scene.film.samples, targetSamples: this.#scene.film.samples, stoppedBy: { kind: "samples" },
      engine: "cycles", docRev: this.docRev,
    };
    this.#emit({ state: "done", photo });
    this.#resolve(photo);
  }
}

export const fakeTakePhoto = (scene: Scene, partName: string): PhotoRun => new FakeRun(scene, partName);

// ---- viewport -------------------------------------------------------------------

export interface StandInReadout {
  readonly docRev: number;
  readonly camera: { readonly distanceM: number; readonly focalMm: number; readonly fStop: number; readonly fovYDeg: number };
  readonly lights: readonly { readonly id: string; readonly kind: string; readonly powerW: number | null; readonly top: number | null }[];
  readonly hasPart: boolean;
  readonly text: string;
}

/**
 * Draws the compiled scene's camera numbers and light list as text, which is
 * all the panels need from a viewport: a Scene in, focus clicks out. The same
 * numbers are kept on `readout` for a test to read without parsing pixels.
 */
export class StandInViewport implements ViewportLike {
  readonly #canvas: HTMLCanvasElement;
  readonly #events: ViewportEvents;
  #focusTool = false;
  #scene: Scene | null = null;
  readout: StandInReadout | null = null;

  constructor(canvas: HTMLCanvasElement, events: ViewportEvents) {
    this.#canvas = canvas;
    this.#events = events;
    canvas.addEventListener("click", () => {
      if (this.#focusTool) events.onFocusPicked([0.004, -0.012, 0.02]);
    });
    new ResizeObserver(() => { this.#draw(); }).observe(canvas);
  }

  show(scene: Scene): void {
    this.#scene = scene;
    const { camera: c } = scene;
    const distanceM = Math.hypot(c.position[0] - c.target[0], c.position[1] - c.target[1], c.position[2] - c.target[2]);
    const lights = scene.lights.emitters.map((e) => ({
      id: e.id, kind: e.kind,
      powerW: e.kind === "area" ? e.powerW : null, top: e.kind === "scrim" ? e.topRadiance : null,
    }));
    const lines = [
      "Stand-in viewport (no GPU preview in this page)",
      `scene rev ${scene.docRev}${scene.part === null ? ", no part" : `, ${scene.part.mesh.tris} triangles`}`,
      `camera distance ${distanceM.toFixed(3)} m, focal ${c.focalMm} mm, f/${c.fStop}, fov ${((c.fovYRad * 180) / Math.PI).toFixed(1)} deg`,
      `film ${scene.film.width} x ${scene.film.height} px`,
      `lights on: ${lights.length}`,
      ...lights.map((l) => `  ${l.id.padEnd(12)} ${l.kind.padEnd(6)} ${l.powerW !== null ? `${l.powerW.toFixed(2)} W` : `top ${l.top?.toFixed(2)}`}`),
    ];
    this.readout = {
      docRev: scene.docRev,
      camera: { distanceM, focalMm: c.focalMm, fStop: c.fStop, fovYDeg: (c.fovYRad * 180) / Math.PI },
      lights, hasPart: scene.part !== null, text: lines.join("\n"),
    };
    this.#events.onStatus(`stand-in, rev ${scene.docRev}`);
    this.#draw();
  }

  setLiteMesh(): void {}

  setFocusTool(active: boolean): void {
    this.#focusTool = active;
    this.#canvas.dataset.focusTool = String(active);
    this.#draw();
  }

  #draw(): void {
    const canvas = this.#canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const g = ctx.createRadialGradient(cw / 2, ch * 0.45, 20, cw / 2, ch * 0.45, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, "#3a3e45");
    g.addColorStop(1, "#16181b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    if (this.#scene?.part) {
      ctx.fillStyle = "#e8e6e1";
      ctx.beginPath();
      ctx.ellipse(cw / 2, ch * 0.5, Math.min(cw, ch) * 0.1, Math.min(cw, ch) * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px ui-monospace, Menlo, monospace";
    const lines = this.readout?.text.split("\n") ?? [];
    lines.forEach((line, i) => { ctx.fillText(line, 16, ch - 16 - (lines.length - 1 - i) * 16); });
  }
}
