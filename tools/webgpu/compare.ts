/**
 * Parity and 1600x1600 real-part comparison runner for WebGPU vs Cycles Wasm and Native Blender 5.2.3.
 *
 *   bun tools/webgpu/compare.ts --parity [--fixtures a b c d p] [--samples 128] [--width 640] [--height 400] [--force-blender]
 *   bun tools/webgpu/compare.ts --realism [--samples 512] [--width 640] [--height 400] [--force-blender]
 *   bun tools/webgpu/compare.ts --compare-1600 [--gcode path] [--looks e f] [--force-blender]
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { AgxLook } from "../../src/document";
import { parseAgx, parseManifest, toneMapFrame, type AgxData } from "../../src/film";
import { exportScene, type Scene } from "../../src/scene";
import { enterGamescope, REPO, startSession } from "../e2e/session";
import { compiledFixture, isCompiledName, type CompiledName } from "../parity/compiled";
import { fixture, isFixtureName, realismFixture, type FixtureName } from "../parity/fixtures";
import { compare, decodePng, encodePng, sideBySide, standard, type Difference, type Rgba8 } from "../parity/image";

interface BenchResponse {
  readonly fixture: string;
  readonly engine: "webgpu" | "cycles";
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly transparent: boolean;
  readonly look: AgxLook;
  readonly renderMs: number;
  readonly denoiseMs: number;
  readonly denoiseTiles: number;
  readonly denoised: boolean;
  readonly denoiseError: string | null;
  readonly totalMs: number;
  readonly triangles: number;
  readonly webgpuStats: {
    readonly bvhMs: number;
    readonly uploadMs: number;
    readonly samplingMs: number;
    readonly readbackMs: number;
    readonly totalMs: number;
    readonly triangles: number;
    readonly nodes: number;
    readonly vramBytes: number;
    readonly bvhCached: boolean;
  } | null;
  readonly cyclesStats: {
    readonly syncMs: number;
    readonly bvhMs: number;
    readonly samplingMs: number;
    readonly snapshotMs: number;
    readonly heapBytes: number;
  } | null;
}

const BLENDER = process.env.BLENDER ?? join(homedir(), "apps/blender-5.2.3-linux-x64/blender");
const PARITY_OUT = join(REPO, "tools/webgpu/out/parity");
const REALISM_OUT = join(REPO, "tools/webgpu/out/realism");
const COMPARE_OUT = join(REPO, "tools/webgpu/out/1600");
const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(name);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const say = (line: string) => console.log(`@ ${line}`);
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));

const agxCache = new Map<AgxLook, AgxData>();
function loadAgxNode(look: AgxLook): AgxData {
  const cached = agxCache.get(look);
  if (cached) return cached;
  const lutDir = join(REPO, "public/lut");
  const manifest = parseManifest(JSON.parse(readFileSync(join(lutDir, "manifest.json"), "utf8")));
  const entry = manifest.looks[look];
  const lut = parseAgx(manifest, look, readFileSync(join(lutDir, manifest.base.file)), entry === null ? null : readFileSync(join(lutDir, entry.file)));
  agxCache.set(look, lut);
  return lut;
}

function developAgx(width: number, height: number, rgba: Float32Array, look: AgxLook, transparent: boolean): Rgba8 {
  const data = toneMapFrame({ width, height, samples: 0, rgba }, loadAgxNode(look));
  if (!transparent) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

function cropRgba(img: Rgba8, x0: number, y0: number, w: number, h: number): Rgba8 {
  const xStart = Math.max(0, Math.min(img.width - w, x0));
  const yStart = Math.max(0, Math.min(img.height - h, y0));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcOff = ((yStart + y) * img.width + xStart) * 4;
    data.set(img.data.subarray(srcOff, srcOff + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

function hstack(imgs: readonly Rgba8[], gap = 8): Rgba8 {
  const width = imgs.reduce((sum, im, i) => sum + im.width + (i > 0 ? gap : 0), 0);
  const height = imgs[0].height;
  const data = new Uint8Array(width * height * 4);
  data.fill(24);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  let xOff = 0;
  for (const im of imgs) {
    for (let y = 0; y < height; y++) {
      const dst = (y * width + xOff) * 4;
      const src = y * im.width * 4;
      data.set(im.data.subarray(src, src + im.width * 4), dst);
    }
    xOff += im.width + gap;
  }
  return { width, height, data };
}

function writeSceneDir(scene: Scene, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const file = exportScene(scene);
  for (const [name, data] of file.buffers) writeFileSync(join(dir, `${name}.bin`), new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  writeFileSync(join(dir, "scene.json"), file.json);
}

function runBlenderRender(scene: Scene, sceneDir: string, outPng: string, samples: number, view: "standard" | "film"): number {
  if (!existsSync(BLENDER)) throw new Error(`Blender not found at ${BLENDER}`);
  writeSceneDir(scene, sceneDir);
  const t0 = performance.now();
  const res = spawnSync(
    BLENDER,
    ["-b", "--factory-startup", "--python-exit-code", "1", "--debug-cycles", "--python", join(REPO, "tools/blender/render_scene.py"), "--", join(sceneDir, "scene.json"), outPng, "--bvh", "bvh2", "--samples", String(samples), "--view", view],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const match = res.stdout.match(/BOOTH_NATIVE build [\d.]+s render ([\d.]+)s/);
  if (res.status !== 0 || !match) throw new Error(`Blender failed (${res.status}):\n${res.stderr}\n${res.stdout}`);
  return Number(match[1]) * 1000 || performance.now() - t0;
}

async function pullPlane(page: Page, plane: "rgba" | "denoised", width: number, height: number): Promise<Float32Array> {
  const bytes = width * height * 16;
  const out = new Uint8Array(bytes);
  const CHUNK = 8 << 20;
  for (let start = 0; start < bytes; start += CHUNK) {
    const end = Math.min(bytes, start + CHUNK);
    const b64 = await page.evaluate(
      ([p, s, e]) => (window as unknown as { __webgpuBenchBytes?: (pl: string, a: number, b: number) => string }).__webgpuBenchBytes?.(p, s, e) ?? "",
      [plane, start, end] as const,
    );
    if (!b64) throw new Error(`missing float plane ${plane} from page`);
    out.set(Buffer.from(b64, "base64"), start);
  }
  return new Float32Array(out.buffer);
}

async function runOnPage(
  page: Page,
  req: {
    readonly fixture: string;
    readonly engine: "webgpu" | "cycles";
    readonly width: number;
    readonly height: number;
    readonly samples: number;
    readonly gcodeUrl?: string;
    readonly denoise?: boolean;
    readonly warmMutateLight?: boolean;
    readonly forceReset?: boolean;
  },
): Promise<{ res: BenchResponse; rgba: Float32Array }> {
  const res = await page.evaluate(async (r) => {
    const fn = (window as unknown as { __webgpuBenchRun?: (x: typeof r) => Promise<BenchResponse> }).__webgpuBenchRun;
    if (!fn) throw new Error("__webgpuBenchRun missing on page");
    return fn(r);
  }, req);
  if (req.denoise && !res.denoised) {
    say(`  warning: denoise fell back on ${req.fixture} (${req.engine}): ${res.denoiseError ?? "unknown"}`);
  }
  const rgba = await pullPlane(page, res.denoised ? "denoised" : "rgba", res.width, res.height);
  return { res, rgba };
}

function smooth5(img: Rgba8): Rgba8 {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = Math.min(img.height - 1, Math.max(0, y + dy));
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(img.width - 1, Math.max(0, x + dx));
          const o = (yy * img.width + xx) * 4;
          r += img.data[o + 0]; g += img.data[o + 1]; b += img.data[o + 2]; a += img.data[o + 3];
          cnt++;
        }
      }
      const d = (y * img.width + x) * 4;
      out[d + 0] = Math.round(r / cnt); out[d + 1] = Math.round(g / cnt); out[d + 2] = Math.round(b / cnt); out[d + 3] = Math.round(a / cnt);
    }
  }
  return { width: img.width, height: img.height, data: out };
}

async function runParity(): Promise<boolean> {
  mkdirSync(PARITY_OUT, { recursive: true });
  const fixturesIdx = argv.indexOf("--fixtures");
  const list: FixtureName[] = [];
  if (fixturesIdx >= 0) {
    for (let i = fixturesIdx + 1; i < argv.length && !argv[i].startsWith("--"); i++) {
      if (isFixtureName(argv[i])) list.push(argv[i] as FixtureName);
    }
  }
  if (list.length === 0) list.push("a", "b", "c", "d", "p");
  const width = Number(opt("--width", "640"));
  const height = Number(opt("--height", "400"));
  const samples = Number(opt("--samples", "512"));
  const refSamples = Number(opt("--ref-samples", String(samples)));
  const cyclesSamples = Number(opt("--cycles-samples", String(Math.min(samples, 128))));
  const forceBlender = hasFlag("--force-blender");

  const session = await startSession();
  const results: Record<string, unknown> = {};
  let allPass = true;

  try {
    const { page } = session;
    page.on("console", (m) => {
      if (m.type() === "error") say(`  console error: ${m.text()}`);
    });
    await page.goto(`${session.origin}/dev/webgpu.html`);
    await page.waitForFunction(() => Boolean((window as unknown as { __webgpuBenchRun?: unknown }).__webgpuBenchRun));

    for (const name of list) {
      say(`=== parity fixture ${name} (${width}x${height}, gpu ${samples} spp vs blender ${refSamples} spp, cycles ${cyclesSamples} spp) ===`);
      const blenderPng = join(PARITY_OUT, `${name}-blender-${refSamples}.png`);
      let blenderMs = 0;
      if (forceBlender || !existsSync(blenderPng)) {
        const scene = fixture(name, { width, height, samples: refSamples });
        blenderMs = runBlenderRender(scene, join(PARITY_OUT, `scene-${name}`), blenderPng, refSamples, "standard");
      }
      const blenderImg = decodePng(readFileSync(blenderPng));

      const cyRun = await runOnPage(page, { fixture: name, engine: "cycles", width, height, samples: cyclesSamples, forceReset: true });
      const cyImg = standard(width, height, cyRun.rgba, cyRun.res.transparent);
      writeFileSync(join(PARITY_OUT, `${name}-cycles.png`), encodePng(cyImg));

      const gpuRun = await runOnPage(page, { fixture: name, engine: "webgpu", width, height, samples, forceReset: true });
      const gpuImg = standard(width, height, gpuRun.rgba, gpuRun.res.transparent);
      writeFileSync(join(PARITY_OUT, `${name}-webgpu.png`), encodePng(gpuImg));

      const vsCycles: Difference = compare(gpuImg, cyImg);
      const vsBlender: Difference = compare(gpuImg, blenderImg);
      const vsBlenderSmooth: Difference = compare(smooth5(gpuImg), smooth5(blenderImg));
      writeFileSync(join(PARITY_OUT, `${name}-side_by_side-cycles.png`), encodePng(sideBySide(gpuImg, cyImg)));
      writeFileSync(join(PARITY_OUT, `${name}-side_by_side-blender.png`), encodePng(sideBySide(gpuImg, blenderImg)));

      const pass = vsBlenderSmooth.psnrDb >= 45 && vsBlenderSmooth.meanAbs < 1.0 && vsBlender.psnrDb >= 33;
      if (!pass) allPass = false;

      say(`  cycles (${cyclesSamples} spp): ${Math.round(cyRun.res.totalMs)} ms | webgpu (${samples} spp): ${Math.round(gpuRun.res.totalMs)} ms (bvh ${Math.round(gpuRun.res.webgpuStats?.bvhMs ?? 0)} ms, samp ${Math.round(gpuRun.res.webgpuStats?.samplingMs ?? 0)} ms)`);
      say(`  vs Cycles Wasm : PSNR ${fmt(vsCycles.psnrDb)} dB, mean |d| ${fmt(vsCycles.meanAbs, 3)}/255, alpha ${fmt(vsCycles.alphaMeanAbs, 3)}/255`);
      say(`  vs Native Blend: PSNR ${fmt(vsBlender.psnrDb)} dB, mean |d| ${fmt(vsBlender.meanAbs, 3)}/255, alpha ${fmt(vsBlender.alphaMeanAbs, 3)}/255 | 5x5 smooth: ${fmt(vsBlenderSmooth.psnrDb)} dB (${fmt(vsBlenderSmooth.meanAbs, 3)}/255) -> ${pass ? "PASS" : "FAIL"}`);

      results[name] = {
        cyclesMs: cyRun.res.totalMs,
        cyclesSamples,
        webgpuMs: gpuRun.res.totalMs,
        webgpuSamples: samples,
        refSamples,
        blenderMs,
        webgpuStats: gpuRun.res.webgpuStats,
        vsCycles,
        vsBlender,
        vsBlenderSmooth,
        pass,
      };
    }

    writeFileSync(join(PARITY_OUT, "metrics.json"), JSON.stringify(results, null, 2));
    return allPass;
  } finally {
    await session.close();
  }
}

async function runCompare1600(): Promise<boolean> {
  mkdirSync(COMPARE_OUT, { recursive: true });
  const defaultGcode = join(process.env.BOOTH_REF ?? join(homedir(), ".t3/scratch/lekv2-photoreal-ref"), "bsch04/sliced/plate_1.gcode");
  const gcodePath = opt("--gcode", defaultGcode);
  if (!existsSync(gcodePath)) throw new Error(`G-code not found at ${gcodePath}`);
  copyFileSync(gcodePath, join(COMPARE_OUT, "plate_1.gcode"));
  const gcodeText = readFileSync(gcodePath, "utf8");
  const gcodeUrl = "/tools/webgpu/out/1600/plate_1.gcode";

  const looksIdx = argv.indexOf("--looks");
  const looks: CompiledName[] = [];
  if (looksIdx >= 0) {
    for (let i = looksIdx + 1; i < argv.length && !argv[i].startsWith("--"); i++) {
      if (isCompiledName(argv[i])) looks.push(argv[i] as CompiledName);
    }
  }
  if (looks.length === 0) looks.push("e", "f");

  const width = Number(opt("--width", "1600"));
  const height = Number(opt("--height", "1600"));
  const forceBlender = hasFlag("--force-blender");

  const session = await startSession();
  const report: Record<string, unknown> = { gcodePath, width, height, looks: {} };

  try {
    const { page } = session;
    page.on("console", (m) => {
      if (m.type() === "error") say(`  console error: ${m.text()}`);
    });

    for (const look of looks) {
      say(`=== 1600x1600 comparison: look ${look} ===`);
      const blenderPng = join(COMPARE_OUT, `${look}-blender-128.png`);
      let blenderMs = 0;
      let triangles = 0;
      const compiledBase = await compiledFixture(look, gcodeText, { width, height, samples: 128 });
      const blenderScene: Scene = { ...compiledBase, film: { ...compiledBase.film, denoise: true } };
      triangles = blenderScene.part?.mesh.hidden
        ? blenderScene.part.mesh.hidden.reduce((acc, h) => acc + (h ? 0 : 1), 0)
        : (blenderScene.part?.mesh.tris ?? 0);

      if (forceBlender || !existsSync(blenderPng)) {
        say(`  rendering native Blender 5.2.3 128 spp for look ${look}...`);
        blenderMs = runBlenderRender(blenderScene, join(COMPARE_OUT, `scene-${look}`), blenderPng, 128, "film");
        say(`  Blender 128 spp finished in ${(blenderMs / 1000).toFixed(1)} s`);
      }
      const blenderImg = decodePng(readFileSync(blenderPng));

      // Fresh page per look reclaims GPU buffers + Cycles Wasm heaps cleanly.
      await page.goto(`${session.origin}/dev/webgpu.html`);
      await page.waitForFunction(() => Boolean((window as unknown as { __webgpuBenchRun?: unknown }).__webgpuBenchRun));

      const runs: {
        readonly key: string;
        readonly engine: "cycles" | "webgpu";
        readonly samples: number;
        readonly warm: boolean;
      }[] = [
        { key: "cycles-32-cold", engine: "cycles", samples: 32, warm: false },
        { key: "cycles-32-warm", engine: "cycles", samples: 32, warm: true },
        { key: "webgpu-32-cold", engine: "webgpu", samples: 32, warm: false },
        { key: "webgpu-32-warm", engine: "webgpu", samples: 32, warm: true },
        { key: "webgpu-128", engine: "webgpu", samples: 128, warm: true },
      ];

      const lookMetrics: Record<string, unknown> = { triangles, blenderMs };
      const imgs = new Map<string, Rgba8>();

      for (const r of runs) {
        say(`  running ${look} ${r.key} (${r.engine} ${r.samples} spp, warm=${r.warm})...`);
        const { res, rgba } = await runOnPage(page, {
          fixture: look,
          engine: r.engine,
          width,
          height,
          samples: r.samples,
          gcodeUrl,
          denoise: true,
          warmMutateLight: r.warm,
        });
        const img = developAgx(width, height, rgba, res.look, res.transparent);
        const pngPath = join(COMPARE_OUT, `${look}-${r.key}.png`);
        writeFileSync(pngPath, encodePng(img));
        imgs.set(r.key, img);

        const vsBlender = compare(img, blenderImg);
        say(
          `    total ${fmt(res.totalMs / 1000, 2)} s (render ${fmt(res.renderMs / 1000, 2)} s, denoise ${Math.round(res.denoiseMs)} ms) | vs Blender 128: PSNR ${fmt(vsBlender.psnrDb)} dB, mean |d| ${fmt(vsBlender.meanAbs, 3)}/255`,
        );

        lookMetrics[r.key] = {
          totalMs: res.totalMs,
          renderMs: res.renderMs,
          denoiseMs: res.denoiseMs,
          denoiseTiles: res.denoiseTiles,
          denoised: res.denoised,
          triangles: res.triangles,
          webgpuStats: res.webgpuStats,
          cyclesStats: res.cyclesStats,
          vsBlender128: vsBlender,
        };
      }

      const cy32 = imgs.get("cycles-32-cold")!;
      const gpu32 = imgs.get("webgpu-32-cold")!;
      const gpu128 = imgs.get("webgpu-128")!;
      writeFileSync(join(COMPARE_OUT, `${look}-sbs-cycles32-vs-blender128.png`), encodePng(sideBySide(cy32, blenderImg)));
      writeFileSync(join(COMPARE_OUT, `${look}-sbs-webgpu32-vs-blender128.png`), encodePng(sideBySide(gpu32, blenderImg)));
      writeFileSync(join(COMPARE_OUT, `${look}-sbs-webgpu128-vs-blender128.png`), encodePng(sideBySide(gpu128, blenderImg)));

      const cw = Math.min(400, width);
      const ch = Math.min(400, height);
      const cx = Math.floor((width - cw) / 2);
      const cy = Math.floor((height - ch) / 2);
      const cropCy32 = cropRgba(cy32, cx, cy, cw, ch);
      const cropGpu32 = cropRgba(gpu32, cx, cy, cw, ch);
      const cropGpu128 = cropRgba(gpu128, cx, cy, cw, ch);
      const cropBlend = cropRgba(blenderImg, cx, cy, cw, ch);
      writeFileSync(join(COMPARE_OUT, `${look}-crop-cycles32.png`), encodePng(cropCy32));
      writeFileSync(join(COMPARE_OUT, `${look}-crop-webgpu32.png`), encodePng(cropGpu32));
      writeFileSync(join(COMPARE_OUT, `${look}-crop-webgpu128.png`), encodePng(cropGpu128));
      writeFileSync(join(COMPARE_OUT, `${look}-crop-blender128.png`), encodePng(cropBlend));
      writeFileSync(join(COMPARE_OUT, `${look}-crop-strip.png`), encodePng(hstack([cropCy32, cropGpu32, cropGpu128, cropBlend])));

      (report.looks as Record<string, unknown>)[look] = lookMetrics;
    }

    writeFileSync(join(COMPARE_OUT, "metrics.json"), JSON.stringify(report, null, 2));
    return true;
  } finally {
    await session.close();
  }
}

async function runRealism(): Promise<boolean> {
  mkdirSync(REALISM_OUT, { recursive: true });
  const width = Number(opt("--width", "640"));
  const height = Number(opt("--height", "400"));
  const samples = Number(opt("--samples", "512"));
  const refSamples = Number(opt("--ref-samples", String(samples)));
  const cyclesSamples = Number(opt("--cycles-samples", String(Math.min(samples, 256))));
  const forceBlender = hasFlag("--force-blender");

  say(`=== realism parity (${width}x${height}, gpu ${samples} spp vs blender ${refSamples} spp, cycles ${cyclesSamples} spp) ===`);
  const blenderPng = join(REALISM_OUT, `realism-blender-${refSamples}.png`);
  let blenderMs = 0;
  if (forceBlender || !existsSync(blenderPng)) {
    const scene = realismFixture({ width, height, samples: refSamples });
    blenderMs = runBlenderRender(scene, join(REALISM_OUT, "scene-realism"), blenderPng, refSamples, "standard");
  }
  const blenderImg = decodePng(readFileSync(blenderPng));
  const blenderSmooth = smooth5(blenderImg);

  const session = await startSession();
  try {
    const { page } = session;
    page.on("console", (m) => {
      if (m.type() === "error") say(`  console error: ${m.text()}`);
    });
    await page.goto(`${session.origin}/dev/webgpu.html`);
    await page.waitForFunction(() => Boolean((window as unknown as { __webgpuBenchRun?: unknown }).__webgpuBenchRun));

    const cyRun = await runOnPage(page, { fixture: "realism", engine: "cycles", width, height, samples: cyclesSamples, forceReset: true });
    const cyImg = standard(width, height, cyRun.rgba, cyRun.res.transparent);
    writeFileSync(join(REALISM_OUT, "realism-cycles.png"), encodePng(cyImg));

    const gpuRun = await runOnPage(page, { fixture: "realism", engine: "webgpu", width, height, samples, forceReset: true });
    const gpuImg = standard(width, height, gpuRun.rgba, gpuRun.res.transparent);
    writeFileSync(join(REALISM_OUT, "realism-webgpu.png"), encodePng(gpuImg));

    const gpuVsCycles = compare(gpuImg, cyImg);
    const gpuVsBlender = compare(gpuImg, blenderImg);
    const gpuVsBlenderSmooth = compare(smooth5(gpuImg), blenderSmooth);
    const cyVsBlender = compare(cyImg, blenderImg);
    const cyVsBlenderSmooth = compare(smooth5(cyImg), blenderSmooth);

    writeFileSync(join(REALISM_OUT, "realism-sbs-webgpu-vs-blender.png"), encodePng(sideBySide(gpuImg, blenderImg)));
    writeFileSync(join(REALISM_OUT, "realism-sbs-webgpu-vs-cycles.png"), encodePng(sideBySide(gpuImg, cyImg)));
    writeFileSync(join(REALISM_OUT, "realism-sbs-cycles-vs-blender.png"), encodePng(sideBySide(cyImg, blenderImg)));

    const gpuPass = gpuVsBlenderSmooth.psnrDb >= 43 && gpuVsBlenderSmooth.meanAbs <= 1.1;
    const cyPass = cyVsBlenderSmooth.psnrDb >= 43 && cyVsBlenderSmooth.meanAbs <= 1.1;
    const pass = gpuPass && cyPass;

    say(`  cycles (${cyclesSamples} spp): ${Math.round(cyRun.res.totalMs)} ms | webgpu (${samples} spp): ${Math.round(gpuRun.res.totalMs)} ms (bvh ${Math.round(gpuRun.res.webgpuStats?.bvhMs ?? 0)} ms, samp ${Math.round(gpuRun.res.webgpuStats?.samplingMs ?? 0)} ms)`);
    say(`  cycles vs Blend: PSNR ${fmt(cyVsBlender.psnrDb)} dB, mean |d| ${fmt(cyVsBlender.meanAbs, 3)}/255 | 5x5 smooth: ${fmt(cyVsBlenderSmooth.psnrDb)} dB (${fmt(cyVsBlenderSmooth.meanAbs, 3)}/255) -> ${cyPass ? "PASS" : "FAIL"}`);
    say(`  gpu    vs CyWsm: PSNR ${fmt(gpuVsCycles.psnrDb)} dB, mean |d| ${fmt(gpuVsCycles.meanAbs, 3)}/255`);
    say(`  gpu    vs Blend: PSNR ${fmt(gpuVsBlender.psnrDb)} dB, mean |d| ${fmt(gpuVsBlender.meanAbs, 3)}/255 | 5x5 smooth: ${fmt(gpuVsBlenderSmooth.psnrDb)} dB (${fmt(gpuVsBlenderSmooth.meanAbs, 3)}/255) -> ${gpuPass ? "PASS" : "FAIL"}`);

    writeFileSync(
      join(REALISM_OUT, "metrics.json"),
      JSON.stringify({
        width, height, samples, refSamples, cyclesSamples,
        blenderMs, cyclesMs: cyRun.res.totalMs, webgpuMs: gpuRun.res.totalMs,
        webgpuStats: gpuRun.res.webgpuStats,
        cyVsBlender, cyVsBlenderSmooth,
        gpuVsCycles, gpuVsBlender, gpuVsBlenderSmooth,
        cyPass, gpuPass, pass,
      }, null, 2),
    );
    return pass;
  } finally {
    await session.close();
  }
}

async function inside(): Promise<boolean> {
  if (hasFlag("--compare-1600")) return runCompare1600();
  if (hasFlag("--realism")) return runRealism();
  return runParity();
}

const outer = await enterGamescope(import.meta.filename, argv);
if (outer === null) {
  let ok = false;
  try {
    ok = await inside();
  } catch (error: unknown) {
    say(`failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
  if (ok) say("ok");
  process.exit(0);
} else {
  process.exit(outer ? 0 : 1);
}
