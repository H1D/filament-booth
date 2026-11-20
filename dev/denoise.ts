/**
 * Dev page for the denoiser: renders a parity fixture through cyclesEngine() as PHOTO would,
 * denoises the frame with src/photo/denoise.ts, and leaves both on window.__denoise for
 * tools/denoise/run.ts to read over the DevTools protocol.
 */
import type { RadianceFrame } from "../src/film";
import { cyclesEngine } from "../src/photo/cycles";
import { denoise } from "../src/photo/denoise";
import type { Scene } from "../src/scene";
import { compiledFixture, isCompiledName } from "../tools/parity/compiled";
import { fixture, isFixtureName } from "../tools/parity/fixtures";

interface DenoisePage {
  state: "rendering" | "denoising" | "finished" | "failed";
  message: string;
  width: number;
  height: number;
  samples: number;
  renderMs: number;
  denoiseMs: number;
  tiles: number;
  frame: RadianceFrame | null;
  denoised: Float32Array | null;
}

type Plane = "rgba" | "albedo" | "normal" | "denoised";

declare global {
  interface Window {
    __denoise?: DenoisePage;
    /** Base64 of a float plane's bytes [start, end). */
    __denoiseBytes?: (plane: Plane, start: number, end: number) => string;
  }
}

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
const status = document.getElementById("status");
const show = (page: DenoisePage) => {
  if (status) status.textContent = `${page.state}: ${page.message}`;
};

async function build(name: string): Promise<Scene> {
  const options = { width: num("width", 640), height: num("height", 400), samples: num("samples", 16) };
  if (isCompiledName(name)) {
    const url = params.get("gcode");
    if (!url) throw new Error(`fixture ${name} needs gcode=<url>`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return compiledFixture(name, await response.text(), options);
  }
  if (!isFixtureName(name)) throw new Error(`no fixture ${name}`);
  return fixture(name, options);
}

async function main() {
  const name = params.get("fixture") ?? "a";
  const scene = await build(name);
  const page: DenoisePage = {
    state: "rendering", message: name, width: scene.film.width, height: scene.film.height, samples: 0,
    renderMs: 0, denoiseMs: 0, tiles: 0, frame: null, denoised: null,
  };
  window.__denoise = page;
  show(page);
  const t0 = performance.now();
  const frame = await cyclesEngine().render(scene, () => {}, new AbortController().signal);
  page.renderMs = performance.now() - t0;
  page.frame = frame;
  page.samples = frame.samples;
  if (params.get("denoise") !== "0") {
    page.state = "denoising";
    show(page);
    const maxTile = params.get("maxTile");
    const result = await denoise(frame, maxTile ? { maxTilePixels: Number(maxTile) } : {});
    page.denoised = result.frame.rgba;
    page.denoiseMs = result.ms;
    page.tiles = result.tiles;
  }
  page.state = "finished";
  page.message = `${name}: ${frame.samples} samples in ${Math.round(page.renderMs)} ms, denoised in ${Math.round(page.denoiseMs)} ms over ${page.tiles} tiles`;
  show(page);
}

window.__denoiseBytes = (plane, start, end) => {
  const page = window.__denoise;
  const data = plane === "denoised" ? page?.denoised : page?.frame?.[plane];
  if (!data) return "";
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).subarray(start, end);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

main().catch((error: unknown) => {
  const page = window.__denoise;
  if (page) {
    page.state = "failed";
    page.message = String(error);
    show(page);
  } else if (status) {
    status.textContent = `failed: ${String(error)}`;
  }
});
