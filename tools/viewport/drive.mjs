// Drives dev/viewport.html in Chromium and prints one JSON line per step. Screenshots go to tools/viewport/out/.
//
//   bun tools/viewport/drive.mjs smoke  part.gcode
//   bun tools/viewport/drive.mjs looks  part.gcode
//   bun tools/viewport/drive.mjs edits  part.gcode
//   bun tools/viewport/drive.mjs orbit  part.gcode
//   bun tools/viewport/drive.mjs compare part.gcode --ref renders/hero_light.png
//   bun tools/viewport/drive.mjs photo  part.gcode
//   bun tools/viewport/drive.mjs memory a.gcode b.gcode
//   bun tools/viewport/drive.mjs camera part.gcode
//   bun tools/viewport/drive.mjs zoom   part.gcode
//
//   --webgl         headless Chromium with WebGPU switched off: three's automatic WebGL2 fallback
//   --query k=v&..  extra dev page URL parameters
//   --url <origin>  use a running dev server; otherwise one is started on --port (default 5198) and stopped
//
// Hardware WebGPU needs a real display, so without --webgl this script re-runs itself inside a headless
// gamescope (a Wayland compositor with Xwayland) and drives a headful Chromium there with Vulkan on.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const out = resolve(import.meta.dirname, "out");
const args = process.argv.slice(2);
const [scenario, ...rest] = args;
const files = [], opt = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) files.push(resolve(rest[i]));
  else if (["--webgl", "--inside"].includes(rest[i])) opt[rest[i].slice(2)] = true;
  else opt[rest[i].slice(2)] = rest[++i];
}
const WIDTH = 1440, HEIGHT = 900;

if (!opt.webgl && !opt.inside) {
  const child = Bun.spawn(["gamescope", "--backend", "headless", "-W", String(WIDTH), "-H", String(HEIGHT), "--", "bun", import.meta.path, ...args, "--inside"],
    { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(child.stdout).text();
  await child.exited;
  for (const line of text.split("\n")) if (line.startsWith("{")) console.log(line);
  process.exit(text.includes('"ok":false') ? 1 : 0);
}

// Accelerated 2D canvases read back and encode as black under gamescope: 2D work stays on the CPU.
const WEBGPU = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ozone-platform=x11", "--ignore-gpu-blocklist", "--disable-accelerated-2d-canvas"];
const WEBGL = ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--disable-blink-features=WebGPU"];

const log = (step, data) => console.log(JSON.stringify({ step, ...data }));
mkdirSync(out, { recursive: true });

async function startServer(port) {
  const server = Bun.spawn([`${root}/node_modules/.bin/vite`, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) throw new Error(`vite exited with ${server.exitCode}: is port ${port} taken?`);
    try { if ((await fetch(`${origin}/dev/viewport.html`)).ok) return { origin, stop: () => server.kill() }; } catch { /* not up yet */ }
    await Bun.sleep(200);
  }
  server.kill();
  throw new Error("the dev server did not come up");
}

let server = null, browser = null, page = null;
const tag = opt.webgl ? "webgl" : "webgpu";

async function shot(name, crop = true) {
  const clip = crop ? await page.evaluate(() => window.viewportDev.cropOnCanvas()) : undefined;
  const path = `${out}/${tag}-${name}.png`;
  await page.screenshot({ path, clip });
  return path;
}

async function openPage(query = "") {
  page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on("pageerror", (err) => log("pageerror", { message: err.message }));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log("console", { type: m.type(), text: m.text().slice(0, 300) }); });
  await page.goto(`${server?.origin ?? opt.url}/dev/viewport.html${query ? `?${query}` : ""}`);
  await page.waitForFunction(() => "viewportDev" in window, null, { timeout: 60000 });
  if (files.length) {
    await page.setInputFiles("#driverFiles", files);
    await page.evaluate(() => window.viewportDev.chooseFromInput());
  }
}

const stats = () => page.evaluate(() => window.viewportDev.stats());
const set = (p) => page.evaluate((q) => window.viewportDev.set(q), p);
const open = (i = 0, lite = true) => page.evaluate(([n, l]) => window.viewportDev.open(n, l), [i, lite]);

/** A left-button drag across the canvas centre, `seconds` long, sampling stats every half second. */
async function orbitFor(seconds, dx = 600) {
  const cx = WIDTH / 2, cy = HEIGHT / 2, steps = Math.round(seconds * 60), samples = [];
  await page.mouse.move(cx - dx / 2, cy);
  await page.mouse.down();
  for (let i = 0; i < steps; i++) {
    const t = i / steps, x = cx - dx / 2 + dx * (0.5 - 0.5 * Math.cos(t * Math.PI * 4));
    await page.mouse.move(x, cy + 40 * Math.sin(t * Math.PI * 2));
    if (i % 30 === 29) samples.push(await stats());
  }
  await page.mouse.up();
  return samples;
}

