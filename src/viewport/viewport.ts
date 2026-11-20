/**
 * viewport.ts: the live preview. three.js on WebGPU, WebGL2 as fallback.
 *
 * It owns everything ephemeral: the renderer, the pipelines (TRAA while
 * moving, a supersampled still after), the quality ladder and lite mesh
 * swap, the reflection bake and the crop frame. It owns no document state:
 * `show` could be called with the same scene forever and nothing would move.
 *
 * Frame rule: a Scene is Blender Z-up. This scene graph has one root group
 * with BLENDER_TO_VIEWER applied, holding part, sweep and light helpers.
 * That matrix is the only axis swap in the app.
 *
 * The preview approximates Cycles. Every shortcut is listed in
 * PREVIEW_APPROXIMATIONS so parity work argues from a list.
 */
import { RectAreaLightNode, TimestampQuery, Vector2, VSMShadowMap, WebGPURenderer } from "three/webgpu";
import { RectAreaLightTexturesLib } from "three/addons/lights/RectAreaLightTexturesLib.js";
import type { CameraSetup } from "../document";
import type { RadianceFrame } from "../film";
import type { BeadMesh } from "../print";
import type { Scene } from "../scene";
import { jitterSample, readMean } from "./accumulate";
import { HdrCache, StudioBake, type Baked, type BakeInput } from "./bake";
import { FocusTool } from "./focus";
import { cropRect, type Crop } from "./frame";
import { CameraRig } from "./orbit";
import { Pipelines, gpuName, isWebGpu } from "./pipelines";
import { looksSlow, QualityState, type QualitySetting } from "./quality";
import { Stage } from "./stage";

export const PREVIEW_APPROXIMATIONS = [
  "the part is lit by a cube map baked from emissive quads, not by shadowed direct light",
  "the backdrop and the props are lit by RectAreaLights in the bake plus one live shadow-casting key",
  "the part sees the props in its bake lit like the sweep, without shadows; props cast and receive only the key's shadow",
  "a spread under 180 degrees boosts baked radiance by 1 / sin^2(spread / 2); RectAreaLights ignore the cone",
  "the live key is a spot light at the card's centre: intensity P / (pi sin^2(spread / 2)), a smoothstep cone of half the spread",
  "GTAO at radius 0.03 m stands in for contact shadowing and bounce light",
  "BAKE_GAIN scales the baked emitters to match the Cycles reference stills",
  "a scrim lights the backdrop as a RectAreaLight of its mean radiance, and an ellipse as a rectangle of equal area",
  "layers under 1.5 px at rest (3 px moving) give up their profile normals for an anisotropic lobe across the path",
  "three.js's image-based anisotropy bends the normal; it is not Cycles' anisotropic GGX",
  "the plate's grain is a normal perturbation at the old viewer's slope, not a bump of bumpDistanceM",
  "per-layer sheen comes from the table, mottle from three's MaterialX noise, not Cycles' noise",
] as const;

export interface ViewportEvents {
  /** The user orbited or zoomed. Booth writes the numbers into the document. */
  onCameraEdited(camera: Pick<CameraSetup, "azimuth" | "elevation" | "distance" | "target">): void;
  /** A click with the focus tool: a part-local point. */
  onFocusPicked(partPoint: readonly [number, number, number]): void;
  /** Frame rate, quality level, refining. Display only. */
  onStatus(text: string): void;
}

/** Measurements for the dev page and its driver. Display only. */
export interface ViewportStats {
  readonly backend: "WebGPU" | "WebGL2";
  readonly fps: number;
  /** Mean GPU time of the last frames rendered, from timestamp queries; null without them. */
  readonly gpuMs: number | null;
  readonly quality: string;
  /** The still has all its samples, for the latest scene and its bake. */
  readonly converged: boolean;
  /** From a bake's request to its swap, the last one. */
  readonly lastBakeMs: number | null;
  readonly partBytes: number;
  readonly gpuMemory: { readonly attributes: number; readonly indices: number; readonly textures: number; readonly total: number };
}

// Live still. Measured vs 256: 99.9 % of pixels within 8/255; 64 halves that (Photo keeps 512).
const TRAA_FRAMES = 16, SAMPLES = 32;
const PASS_EVERY_MS = 1000;
const GPU_WINDOW = 30;
/** The document's default look, loaded before the first frame so the display never waits on it. */
const DEFAULT_LOOK = "medium-high-contrast";

