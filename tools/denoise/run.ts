/**
 * The WebGPU denoiser against Intel's own OIDN, on a real Cycles render.
 *
 *   bun tools/denoise/run.ts [a|b|c|d|e|f|g] [--width 640] [--height 400] [--samples 16] [--ref 1024]
 *                            [--maxTile 120000] [--gcode file] [--oidn path/to/oidnDenoise]
 *
 * In a hardware-GPU Chromium (tools/e2e/session.ts), dev/denoise.html renders the fixture with
 * Cycles at --samples and denoises it on WebGPU, once whole and once in tiles of at most
 * --maxTile pixels. The noisy colour, albedo and normal go through oidnDenoise (OIDN 2.5, the
 * version Blender 5.2.3 ships, default quality) as PFM files. Prints:
 *   - ours against OIDN: PSNR of the two after AgX, worst pixel, relative error in linear light;
 *   - tiled against whole, in linear light (the tiling should change nothing);
 *   - against a --ref sample render: PSNR of the noisy and of the denoised frame.
 * Writes AgX PNGs of every frame to tools/denoise/out/. --ref 0 skips the reference.
 * OIDN_DENOISE overrides the oidnDenoise binary.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { parseAgx, parseManifest, toneMapFrame, type RadianceFrame } from "../../src/film";
import { compare, encodePng, sideBySide, type Rgba8 } from "../parity/image";
import { enterGamescope, REPO, startSession } from "../e2e/session";

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const fixtureName = argv.find((a) => /^[a-g]$/.test(a)) ?? "a";
const width = Number(opt("--width", "640"));
const height = Number(opt("--height", "400"));
const samples = Number(opt("--samples", "16"));
const refSamples = Number(opt("--ref", "1024"));
const maxTile = Number(opt("--maxTile", "120000"));
const OIDN = process.env.OIDN_DENOISE ?? opt("--oidn", join(homedir(), ".t3/scratch/oidn/bin-dl/oidn-2.5.0.x86_64.linux/bin/oidnDenoise"));
const OUT = join(REPO, "tools/denoise/out");
const say = (line: string) => console.log(`@ ${line}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- files --------------------------------------------------------------------------------

/** RGB PFM, bottom row first, little endian, from top-row-first RGBA. */
function writePfm(path: string, w: number, h: number, rgba: Float32Array): void {
  const header = new TextEncoder().encode(`PF\n${w} ${h}\n-1.0\n`);
  const data = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4;
      const d = (y * w + x) * 3;
      data[d] = rgba[s];
      data[d + 1] = rgba[s + 1];
      data[d + 2] = rgba[s + 2];
    }
  }
  const out = new Uint8Array(header.length + data.byteLength);
  out.set(header);
  out.set(new Uint8Array(data.buffer), header.length);
  writeFileSync(path, out);
}

/** An RGB PFM as top-row-first RGBA with the given alpha. */
function readPfm(path: string, alpha: Float32Array): RadianceFrame & { rgba: Float32Array } {
  const bytes = readFileSync(path);
  let pos = 0;
  const token = () => {
    while (/\s/.test(String.fromCharCode(bytes[pos]))) pos++;
    const start = pos;
    while (!/\s/.test(String.fromCharCode(bytes[pos]))) pos++;
    return bytes.subarray(start, pos).toString();
  };
  if (token() !== "PF") throw new Error(`${path}: not an RGB PFM`);
  const w = Number(token());
  const h = Number(token());
  const scale = Number(token());
  pos++;
  const view = new DataView(bytes.buffer, bytes.byteOffset + pos, w * h * 12);
  const rgba = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 12;
      const d = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) rgba[d + c] = view.getFloat32(s + c * 4, scale < 0);
      rgba[d + 3] = alpha[d + 3];
    }
  }
  return { width: w, height: h, samples: 0, rgba };
}

// ---- the page ----------------------------------------------------------------------------

interface PageResult {
  readonly samples: number;
  readonly renderMs: number;
  readonly denoiseMs: number;
  readonly tiles: number;
  readonly rgba: Float32Array;
  readonly albedo: Float32Array | null;
  readonly normal: Float32Array | null;
  readonly denoised: Float32Array | null;
}

async function plane(page: Page, which: string, bytes: number): Promise<Float32Array | null> {
  const out = new Uint8Array(bytes);
  const CHUNK = 8 << 20;
  for (let start = 0; start < bytes; start += CHUNK) {
    const b64 = await page.evaluate(([p, s, e]) => window.__denoiseBytes?.(p as "rgba", Number(s), Number(e)) ?? "", [which, start, Math.min(bytes, start + CHUNK)] as const);
    if (b64 === "") return null;
    out.set(Buffer.from(b64, "base64"), start);
  }
  return new Float32Array(out.buffer);
}

async function run(page: Page, origin: string, query: string): Promise<PageResult> {
  const url = `${origin}/dev/denoise.html?fixture=${fixtureName}&width=${width}&height=${height}&${query}&gcode=/tools/denoise/out/print.gcode`;
  await page.goto(url);
  for (;;) {
    await sleep(500);
    const state = await page.evaluate(() => {
      const p = window.__denoise;
      return p ? { state: p.state, message: p.message, samples: p.samples, renderMs: p.renderMs, denoiseMs: p.denoiseMs, tiles: p.tiles } : null;
    });
    if (state?.state === "failed") throw new Error(state.message);
    if (state?.state !== "finished") continue;
    say(`  ${state.message}`);
    const bytes = width * height * 16;
    const rgba = await plane(page, "rgba", bytes);
    if (!rgba) throw new Error("the page has no frame");
    return { ...state, rgba, albedo: await plane(page, "albedo", bytes), normal: await plane(page, "normal", bytes), denoised: await plane(page, "denoised", bytes) };
  }
}

