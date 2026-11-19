// Drives dev/print.html in headless Chromium and prints one JSON line.
//
//   bun tools/print/drive.mjs part.stl --set layerHeight=0.12,wallCount=3
//   bun tools/print/drive.mjs part.stl --set layerHeight=0.2 --reslice layerHeight=0.12 --lite
//   bun tools/print/drive.mjs a.gcode b.gcode --supersede
//
//   --set k=v,...      slice settings for the open (an STL only; a G-code reports its own)
//   --reslice k=v,...  then re-slice the opened STL with these settings changed
//   --lite             then build the lite mesh
//   --supersede        open the first file, then the second before the first has answered
//   --url <origin>     use a dev server that is already running; otherwise one is started and stopped
//   --port <n>         port for the server this script starts (default 5199)
//   --timeout <s>      give up after this many seconds (default 600)
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const files = [], opt = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--")) files.push(resolve(args[i]));
  else if (["--lite", "--supersede"].includes(args[i])) opt[args[i].slice(2)] = true;
  else opt[args[i].slice(2)] = args[++i];
}
if (!files.length) { console.error("usage: bun tools/print/drive.mjs <file> [<file2>] [--set k=v,...] [--reslice k=v,...] [--lite] [--supersede]"); process.exit(2); }

const kv = (text) => Object.fromEntries((text ?? "").split(",").filter(Boolean).map((p) => {
  const [k, v] = p.split("=");
  return [k, v !== "" && Number.isFinite(Number(v)) ? Number(v) : v];
}));

async function startServer(port) {
  const server = Bun.spawn([`${root}/node_modules/.bin/vite`, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) throw new Error(`vite exited with ${server.exitCode}: is port ${port} taken?`);
    try { if ((await fetch(`${origin}/dev/print.html`)).ok) return { origin, stop: () => server.kill() }; } catch { /* not listening yet */ }
    await Bun.sleep(200);
  }
  server.kill();
  throw new Error("the dev server did not come up");
}

const timeoutMs = Number(opt.timeout ?? 600) * 1000;
let server = null, browser = null;
const finish = async (code, line) => {
  console.log(JSON.stringify(line));
  await browser?.close().catch(() => {});
  server?.stop();
  process.exit(code);
};
const timer = setTimeout(() => finish(1, { ok: false, error: `timed out after ${timeoutMs / 1000} s` }), timeoutMs);

try {
  let origin = opt.url;
  if (!origin) { server = await startServer(Number(opt.port ?? 5199)); origin = server.origin; }
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error(`pageerror: ${err.message}`));
  await page.goto(`${origin}/dev/print.html`);
  await page.waitForFunction(() => "printDev" in window);
  if (!(await page.evaluate(() => crossOriginIsolated))) throw new Error("the page is not cross-origin isolated: the threaded slicer cannot run");
  await page.setInputFiles("#file", files);

  const set = kv(opt.set), result = { ok: true };
  if (opt.supersede) {
    if (files.length < 2) throw new Error("--supersede needs two files");
    Object.assign(result, await page.evaluate(([a, b, s]) => window.printDev.supersede(a, b, s), [0, 1, set]));
  } else {
    result.open = await page.evaluate(([s]) => window.printDev.open(0, s), [set]);
    if (opt.reslice) result.reslice = await page.evaluate(([s]) => window.printDev.reslice(s), [{ ...set, ...kv(opt.reslice) }]);
    if (opt.lite) result.lite = await page.evaluate(() => window.printDev.lite());
  }
  clearTimeout(timer);
  await finish(0, result);
} catch (err) {
  clearTimeout(timer);
  await finish(1, { ok: false, error: err instanceof Error ? err.message : String(err) });
}