/** The frame loop's counters: one owner, reset by `dirty`. */
class FrameState {
  still = 0;
  /** The last frame was not a plain moving frame, so the next interval is not a measurement. */
  gap = true;
  tLast = 0;
  frames = 0;
  fps = 0;
  dirty(): void { this.still = 0; }
  get settled(): boolean { return this.still >= TRAA_FRAMES + SAMPLES; }
}

/** A raster photo's hold on the renderer. */
interface Lease {
  readonly scene: Scene;
  readonly onPass: (frame: RadianceFrame, fraction: number) => void;
  readonly resolve: (frame: RadianceFrame) => void;
  readonly reject: (reason: unknown) => void;
  started: boolean;
  reading: boolean;
  ended: boolean;
  lastPassAt: number;
}

export class Viewport {
  readonly #renderer: WebGPURenderer;
  readonly #canvas: HTMLCanvasElement;
  readonly #events: ViewportEvents;
  readonly #stage = new Stage();
  readonly #rig: CameraRig;
  readonly #pipes: Pipelines;
  readonly #bake: StudioBake;
  readonly #hdrs = new HdrCache();
  readonly #quality: QualityState;
  readonly #frame = new FrameState();
  readonly #gpuMs: number[] = [];
  readonly #cleanup: (() => void)[] = [];
  #live: Scene | null = null;
  #applied: Scene | null = null;
  #bakedFor: BakeInput | null = null;
  #lastBakeMs: number | null = null;
  #crop: Crop = { x: 0, y: 0, width: 1, height: 1 };
  #baseRatio = 1;
  #qualityKey = "";
  readonly #focus: FocusTool;
  #lease: Lease | null = null;

  static async create(canvas: HTMLCanvasElement, events: ViewportEvents): Promise<Viewport> {
    const renderer = new WebGPURenderer({ canvas, antialias: false, trackTimestamp: true });
    await renderer.init();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = VSMShadowMap;
    renderer.setClearColor(0x000000, 0);
    RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    const viewport = new Viewport(renderer, canvas, events);
    await viewport.#pipes.display.setLook(DEFAULT_LOOK);
    return viewport;
  }