// ---- comparing ---------------------------------------------------------------------------

const LUT = join(REPO, "public/lut");
const manifest = parseManifest(JSON.parse(readFileSync(join(LUT, "manifest.json"), "utf8")));
const look = "medium-high-contrast";
const entry = manifest.looks[look];
const lut = parseAgx(manifest, look, readFileSync(join(LUT, manifest.base.file)), entry === null ? null : readFileSync(join(LUT, entry.file)));

function developed(rgba: Float32Array): Rgba8 {
  const data = toneMapFrame({ width, height, samples: 0, rgba }, lut);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data: new Uint8Array(data.buffer) };
}

/** Largest |a - b| / max(|b|, floor) over the colour channels, and the RMS of a - b over the RMS of b. */
function linear(a: Float32Array, b: Float32Array, floor = 1e-3): { worst: number; rel: number } {
  let worst = 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    if ((i & 3) === 3) continue;
    const d = a[i] - b[i];
    worst = Math.max(worst, Math.abs(d) / Math.max(Math.abs(b[i]), floor));
    num += d * d;
    den += b[i] * b[i];
  }
  return { worst, rel: Math.sqrt(num / den) };
}

/** The largest 8-bit channel difference. */
function worst8(a: Rgba8, b: Rgba8): number {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) if ((i & 3) !== 3) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
  return worst;
}

const fmt = (x: number, digits = 2) => (Number.isFinite(x) ? x.toFixed(digits) : String(x));

async function inside(): Promise<boolean> {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(OIDN)) throw new Error(`no oidnDenoise at ${OIDN}; set OIDN_DENOISE`);
  const gcode = opt("--gcode", process.env.BOOTH_REF ? join(process.env.BOOTH_REF, "bsch04/sliced/plate_1.gcode") : join(REPO, "tests/fixtures/mini.gcode"));
  copyFileSync(existsSync(gcode) ? gcode : join(REPO, "tests/fixtures/mini.gcode"), join(OUT, "print.gcode"));
  const session = await startSession();
  try {
    const { page } = session;
    page.on("console", (m) => {
      if (m.type() === "error") say(`  console: ${m.text()}`);
    });
    say(`fixture ${fixtureName}, ${width} x ${height}, ${samples} samples`);
    const whole = await run(page, session.origin, `samples=${samples}`);
    const tiled = await run(page, session.origin, `samples=${samples}&maxTile=${maxTile}`);
    if (!whole.albedo || !whole.normal || !whole.denoised || !tiled.denoised) throw new Error("the page did not return guides and a denoised frame");

    writePfm(join(OUT, "color.pfm"), width, height, whole.rgba);
    writePfm(join(OUT, "albedo.pfm"), width, height, whole.albedo);
    writePfm(join(OUT, "normal.pfm"), width, height, whole.normal);
    const t0 = performance.now();
    const oidnRun = spawnSync(OIDN, ["--hdr", join(OUT, "color.pfm"), "--alb", join(OUT, "albedo.pfm"), "--nrm", join(OUT, "normal.pfm"), "-o", join(OUT, "oidn.pfm"), "-v", "2"], { encoding: "utf8" });
    if (oidnRun.status !== 0) throw new Error(`oidnDenoise failed: ${oidnRun.stderr}${oidnRun.stdout}`);
    say(`  oidnDenoise (CPU) in ${Math.round(performance.now() - t0)} ms`);
    const oidn = readPfm(join(OUT, "oidn.pfm"), whole.rgba);

    const ours = developed(whole.denoised);
    const theirs = developed(oidn.rgba);
    const noisy = developed(whole.rgba);
    writeFileSync(join(OUT, "noisy.png"), encodePng(noisy));
    writeFileSync(join(OUT, "ours.png"), encodePng(ours));
    writeFileSync(join(OUT, "oidn.png"), encodePng(theirs));
    writeFileSync(join(OUT, "noisy_ours.png"), encodePng(sideBySide(noisy, ours)));

    const vsOidn = compare(ours, theirs);
    const lin = linear(whole.denoised, oidn.rgba);
    say(`ours against OIDN after AgX: PSNR ${fmt(vsOidn.psnrDb)} dB, mean ${fmt(vsOidn.meanAbs, 3)}/255, ${fmt(vsOidn.over4 * 100)} % over 4/255, worst ${worst8(ours, theirs)}/255`);
    say(`ours against OIDN in linear light: relative RMS ${lin.rel.toExponential(2)}, worst ${lin.worst.toExponential(2)}`);
    const sameInput = linear(tiled.rgba, whole.rgba, 1e-6).worst === 0;
    const tiles = linear(tiled.denoised, whole.denoised);
    say(`tiled (${tiled.tiles} tiles) against whole (${whole.tiles}): same input ${sameInput}, relative RMS ${tiles.rel.toExponential(2)}, worst ${tiles.worst.toExponential(2)}`);

    if (refSamples > 0) {
      const ref = await run(page, session.origin, `samples=${refSamples}&denoise=0`);
      const reference = developed(ref.rgba);
      writeFileSync(join(OUT, `reference_${refSamples}.png`), encodePng(reference));
      const before = compare(noisy, reference);
      const after = compare(ours, reference);
      say(`against ${ref.samples} samples: noisy ${fmt(before.psnrDb)} dB, denoised ${fmt(after.psnrDb)} dB`);
    }
    return vsOidn.psnrDb >= 45 && sameInput && tiles.worst < 1e-3;
  } finally {
    await session.close();
  }
}

const outer = await enterGamescope(import.meta.filename, argv);
if (outer === null) {
  try {
    if (await inside()) say("ok");
  } catch (error) {
    say(`failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
  process.exit(0);
} else {
  process.exit(outer ? 0 : 1);
}
