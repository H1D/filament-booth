/**
 * Dev page for the Cycles engine: renders a parity fixture through cyclesEngine() exactly as
 * PHOTO would, shows the passes as they arrive, and leaves results on window.__photo for
 * tools/parity/run.ts to read over the DevTools protocol.
 */
import { m } from "../src/document";
import type { RadianceFrame } from "../src/film";
import { cyclesEngine } from "../src/photo/cycles";
import type { RenderStats } from "../src/photo/cycles-worker";
import type { Scene } from "../src/scene";
import { compiledFixture, digestOf, isCompiledName } from "../tools/parity/compiled";
import { fixture, isFixtureName } from "../tools/parity/fixtures";

interface RunResult {
  readonly outcome: "done" | "rejected";
  readonly error?: string;
  readonly samples: number;
  readonly passes: number;
  readonly firstPassMs: number | null;
  readonly totalMs: number;
  readonly abortedAtMs: number | null;
  readonly abortedAtEpochMs: number | null;
  readonly settledAfterAbortMs: number | null;
  readonly mainThreadBlockMs: number;
  readonly maxTimerLagMs: number;
  readonly stats: RenderStats | null;
}

interface PhotoPage {
  state: "building" | "rendering" | "finished" | "failed";
  message: string;
  fits: string;
  buildMs: number;
  /** SHA-256 of the scene file (src/scene.ts exportScene) for a compiled fixture, else empty. */
  digest: string;
  triangles: number;
  width: number;
  height: number;
  transparent: boolean;
  runs: RunResult[];
  frame: RadianceFrame | null;
}

declare global {
  interface Window {
    __photo?: PhotoPage;
    /** Base64 of the final frame's float RGBA bytes [start, end). */
    __photoBytes?: (start: number, end: number) => string;
  }
}

const params = new URLSearchParams(location.search);
// draw=0 keeps the page's own canvas work off the main thread, so timer lag measures the engine.
const drawPasses = params.get("draw") !== "0";
const num = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
const status = document.getElementById("status");
const canvas = document.getElementById("preview");

function show(page: PhotoPage) {
  if (status) status.textContent = `${page.state}: ${page.message}\n${JSON.stringify(page.runs, null, 1)}`;
}