  private constructor(renderer: WebGPURenderer, canvas: HTMLCanvasElement, events: ViewportEvents) {
    this.#renderer = renderer;
    this.#canvas = canvas;
    this.#events = events;
    // A photo renders at its own aspect into this canvas; contain keeps it undistorted on screen.
    canvas.style.objectFit = "contain";
    this.#rig = new CameraRig(canvas, (o) => events.onCameraEdited(o), () => this.#frame.dirty());
    this.#pipes = new Pipelines(renderer, this.#stage.scene, this.#rig.camera);
    this.#bake = new StudioBake(renderer, (b) => this.#onBaked(b));
    this.#quality = new QualityState(looksSlow(gpuName(renderer), matchMedia("(pointer: coarse)").matches));
    const resize = new ResizeObserver(() => this.#fit());
    resize.observe(canvas);
    this.#cleanup.push(() => resize.disconnect());
    this.#focus = new FocusTool({
      canvas, renderer, stage: this.#stage, rig: this.#rig, busy: () => this.#lease !== null,
      onPicked: (p) => { events.onFocusPicked(p); this.#frame.dirty(); },
    });
    this.#cleanup.push(() => this.#focus.dispose());
    const status = setInterval(() => this.#reportStatus(), 500);
    this.#cleanup.push(() => clearInterval(status));
    this.#fit();
    void renderer.setAnimationLoop(() => this.#tick());
  }

  /**
   * Idempotent. Compares sections with `===`: new lights, backdrop, world or props
   * re-bake in the background while the stale bake stays up; a new material
   * updates uniforms and the layer texture; a new camera moves the controls
   * without echoing the same numbers back as an edit.
   */
  show(scene: Scene): void {
    this.#live = scene;
    if (this.#lease === null) this.#apply(scene, false);
  }

  /** The cheaper mesh shown only while moving on a slow GPU. Null clears it. */
  setLiteMesh(mesh: BeadMesh | null): void {
    this.#stage.setLite(mesh);
  }

  setFocusTool(active: boolean): void {
    this.#focus.active = active;
    this.#canvas.style.cursor = active ? "crosshair" : "";
    this.#frame.dirty();
  }

  /**
   * The raster photo engine's lease on the renderer: pauses the live loop,
   * renders `scene` at its film size with jittered samples (pixel filter,
   * aperture, soft key), returns the linear accumulator, and restores the
   * live state even on abort. Aborting with reason "finish" resolves with
   * the frame so far. Any other abort rejects. It must settle promptly after
   * an abort: the photo desk waits for it before starting the next photo.
   */
  accumulate(scene: Scene, onPass: (frame: RadianceFrame, fraction: number) => void, signal: AbortSignal): Promise<RadianceFrame> {
    if (this.#lease) return Promise.reject(new Error("the viewport is already accumulating a photo"));
    return new Promise<RadianceFrame>((resolve, reject) => {
      const lease: Lease = { scene, onPass, resolve, reject, started: false, reading: false, ended: false, lastPassAt: performance.now() };
      this.#lease = lease;
      const onAbort = () => void this.#endLease(lease, signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  get stats(): ViewportStats {
    const mem = this.#renderer.info.memory;
    const gpu = this.#gpuMs;
    return {
      backend: isWebGpu(this.#renderer) ? "WebGPU" : "WebGL2",
      fps: this.#frame.fps,
      gpuMs: gpu.length ? gpu.reduce((s, x) => s + x, 0) / gpu.length : null,
      quality: this.#quality.describe(),
      converged: this.#lease === null && this.#frame.settled && this.#bakeMatches(this.#applied) && !this.#bake.busy
        && this.#pipes.display.look === this.#applied?.film.look,
      lastBakeMs: this.#lastBakeMs,
      partBytes: this.#stage.partBytes,
      gpuMemory: { attributes: mem.attributesSize, indices: mem.indexAttributesSize, textures: mem.texturesSize, total: mem.total },
    };
  }

  dispose(): void {
    void this.#renderer.setAnimationLoop(null);
    if (this.#lease) void this.#endLease(this.#lease, new Error("the viewport was disposed"));
    for (const c of this.#cleanup) c();
    this.#rig.dispose();
    this.#bake.dispose();
    this.#hdrs.dispose();
    this.#pipes.dispose();
    this.#stage.dispose();
    this.#renderer.dispose();
  }

  // ---- scene -------------------------------------------------------------------

  /** `exact` places the camera without echo handling, for a photo. */
  #apply(scene: Scene, exact: boolean): void {
    const prev = this.#applied;
    if (prev === scene) return;
    this.#applied = scene;
    const stage = this.#stage;
    if (prev?.part !== scene.part) stage.setPart(scene.part);
    if (prev?.lights !== scene.lights) stage.setLights(scene.lights);
    if (prev?.backdrop !== scene.backdrop) stage.setBackdrop(scene.backdrop);
    if (prev?.props !== scene.props) stage.setProps(scene.props);
    if (prev?.film !== scene.film) {
      this.#pipes.display.setLook(scene.film.look).then(() => this.#frame.dirty(), (err: unknown) =>
        this.#events.onStatus(`could not load the AgX tables: ${err instanceof Error ? err.message : String(err)}`));
      this.#pipes.display.transparent.value = scene.film.transparent ? 1 : 0;
    }
    if (exact) this.#rig.hold(scene.camera);
    else if (prev?.camera !== scene.camera) this.#rig.apply(scene.camera);
    if (prev?.film !== scene.film || prev?.camera !== scene.camera) this.#frameCanvas();
    if (prev?.lights !== scene.lights || prev?.backdrop !== scene.backdrop || prev?.world !== scene.world || prev?.props !== scene.props) this.#requestBake(scene);
    if (prev?.part !== scene.part) stage.recastShadow();
    this.#frame.dirty();
  }

  #requestBake(scene: Scene): void {
    const { lights, backdrop, world, props } = scene;
    this.#hdrs.load(world.hdrId).then((hdr) => {
      const now = this.#applied;
      if (!now || now.lights !== lights || now.backdrop !== backdrop || now.world !== world || now.props !== props) return;
      this.#stage.setWorld(hdr, world);
      this.#bake.request({ lights, backdrop, world, props, hdr });
    }, (err: unknown) => this.#events.onStatus(`could not load the world HDR: ${err instanceof Error ? err.message : String(err)}`));
  }

  #onBaked(b: Baked): void {
    this.#stage.setEnvironments(b.studio, b.world);
    this.#bakedFor = b.input;
    this.#lastBakeMs = performance.now() - b.requestedAt;
    this.#frame.dirty();
  }

  #bakeMatches(scene: Scene | null): boolean {
    const b = this.#bakedFor;
    return scene !== null && b !== null && b.lights === scene.lights && b.backdrop === scene.backdrop && b.world === scene.world
      && b.props === scene.props;
  }

  // ---- frame loop --------------------------------------------------------------

  #tick(): void {
    if (this.#lease) {
      this.#leaseStep(this.#lease);
      return;
    }
    this.#rig.controls.update();
    const f = this.#frame;
    if (!this.#stage.ready || f.settled) {
      f.gap = true;
      return;
    }
    this.#focus.place(this.#applied);
    if (f.still < TRAA_FRAMES) this.#movingFrame();
    else this.#stillSample(f.still - TRAA_FRAMES);
    f.still++;
    f.frames++;
    this.#timeGpu();
  }

  #movingFrame(): void {
    const f = this.#frame, q = this.#quality;
    const t = performance.now(); // not rAF's timestamp: that can stay put while WebGL blocks on the GPU
    if (!f.gap) q.adapt(t - f.tLast);
    f.tLast = t;
    f.gap = this.#applyQuality(q.setting(true)); // a resize or a first-drawn mesh makes this frame slow: don't measure it
    this.#stage.shading.motionAA.value = 1;
    const size = this.#renderer.getDrawingBufferSize(new Vector2());
    this.#pipes.moving(size.x, size.y);
    this.#stage.useLite(false); // nothing else sees the lite mesh
  }

  #stillSample(n: number): void {
    const f = this.#frame;
    f.gap = true;
    if (n === 0) {
      this.#stage.recastShadow(); // the moving view may have cast it from the lite mesh
      if (this.#applyQuality(this.#quality.setting(false))) this.#pipes.redisplay(); // back to full size cleared the canvas
    }
    this.#stage.shading.motionAA.value = 0;
    const size = this.#renderer.getDrawingBufferSize(new Vector2());
    this.#rig.jitter(jitterSample(n), size.x, size.y, true);
    this.#pipes.sample(n === 0, n >= SAMPLES - 1); // the TRAA frame stays on screen until the still is in
    this.#rig.release();
  }

  /** This frame's level; true when something that costs a frame changed. */
  #applyQuality(q: QualitySetting): boolean {
    const r = this.#renderer;
    const ratio = this.#baseRatio * q.renderScale;
    if (r.getPixelRatio() !== ratio) r.setPixelRatio(ratio);
    this.#pipes.ao.resolutionScale = q.aoScale;
    const lite = this.#stage.useLite(q.lite);
    const key = `${ratio} ${q.aoScale} ${q.lite && this.#stage.liteAvailable} ${this.#canvas.clientWidth}x${this.#canvas.clientHeight}`;
    const changed = key !== this.#qualityKey || lite;
    this.#qualityKey = key;
    return changed;
  }

  #fit(): void {
    if (this.#lease) return; // the lease ends with a fit
    const r = this.#renderer, w = Math.max(1, this.#canvas.clientWidth), h = Math.max(1, this.#canvas.clientHeight);
    this.#baseRatio = Math.min(devicePixelRatio, 2);
    r.setPixelRatio(this.#baseRatio);
    r.setSize(w, h, false);
    const size = r.getDrawingBufferSize(new Vector2());
    this.#pipes.accumulator.setSize(size.x, size.y);
    this.#frameCanvas();
    this.#frame.dirty();
  }

  #frameCanvas(): void {
    const w = Math.max(1, this.#canvas.clientWidth), h = Math.max(1, this.#canvas.clientHeight);
    const film = this.#applied?.film;
    this.#crop = film ? cropRect(w, h, film.width, film.height) : { x: 0, y: 0, width: w, height: h };
    const c = this.#crop;
    this.#pipes.display.crop.value.set(c.x / w, c.y / h, (c.x + c.width) / w, (c.y + c.height) / h);
    this.#rig.frameCanvas(w, h, c);
  }

  #reportStatus(): void {
    const f = this.#frame;
    f.fps = f.frames * 2;
    f.frames = 0;
    const lease = this.#lease;
    const refining = !f.settled && f.still >= TRAA_FRAMES ? ` · refining ${f.still - TRAA_FRAMES}/${SAMPLES}` : "";
    const wantsLite = this.#quality.lite && !this.#stage.liteAvailable ? " · lite mesh wanted" : "";
    this.#events.onStatus(lease ? "photo" : f.fps ? `${f.fps} fps · ${this.#quality.describe()}${refining}${wantsLite}` : "idle");
  }

  #timeGpu(): void {
    const b = this.#renderer.backend;
    if (!("trackTimestamp" in b) || b.trackTimestamp !== true) return;
    this.#renderer.resolveTimestampsAsync(TimestampQuery.RENDER).then((ms) => {
      if (ms === undefined) return;
      this.#gpuMs.push(ms);
      if (this.#gpuMs.length > GPU_WINDOW) this.#gpuMs.shift();
    }, () => {});
  }

  // ---- photo lease -------------------------------------------------------------

  #leaseStep(lease: Lease): void {
    if (lease.ended || lease.reading) return;
    const film = lease.scene.film;
    if (!lease.started) {
      lease.started = true;
      this.#rig.controls.enabled = false;
      this.#stage.hideMarker();
      this.#apply(lease.scene, true);
      const r = this.#renderer;
      r.setPixelRatio(1);
      r.setSize(film.width, film.height, false);
      this.#pipes.accumulator.setSize(film.width, film.height);
      this.#rig.frameFilm(lease.scene.camera, film.width, film.height);
      this.#pipes.display.crop.value.set(0, 0, 1, 1);
      this.#pipes.ao.resolutionScale = 1;
      this.#stage.useLite(false);
      this.#stage.shading.motionAA.value = 0;
    }
    if (!this.#bakeMatches(lease.scene)) return; // the photo's own lights are still baking
    const acc = this.#pipes.accumulator, n = acc.count;
    const j = jitterSample(n);
    this.#stage.softKey(j.key); // a soft shadow: the key wanders over its softbox
    this.#rig.jitter(j, film.width, film.height, true);
    this.#pipes.sample(n === 0, true);
    this.#rig.release();
    this.#frame.frames++;
    const total = Math.max(1, film.samples);
    if (acc.count >= total) {
      void this.#endLease(lease, "finish");
    } else if (acc.count === 1 || performance.now() - lease.lastPassAt >= PASS_EVERY_MS) {
      lease.reading = true;
      readMean(this.#renderer, this.#pipes.accumulator, !isWebGpu(this.#renderer)).then((frame) => {
        lease.reading = false;
        lease.lastPassAt = performance.now();
        if (!lease.ended) lease.onPass(frame, frame.samples / total);
      }, (err: unknown) => void this.#endLease(lease, err));
    }
  }

  async #endLease(lease: Lease, reason: unknown): Promise<void> {
    if (lease.ended) return;
    lease.ended = true;
    try {
      if (reason === "finish" && this.#pipes.accumulator.count > 0) {
        const frame = await readMean(this.#renderer, this.#pipes.accumulator, !isWebGpu(this.#renderer));
        lease.onPass(frame, frame.samples / Math.max(1, lease.scene.film.samples));
        lease.resolve(frame);
      } else {
        lease.reject(reason === "finish" ? new Error("the photo was finished before its first sample") : reason);
      }
    } catch (err) {
      lease.reject(err);
    } finally {
      this.#restoreAfterLease(lease);
    }
  }

  #restoreAfterLease(lease: Lease): void {
    if (this.#lease !== lease) return;
    this.#lease = null;
    this.#stage.softKey(null);
    this.#rig.controls.enabled = true;
    if (lease.started) {
      this.#fit();
      if (this.#live) this.#apply(this.#live, true);
      this.#stage.recastShadow();
    }
    this.#frame.dirty();
  }

}