const scenarios = {
  async smoke() {
    await openPage(opt.query);
    log("open", await open(0));
    log("stats", await stats());
    log("shot", { path: await shot("smoke", false) });
  },

  async looks() {
    await openPage(opt.query);
    log("open", await open(0));
    for (const look of ["studio", "dark", "gradient", "rim", "raking"]) {
      const ms = await set({ look });
      log("look", { look, settleMs: ms, path: await shot(`look-${look}`) });
    }
  },

  async edits() {
    await openPage(opt.query ?? "look=studio");
    log("open", await open(0));
    log("baseline", { path: await shot("edit-0-baseline") });
    const lights = await page.evaluate(() => window.viewportDev.lights());
    const top = lights.find((l) => l.id === "top");
    for (const [name, call] of [
      ["power-x3", () => page.evaluate((p) => window.viewportDev.patchLight("top", { powerW: p }), top.power * 3)],
      ["power-back", () => page.evaluate((p) => window.viewportDev.patchLight("top", { powerW: p }), top.power)],
      ["left-azimuth-90", () => page.evaluate(() => window.viewportDev.patchLight("left", { azimuth: 90 }))],
      ["backdrop-0.08", () => set({ backdrop: 0.08 })],
      ["filament-pla-matte", () => set({ filament: "pla-matte" })],
      ["turntable+60", () => set({ turntable: 60 })],
      ["fstop-2.8", () => set({ fstop: 2.8 })],
    ]) {
      const ms = await call();
      log("edit", { name, showToStillMs: ms, bakeMs: (await stats()).lastBakeMs, path: await shot(`edit-${name}`) });
    }
  },

  async orbit() {
    await openPage(opt.query);
    log("open", await open(0));
    await page.waitForTimeout(1500); // the lite mesh lands in the background
    const samples = await orbitFor(6);
    log("orbit", { samples: samples.map((s) => ({ fps: s.fps, gpuMs: s.gpuMs && +s.gpuMs.toFixed(2), quality: s.quality })) });
    log("settle", { ms: await page.evaluate(() => window.viewportDev.waitConverged()), stats: await stats() });
  },

  async compare() {
    // The hero_light shot of shots.json: look light, rot 80, cam [0, 22, 0.8], lens 85, f/11, 1600x2000, aim z 0.088.
    await openPage("look=studio&filament=petg-basic&turntable=80&az=0&el=22&dist=0.8&tz=0.088&focal=85&fstop=11&aspect=4:5&long=2000&samples=256");
    log("open", await open(0));
    const preview = await shot("compare-preview");
    const p = await page.evaluate(() => window.viewportDev.photo());
    if (p.error) throw new Error(p.error);
    const photoPath = `${out}/${tag}-compare-photo.png`;
    writeFileSync(photoPath, Buffer.from(p.png, "base64"));
    log("photo", { ms: p.ms, passes: p.passes, width: p.width, height: p.height, samples: p.samples, linear: p.linear, path: photoPath });
    const ref = opt.ref ? readFileSync(opt.ref).toString("base64") : null;
    const brightness = await page.evaluate(([a, b]) => window.viewportDev.partBrightness(b ? { photo: a, cycles: b } : { photo: a }), [p.png, ref]);
    log("part-brightness", brightness);
    const previewPng = readFileSync(preview).toString("base64");
    const crop = await page.evaluate(() => window.viewportDev.cropOnCanvas());
    const diff = await page.evaluate(([a, b, w, h]) => window.viewportDev.difference(a, b, w, h), [p.png, previewPng, Math.round(crop.width), Math.round(crop.height)]);
    log("photo-vs-preview", { ...diff, size: [Math.round(crop.width), Math.round(crop.height)] });
  },

  async photo() {
    await openPage(opt.query ?? "samples=64");
    log("open", await open(0));
    const before = await shot("photo-before");
    const cancelled = await page.evaluate(() => window.viewportDev.photo({ abortAfterMs: 400, abort: "cancel" }));
    log("abort-cancel", { error: cancelled.error, passes: cancelled.passes, ms: cancelled.ms });
    log("restored", { settleMs: await page.evaluate(() => window.viewportDev.waitConverged()), path: await shot("photo-after-cancel") });
    const finished = await page.evaluate(() => window.viewportDev.photo({ abortAfterMs: 600, abort: "finish" }));
    log("abort-finish", { error: finished.error, samples: finished.samples, passes: finished.passes, ms: finished.ms, linear: finished.linear });
    if (finished.png) writeFileSync(`${out}/${tag}-photo-finished-early.png`, Buffer.from(finished.png, "base64"));
    log("restored", { settleMs: await page.evaluate(() => window.viewportDev.waitConverged()), path: await shot("photo-after-finish") });
    const after = readFileSync(`${out}/${tag}-photo-after-finish.png`).toString("base64");
    const crop = await page.evaluate(() => window.viewportDev.cropOnCanvas());
    log("before-vs-after", await page.evaluate(([a, b, w, h]) => window.viewportDev.difference(a, b, w, h),
      [readFileSync(before).toString("base64"), after, Math.round(crop.width), Math.round(crop.height)]));
  },

  async memory() {
    await openPage(opt.query);
    const vram = () => Number(execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits").toString().trim());
    log("empty", { gpuMemory: (await stats()).gpuMemory, vramMiB: vram() });
    log("open-a", await open(0, false));
    log("after-a", { gpuMemory: (await stats()).gpuMemory, partBytes: (await stats()).partBytes, vramMiB: vram() });
    log("open-b", await open(1, false));
    await page.waitForTimeout(1000);
    log("after-b", { gpuMemory: (await stats()).gpuMemory, partBytes: (await stats()).partBytes, vramMiB: vram() });
    log("open-a-again", await open(0, false));
    await page.waitForTimeout(1000);
    log("after-a-again", { gpuMemory: (await stats()).gpuMemory, partBytes: (await stats()).partBytes, vramMiB: vram() });
  },

  async camera() {
    await openPage(opt.query);
    log("open", await open(0));
    const cam0 = await page.evaluate(() => window.viewportDev.camera());
    const edits0 = (await stats()).cameraEdits;
    await page.evaluate(() => { window.viewportDev.reshow(); window.viewportDev.recompile(); });
    await page.waitForTimeout(500);
    log("reshow", { cameraEdits: (await stats()).cameraEdits - edits0, same: JSON.stringify(cam0) === JSON.stringify(await page.evaluate(() => window.viewportDev.camera())) });
    await orbitFor(1, 300);
    await page.evaluate(() => window.viewportDev.waitConverged());
    const cam1 = await page.evaluate(() => window.viewportDev.camera());
    log("dragged", { cameraEdits: (await stats()).cameraEdits - edits0, azimuth: cam1.azimuth, elevation: cam1.elevation, distance: cam1.distance });
    const edits1 = (await stats()).cameraEdits;
    await page.evaluate(() => window.viewportDev.recompile());
    await page.waitForTimeout(500);
    const cam2 = await page.evaluate(() => window.viewportDev.camera());
    log("round-trip", { newEdits: (await stats()).cameraEdits - edits1, unchanged: JSON.stringify(cam1) === JSON.stringify(cam2) });
    await page.evaluate(() => window.viewportDev.focusTool(true));
    const crop = await page.evaluate(() => window.viewportDev.cropOnCanvas());
    await page.mouse.click(crop.x + crop.width / 2, crop.y + crop.height * 0.55);
    await page.waitForTimeout(300);
    log("focus", { point: await page.evaluate(() => window.viewportDev.focusPartPoint()), focusDistanceM: (await page.evaluate(() => window.viewportDev.camera())).focusDistanceM, settleMs: await page.evaluate(() => window.viewportDev.waitConverged()), path: await shot("focus-marker") });
  },

  async zoom() {
    await openPage(opt.query ?? "look=studio&turntable=80&el=10");
    log("open", await open(0));
    for (const dist of [0.8, 0.45, 0.3, 0.2]) {
      const ms = await set({ dist });
      log("zoom", { dist, settleMs: ms, path: await shot(`zoom-${dist}`) });
    }
  },
};

const timeout = setTimeout(() => { log("timeout", { ok: false }); process.exit(1); }, Number(opt.timeout ?? 900) * 1000);
try {
  if (!scenarios[scenario]) throw new Error(`unknown scenario ${scenario}: ${Object.keys(scenarios).join(", ")}`);
  if (!opt.url) server = await startServer(Number(opt.port ?? 5198));
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: !!opt.webgl, args: opt.webgl ? WEBGL : WEBGPU });
  await scenarios[scenario]();
  log("done", { ok: true, backend: (await stats()).backend });
} catch (err) {
  log("failed", { ok: false, error: err instanceof Error ? err.message : String(err) });
} finally {
  clearTimeout(timeout);
  await browser?.close().catch(() => {});
  server?.stop();
}
process.exit(0);