function draw(frame: RadianceFrame) {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(frame.width, frame.height);
  for (let i = 0; i < img.data.length; i++) {
    const v = Math.min(1, Math.max(0, frame.rgba[i]));
    img.data[i] = (i & 3) === 3 ? v * 255 : (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** The hand-built fixtures, or a compiled one from the G-code at `gcode=` (a path the dev server serves). */
async function build(name: string): Promise<{ scene: Scene; digest: string }> {
  const options = { width: num("width", 640), height: num("height", 400), samples: num("samples", 256) };
  if (isCompiledName(name)) {
    const url = params.get("gcode");
    if (!url) throw new Error(`fixture ${name} needs gcode=<url>`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const scene = await compiledFixture(name, await response.text(), options);
    return { scene, digest: await digestOf(scene) };
  }
  if (!isFixtureName(name)) throw new Error(`no fixture ${name}`);
  return { scene: variant(fixture(name, options)), digest: "" };
}

/**
 * Settings changed one at a time, to find what a render's time is made of:
 * adaptive (threshold, 0 is off), bounces (every bounce limit), filter (pixel
 * filter width), world (strength), mottle (noise amplitude), plate (0 drops the textured
 * plate's Voronoi and noise bump from the shader), aniso (anisotropy), zoom
 * (camera distance from its target, as a factor).
 */
function variant(scene: Scene): Scene {
  const has = (key: string) => params.has(key);
  const film = { ...scene.film };
  if (has("adaptive")) film.adaptiveThreshold = num("adaptive", 0);
  if (has("bounces")) {
    const b = num("bounces", 8);
    Object.assign(film, { maxBounces: b, diffuseBounces: b, glossyBounces: b, transmissionBounces: b });
  }
  if (has("filter")) film.filterWidthPx = num("filter", 1.5);
  const world = has("world") ? { ...scene.world, strength: num("world", 1) } : scene.world;
  let part = scene.part;
  if (part && has("mottle")) part = { ...part, material: { ...part.material, mottleAmp: num("mottle", 0) } };
  if (part && has("plate")) part = { ...part, material: { ...part.material, plate: { ...part.material.plate, textured: num("plate", 1) !== 0 } } };
  if (part && has("aniso")) part = { ...part, material: { ...part.material, anisotropy: num("aniso", 0) } };
  const k = num("zoom", 1), { position: p, target: t } = scene.camera;
  const camera = has("zoom")
    ? { ...scene.camera, position: [m(t[0] + (p[0] - t[0]) * k), m(t[1] + (p[1] - t[1]) * k), m(t[2] + (p[2] - t[2]) * k)] as const, focusDistanceM: scene.camera.focusDistanceM * k }
    : scene.camera;
  return { ...scene, film, world, part, camera };
}

async function main() {
  const name = params.get("fixture") ?? "a";
  const t0 = performance.now();
  const { scene, digest } = await build(name);
  const page: PhotoPage = {
    state: "building", message: name, fits: "", buildMs: performance.now() - t0, digest,
    triangles: scene.part ? scene.part.mesh.index.length / 3 : 0,
    width: scene.film.width, height: scene.film.height, transparent: scene.film.transparent, runs: [], frame: null,
  };
  window.__photo = page;
  let stats: RenderStats | null = null;
  const engine = cyclesEngine({ onStats: (s) => (stats = s) });
  const fits = await engine.fits(scene);
  page.fits = fits === true ? "yes" : fits.reason;

  const abort = params.get("abort");
  const abortAt = params.get("abortAt");
  for (let run = 0; run < num("repeat", 1); run++) {
    page.state = "rendering";
    page.message = `${name} run ${run + 1}`;
    show(page);
    stats = null;
    const controller = new AbortController();
    let passes = 0;
    let firstPassMs: number | null = null;
    let abortedAtMs: number | null = null;
    let abortedAtEpochMs: number | null = null;
    let maxLag = 0;
    let tick = performance.now();
    const lag = setInterval(() => {
      const now = performance.now();
      maxLag = Math.max(maxLag, now - tick - 10);
      tick = now;
    }, 10);
    const start = performance.now();
    const doAbort = () => {
      if (abortedAtMs !== null || !abort) return;
      abortedAtMs = performance.now() - start;
      abortedAtEpochMs = Date.now();
      controller.abort(abort);
    };
    const promise = engine.render(scene, (frame) => {
      passes++;
      firstPassMs ??= performance.now() - start;
      if (drawPasses) draw(frame);
      if (abortAt === "sampling") doAbort();
    }, controller.signal);
    const mainThreadBlockMs = performance.now() - start;
    if (abortAt === "bvh") setTimeout(doAbort, 1500);
    else if (abortAt && abortAt !== "sampling") setTimeout(doAbort, Number(abortAt));
    let result: RunResult;
    try {
      const frame = await promise;
      page.frame = frame;
      draw(frame);
      result = {
        outcome: "done", samples: frame.samples, passes, firstPassMs, totalMs: performance.now() - start, abortedAtMs, abortedAtEpochMs,
        settledAfterAbortMs: abortedAtMs === null ? null : performance.now() - start - abortedAtMs,
        mainThreadBlockMs, maxTimerLagMs: maxLag, stats,
      };
    } catch (error) {
      result = {
        outcome: "rejected", error: String(error), samples: 0, passes, firstPassMs, totalMs: performance.now() - start,
        abortedAtMs, abortedAtEpochMs, settledAfterAbortMs: abortedAtMs === null ? null : performance.now() - start - abortedAtMs,
        mainThreadBlockMs, maxTimerLagMs: maxLag, stats,
      };
    }
    clearInterval(lag);
    page.runs.push(result);
    show(page);
  }
  page.state = "finished";
  page.message = name;
  show(page);
}

window.__photoBytes = (start, end) => {
  const frame = window.__photo?.frame;
  if (!frame) return "";
  const bytes = new Uint8Array(frame.rgba.buffer, frame.rgba.byteOffset, frame.rgba.byteLength).subarray(start, end);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

main().catch((error: unknown) => {
  const page = window.__photo;
  if (page) {
    page.state = "failed";
    page.message = String(error);
    show(page);
  } else if (status) {
    status.textContent = String(error);
  }
});
