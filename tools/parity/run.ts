/**
 * Parity, scale and cancel checks for the Cycles photo engine.
 *
 *   bun tools/parity/run.ts [a b c d] [--samples 256] [--width 640] [--height 400] [--bvh bvh2|embree]
 *       Each fixture renders in headless Chromium through dev/photo.html and cyclesEngine(), and
 *       in native Blender through tools/blender/render_scene.py, both with the Standard view
 *       transform. Prints PSNR, mean absolute difference and the share of pixels more than
 *       4/255 apart; writes browser.png, blender.png and side_by_side.png per fixture.
 *   bun tools/parity/run.ts --scale [--samples 64] [--width 1280] [--height 720]
 *       The 10-million-triangle fixture twice in one page: build, render, heap.
 *   bun tools/parity/run.ts --cancel
 *       Cancel during sampling and during the BVH build, with Chromium's CPU use afterwards.
 *
 * Output goes to tools/parity/out/. BLENDER overrides the Blender binary.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, record, REPO, startVite } from "./browser";
import { fixture, isFixtureName, type FixtureName } from "./fixtures";
import { compare, decodePng, encodePng, sideBySide, standard, type Difference } from "./image";
import { writeScene } from "./scene-json";

const BLENDER = process.env.BLENDER ?? `${process.env.HOME}/apps/blender-5.2.3-linux-x64/blender`;
const OUT = join(REPO, "tools/parity/out");
const argv = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- reading the page --------------------------------------------------------------------

const num = (v: unknown) => (typeof v === "number" ? v : NaN);

interface Run {
  readonly outcome: string;
  readonly error: string;
  readonly samples: number;
  readonly totalMs: number;
  readonly firstPassMs: number;
  readonly passes: number;
  readonly mainThreadBlockMs: number;
  readonly maxTimerLagMs: number;
  readonly settledAfterAbortMs: number;
  readonly abortedAtEpochMs: number;
  readonly stats: Record<string, number>;
}

function readRun(v: unknown): Run {
  const r = record(v);
  const stats = r.stats === null ? {} : Object.fromEntries(Object.entries(record(r.stats)).map(([k, x]) => [k, num(x)]));
  return {
    outcome: String(r.outcome), error: String(r.error ?? ""), samples: num(r.samples), totalMs: num(r.totalMs),
    firstPassMs: num(r.firstPassMs), passes: num(r.passes), mainThreadBlockMs: num(r.mainThreadBlockMs),
    maxTimerLagMs: num(r.maxTimerLagMs), settledAfterAbortMs: num(r.settledAfterAbortMs),
    abortedAtEpochMs: num(r.abortedAtEpochMs), stats,
  };
}

interface PageResult {
  readonly fits: string;
  readonly buildMs: number;
  readonly triangles: number;
  readonly runs: Run[];
}

async function openPage(browser: Browser, url: string, runs: number, onSettled?: () => Promise<void>): Promise<PageResult> {
  await browser.navigate(url);
  const t0 = performance.now();
  let settled = 0;
  for (;;) {
    await sleep(100);
    const raw = await browser.evaluate(
      "window.__photo ? JSON.stringify({ ...window.__photo, frame: null }) : document.getElementById('status')?.textContent ?? ''",
    );
    const text = typeof raw === "string" ? raw : "";
    if (!text.startsWith("{")) {
      if (performance.now() - t0 > 60_000) throw new Error(`page did not start: ${text}\n${browser.console.join("\n")}`);
      continue;
    }
    const page = record(JSON.parse(text));
    if (page.state === "failed") throw new Error(`page failed: ${String(page.message)}\n${browser.console.join("\n")}`);
    const done = Array.isArray(page.runs) ? page.runs.length : 0;
    if (done > settled && onSettled) await onSettled();
    settled = done;
    if (page.state === "finished" && done === runs) {
      return {
        fits: String(page.fits), buildMs: num(page.buildMs), triangles: num(page.triangles),
        runs: Array.isArray(page.runs) ? page.runs.map(readRun) : [],
      };
    }
    if (performance.now() - t0 > 30 * 60_000) throw new Error("timed out");
  }
}

async function pullFrame(browser: Browser, width: number, height: number): Promise<Float32Array> {
  const bytes = new Uint8Array(width * height * 16);
  const chunk = 8 << 20;
  for (let start = 0; start < bytes.length; start += chunk) {
    const b64 = await browser.evaluate(`window.__photoBytes(${start}, ${Math.min(bytes.length, start + chunk)})`);
    bytes.set(Buffer.from(typeof b64 === "string" ? b64 : "", "base64"), start);
  }
  return new Float32Array(bytes.buffer);
}

// ---- parity ------------------------------------------------------------------------------

interface ParityRow {
  readonly name: FixtureName;
  readonly diff: Difference;
  readonly browserMs: number;
  readonly blenderS: string;
}

async function parity(names: FixtureName[]) {
  const width = Number(opt("--width", "640"));
  const height = Number(opt("--height", "400"));
  const samples = Number(opt("--samples", "256"));
  const bvh = opt("--bvh", "bvh2");
  const vite = await startVite();
  const browser = await Browser.launch();
  const rows: ParityRow[] = [];
  try {
    const browserMs = new Map<FixtureName, number>();
    for (const name of names) {
      const dir = join(OUT, name);
      mkdirSync(dir, { recursive: true });
      const scene = fixture(name, { width, height, samples });
      writeScene(scene, dir);
      const page = await openPage(browser, `${vite.url}dev/photo.html?fixture=${name}&width=${width}&height=${height}&samples=${samples}`, 1);
      const run = page.runs[0];
      if (run.outcome !== "done") throw new Error(`${name}: ${run.error}`);
      browserMs.set(name, run.totalMs);
      const rgba = await pullFrame(browser, width, height);
      writeFileSync(join(dir, "browser.png"), encodePng(standard(width, height, rgba, scene.film.transparent)));
      writeFileSync(join(dir, "browser.json"), JSON.stringify({ page, url: `dev/photo.html?fixture=${name}` }, null, 1));
      console.log(`${name}: browser ${(run.totalMs / 1000).toFixed(1)} s, ${run.samples} samples, ${page.triangles} part triangles`);
    }
    await browser.close();
    await vite.close();
    for (const name of names) {
      const dir = join(OUT, name);
      const r = spawnSync(BLENDER, ["-b", "--factory-startup", "--debug-cycles", "--python", join(REPO, "tools/blender/render_scene.py"),
        "--", join(dir, "scene.json"), join(dir, "blender.png"), "--bvh", bvh], { encoding: "utf8", maxBuffer: 1 << 28 });
      writeFileSync(join(dir, "blender.log"), `${r.stdout}\n${r.stderr}`);
      const line = /BOOTH_NATIVE build ([\d.]+)s render ([\d.]+)s/.exec(r.stdout);
      if (r.status !== 0 || !line) throw new Error(`${name}: Blender failed, see ${join(dir, "blender.log")}`);
      const a = decodePng(new Uint8Array(readFileSync(join(dir, "browser.png"))));
      const b = decodePng(new Uint8Array(readFileSync(join(dir, "blender.png"))));
      const diff = compare(a, b);
      writeFileSync(join(dir, "side_by_side.png"), encodePng(sideBySide(a, b)));
      writeFileSync(join(dir, "diff.json"), JSON.stringify({ diff, bvh, width, height, samples }, null, 1));
      rows.push({ name, diff, browserMs: browserMs.get(name) ?? NaN, blenderS: line[2] });
    }
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(`\n${width}x${height}, ${samples} samples, native BVH ${bvh}`);
  console.log("fixture  PSNR dB  mean |d| /255  >4/255   alpha |d|  browser s  Blender render s");
  for (const r of rows) {
    console.log(`${r.name.padEnd(8)} ${r.diff.psnrDb.toFixed(2).padStart(7)}  ${r.diff.meanAbs.toFixed(3).padStart(12)}  ${(r.diff.over4 * 100).toFixed(2).padStart(6)} %  ${r.diff.alphaMeanAbs.toFixed(3).padStart(9)}  ${(r.browserMs / 1000).toFixed(1).padStart(9)}  ${r.blenderS.padStart(8)}`);
  }
}

// ---- scale and cancel --------------------------------------------------------------------

async function scale() {
  const width = opt("--width", "1280");
  const height = opt("--height", "720");
  const samples = opt("--samples", "64");
  const vite = await startVite();
  const browser = await Browser.launch();
  try {
    const page = await openPage(browser, `${vite.url}dev/photo.html?fixture=scale&width=${width}&height=${height}&samples=${samples}&repeat=2&draw=0`, 2);
    console.log(`scale: ${page.triangles} part triangles, fixture built in ${page.buildMs.toFixed(0)} ms, fits: ${page.fits}`);
    page.runs.forEach((r, i) => {
      const s = r.stats;
      console.log(`run ${i + 1}: ${r.outcome} ${r.error} ${r.samples} samples, total ${(r.totalMs / 1000).toFixed(1)} s, `
        + `start to first sample ${(s.syncMs / 1000).toFixed(1)} s (BVH ${(s.bvhMs / 1000).toFixed(1)} s), sampling ${(s.samplingMs / 1000).toFixed(1)} s, `
        + `heap ${(s.heapBytes / 2 ** 20).toFixed(0)} MiB, Cycles peak ${(s.cyclesPeakBytes / 2 ** 20).toFixed(0)} MiB, threads ${s.threads}, `
        + `main thread blocked ${r.mainThreadBlockMs.toFixed(0)} ms in render(), largest timer lag ${r.maxTimerLagMs.toFixed(0)} ms`);
    });
    writeFileSync(join(OUT, "scale.json"), JSON.stringify(page, null, 1));
  } finally {
    await browser.close();
    await vite.close();
  }
}

async function cancel() {
  const vite = await startVite();
  try {
    for (const [name, at, label] of [["a", "sampling", "sampling"], ["scale", "4000", "BVH build"]] as const) {
      const browser = await Browser.launch();
      // Chromium's CPU time sampled every 50 ms through the whole run, to see when the render
      // threads really stop: the promise settling does not show it.
      const trace: [number, number][] = [];
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          trace.push([Date.now(), browser.cpuSeconds()]);
          await sleep(50);
        }
      })();
      const page = await openPage(browser, `${vite.url}dev/photo.html?fixture=${name}&samples=100000&abort=cancel&abortAt=${at}`, 1,
        async () => {
          await sleep(1500);
        });
      sampling = false;
      await sampler;
      const r = page.runs[0];
      const cores = trace.slice(1).map(([t, c], i) => [t, (c - trace[i][1]) / ((t - trace[i][0]) / 1000)] as const);
      const before = cores.filter(([t]) => t <= r.abortedAtEpochMs).slice(-4).map(([, c]) => c.toFixed(1));
      const stop = cores.find(([t, c]) => t > r.abortedAtEpochMs && c < 1);
      console.log(`cancel during ${label}: ${r.outcome} (${r.error}), promise settled ${r.settledAfterAbortMs.toFixed(1)} ms after abort; `
        + `cores busy in the 200 ms before abort: ${before.join(" ")}; under one core ${stop ? (stop[0] - r.abortedAtEpochMs).toFixed(0) : "never"} ms after abort `
        + `(50 ms samples)`);
      await browser.close();
    }
  } finally {
    await vite.close();
  }
}

if (argv.includes("--scale")) await scale();
else if (argv.includes("--cancel")) await cancel();
else {
  const names = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
  const chosen = (names.length ? names : ["a", "b", "c", "d"]).map((n) => {
    if (!isFixtureName(n)) throw new Error(`unknown fixture ${n}`);
    return n;
  });
  await parity(chosen);
}
