/**
 * e2e.ts: a coding agent's whole path to the booth, with nothing faked. A real
 * Vite server serves the real app (/, not a dev page) to headless Chromium. A
 * real bridge process (`bun tools/agent/bridge.ts`) is driven by the MCP SDK's
 * own Client over stdio, as Claude Code would drive it. The tab pairs through
 * the link the bridge prints, and the user's switch is clicked in the UI.
 *
 *   bun run agent:e2e           headless Chromium (software GPU)
 *   bun run agent:e2e --gpu     the hardware-GPU session of tools/e2e/session.ts (gamescope)
 *
 * Prints PASS or FAIL per check with what it saw, and exits non-zero on a
 * failure. Temporary folders live under $BOOTH_TMP (or the system temp folder)
 * and are removed at the end, except a copy of the photo, agent-e2e.png, kept
 * there to look at.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "playwright-core";
import { decodePng } from "../parity/image";
import { enterGamescope, startSession } from "../e2e/session";
import { openSection, start } from "../ui/harness";
import type { JobReport } from "./jobs";

const argv = process.argv.slice(2);
const gpu = argv.includes("--gpu");
if (gpu) {
  const outcome = await enterGamescope(fileURLToPath(import.meta.url), argv);
  if (outcome !== null) process.exit(outcome ? 0 : 1);
}

const BRIDGE = join(import.meta.dirname, "bridge.ts");
const SCRATCH = process.env.BOOTH_TMP ?? tmpdir();
const WIDTH = 160;
const HEIGHT = 200;
const SAMPLES = 4;
/** The bridge waits this long for a tab before it says none is connected. */
const TAB_WAIT_S = 15;

const say = (line: string): void => { console.log(gpu ? `@ ${line}` : line); };

interface Result { readonly name: string; readonly ok: boolean; readonly detail: string }
const results: Result[] = [];

async function check(name: string, body: () => Promise<string>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await body() });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  const r = results[results.length - 1]!;
  say(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => { server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  await new Promise<void>((done) => { server.close(() => { done(); }); });
  if (address === null || typeof address === "string") throw new Error("no free port");
  return address.port;
}

/** A closed 20 mm cube as a binary STL: small enough to slice in seconds. */
function cubeStl(sizeMm: number): Buffer {
  const s = sizeMm;
  const v = (x: number, y: number, z: number): [number, number, number] => [x * s, y * s, z * s];
  const faces: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]][] = [
    [[0, 0, -1], v(0, 0, 0), v(0, 1, 0), v(1, 1, 0)], [[0, 0, -1], v(0, 0, 0), v(1, 1, 0), v(1, 0, 0)],
    [[0, 0, 1], v(0, 0, 1), v(1, 0, 1), v(1, 1, 1)], [[0, 0, 1], v(0, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [[0, -1, 0], v(0, 0, 0), v(1, 0, 0), v(1, 0, 1)], [[0, -1, 0], v(0, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [[0, 1, 0], v(0, 1, 0), v(0, 1, 1), v(1, 1, 1)], [[0, 1, 0], v(0, 1, 0), v(1, 1, 1), v(1, 1, 0)],
    [[-1, 0, 0], v(0, 0, 0), v(0, 0, 1), v(0, 1, 1)], [[-1, 0, 0], v(0, 0, 0), v(0, 1, 1), v(0, 1, 0)],
    [[1, 0, 0], v(1, 0, 0), v(1, 1, 0), v(1, 1, 1)], [[1, 0, 0], v(1, 0, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const out = Buffer.alloc(84 + 50 * faces.length);
  out.writeUInt32LE(faces.length, 80);
  faces.forEach((face, i) => {
    const at = 84 + 50 * i;
    face.flat().forEach((value, k) => { out.writeFloatLE(value, at + 4 * k); });
  });
  return out;
}

const SCRIPT = `
import bpy, time

bpy.ops.wm.stl_import(filepath="bracket.stl")
part = bpy.context.object
print("part", part.name, part.type)

keep = {"Camera", "Backdrop", part.name}
for obj in list(bpy.data.objects):
    if obj.name not in keep:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.light_add(type='AREA', location=(0.4, -0.5, 0.45))
key = bpy.context.object
key.name = "E2E Key"
key.data.energy = 40
key.location = (0.5, -0.4, 0.5)
print("lights", [o.name for o in bpy.data.objects if o.type == 'LIGHT'])
print("key", key.data.energy, tuple(round(v, 3) for v in key.location))

# A pause, so the script outlives the first call's wait on a machine that renders this fast.
time.sleep(3)

scene = bpy.context.scene
scene.render.resolution_x = ${WIDTH}
scene.render.resolution_y = ${HEIGHT}
scene.cycles.samples = ${SAMPLES}
scene.render.filepath = "renders/e2e.png"
bpy.ops.render.render(write_still=True)
print("saved", scene.render.filepath)
`;

const base = await mkdtemp(join(SCRATCH, "agent-e2e-"));
const config = join(base, "config");
const work = join(base, "work");
await mkdir(config, { recursive: true });
await mkdir(work, { recursive: true });
await writeFile(join(work, "bracket.stl"), cubeStl(20));

const session = gpu ? await startSession() : await start({ width: 1100, height: 720 });
const { page, origin } = session;
page.setDefaultTimeout(60_000);
const pageErrors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });

const bridgePort = await freePort();
const env = { ...getDefaultEnvironment(), FILAMENT_BOOTH_CONFIG_DIR: config, TMPDIR: SCRATCH };
const bridgeArgs = ["--port", String(bridgePort), "--app", origin];

// The link an agent's user would open: what `bun tools/agent/bridge.ts --pair` prints.
const pair = spawnSync(process.execPath, [BRIDGE, "--pair", ...bridgeArgs], { cwd: work, env, encoding: "utf8" });
const link = /link\s+(\S+)/.exec(pair.stdout)?.[1];
if (link === undefined) throw new Error(`the bridge printed no pairing link:\n${pair.stdout}\n${pair.stderr}`);
say(`pairing link ${link}`);

const client = new Client({ name: "agent-e2e", version: "1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [BRIDGE, ...bridgeArgs], cwd: work, env, stderr: "ignore" }));

async function tool(name: string, args: Record<string, unknown>, timeoutS = 120): Promise<CallToolResult> {
  return client.callTool({ name, arguments: args }, undefined, { timeout: timeoutS * 1000 }) as Promise<CallToolResult>;
}

const reportOf = (result: CallToolResult): JobReport => {
  if (result.isError === true) throw new Error(`the tool returned an error: ${JSON.stringify(result.content)}`);
  return result.structuredContent as unknown as JobReport;
};

const imageBlocks = (result: CallToolResult) => result.content.filter((block) => block.type === "image");
const agentStatus = (p: Page): Promise<string> => p.locator(".agent .agent-status").innerText();
/** Decodes a JPEG in the page and reports its size and mean red, to tell a picture from a black frame. */
function decodedThumbnail(p: Page, jpeg: Buffer): Promise<{ width: number; height: number; meanRed: number }> {
  return p.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "image/jpeg" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    // On the CPU: an accelerated canvas reads back black in the hardware-GPU session.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) throw new Error("no 2D canvas");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i]!;
    return { width: bitmap.width, height: bitmap.height, meanRed: sum / (bitmap.width * bitmap.height) };
  }, jpeg.toString("base64"));
}

const pythonWorkers = (p: Page): number => p.workers().filter((w) => w.url().includes("py-worker")).length;

let renderSeconds = 0;
let engineNote = "";

try {
  await check("the real app opens at the pairing link: hash removed, port and token filled, section open, switch off, Python not loaded", async () => {
    await page.goto(link);
    await page.waitForSelector(".app");
    expect(new URL(page.url()).hash === "", `the address bar still has ${new URL(page.url()).hash}`);
    expect(await page.locator('details.section[data-section="agent"]').getAttribute("open") !== null, "the Agent section is closed");
    await page.locator(".agent details.fold").evaluate((fold) => { (fold as HTMLDetailsElement).open = true; });
    const [port, token] = [await page.getByRole("textbox", { name: "Port" }).inputValue(), await page.getByRole("textbox", { name: "Token" }).inputValue()];
    expect(port === String(bridgePort) && /^[0-9a-f]{32}$/.test(token), `port ${port}, token ${token}`);
    expect(await page.getByRole("switch", { name: /control this tab/ }).isChecked() === false, "the switch is on");
    expect(await page.locator(".topbar .agent-badge").count() === 0, "the badge shows with the switch off");
    expect(pythonWorkers(page) === 0, "the Python worker started before the user turned the switch on");
    const dev = await page.evaluate(() => ({ kind: window.boothDev?.agent.state.get().status.kind, hasBoothDev: window.boothDev !== undefined }));
    expect(dev.hasBoothDev && dev.kind === "off", `boothDev ${JSON.stringify(dev)}`);
    return `at ${page.url()}, port ${port}, token filled, status "${await agentStatus(page)}"`;
  });

  await check("clicking the switch loads Python in its worker and connects to the bridge", async () => {
    const started = Date.now();
    await page.getByRole("switch", { name: /control this tab/ }).click();
    await page.locator(".agent .agent-status", { hasText: "Connected" }).waitFor({ timeout: 90_000 });
    expect(pythonWorkers(page) === 1, `${pythonWorkers(page)} Python workers`);
    const badge = await page.locator(".topbar .agent-badge").innerText();
    expect(badge === "Agent connected", `badge: ${badge}`);
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools.join() === "booth_cancel,booth_python,booth_wait", `tools: ${tools.join()}`);
    return `connected ${Date.now() - started} ms after the click, badge "${badge}", tools ${tools.join(", ")}`;
  });

  await check("booth_python imports the STL, relights, sets the output and renders; booth_wait follows it to done", async () => {
    const started = Date.now();
    let result = await tool("booth_python", { code: SCRIPT, wait_s: 1 }, 30);
    let report = reportOf(result);
    expect(report.state === "running", `the first call returned ${report.state} after 1 s`);
    const seen = new Set<string>();
    let output = report.output;
    let waits = 0;
    while (report.state === "running") {
      if (report.progress !== null) seen.add(report.progress.replace(/\d+(\.\d+)?/g, "#"));
      expect(Date.now() - started < 600_000, "the script was still running after 10 minutes");
      result = await tool("booth_wait", { job: report.job, wait_s: 20 }, 60);
      report = reportOf(result);
      output += report.output;
      waits += 1;
    }
    renderSeconds = (Date.now() - started) / 1000;
    expect(report.state === "done", `final state ${report.state}: ${JSON.stringify(report.error)}\n${report.output}`);
    expect(report.images.length === 1, `${report.images.length} images in the report`);
    const image = report.images[0]!;
    engineNote = image.note;
    expect(image.label === "render" && image.width === WIDTH && image.height === HEIGHT, `image ${JSON.stringify(image)}`);
    expect(/, Cycles$/.test(image.note), `not a Cycles render: ${image.note}`);

    const path = image.path ?? "";
    expect(path.startsWith(`${work}${sep}`) && existsSync(path), `the PNG is not inside the working directory: ${path}`);
    await copyFile(path, join(SCRATCH, gpu ? "agent-e2e-gpu.png" : "agent-e2e.png"));
    const png = decodePng(new Uint8Array(readFileSync(path)));
    expect(png.width === WIDTH && png.height === HEIGHT, `the PNG is ${png.width} by ${png.height}`);
    const lit = Array.from({ length: png.width * png.height }, (_, i) => png.data[i * 4]! + png.data[i * 4 + 1]! + png.data[i * 4 + 2]!);
    expect(new Set(lit).size > 20, "the PNG is flat: fewer than 20 distinct pixel values");

    const blocks = imageBlocks(result);
    expect(blocks.length === 1, `${blocks.length} image blocks in the final report`);
    const thumbnail = Buffer.from(String((blocks[0] as { data: string }).data), "base64");
    expect(thumbnail[0] === 0xff && thumbnail[1] === 0xd8, "the image block is not a JPEG");
    const thumb = await decodedThumbnail(page, thumbnail);
    expect(thumb.width === WIDTH && thumb.height === HEIGHT && thumb.meanRed > 60, `the thumbnail decodes to ${JSON.stringify(thumb)}: black, or the wrong size`);
    expect(output.includes("part bracket MESH") && output.includes("lights ['E2E Key']") && output.includes("key 40.0 (0.5, -0.4, 0.5)"), `output: ${JSON.stringify(output)}`);

    const doc = await page.evaluate(() => window.boothDev?.booth.doc);
    const lights = doc?.studio.lights ?? [];
    const key = lights[0];
    if (lights.length !== 1 || key?.name !== "E2E Key" || key.kind !== "area" || key.powerW !== 40) {
      throw new Error(`lights ${JSON.stringify(lights.map((l) => [l.name, l.kind === "area" ? l.powerW : null]))}`);
    }
    expect(Math.abs(key.azimuth - 51.34) < 1, `azimuth ${key.azimuth}`);
    expect(doc?.output.samples === SAMPLES && doc.output.longEdgePx === HEIGHT, `output ${JSON.stringify(doc?.output)}`);

    const card = page.locator('img.photo-frame[alt^="Finished photo"]');
    await card.waitFor();
    const size = await card.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    expect(size.w === WIDTH && size.h === HEIGHT, `the photo card shows ${size.w} by ${size.h}`);
    return `${renderSeconds.toFixed(1)} s from the call to done (${waits} waits, progress: ${[...seen].join(" | ")}); ${image.note}; ${path} is ${png.width}x${png.height}; thumbnail ${thumbnail.length} bytes (mean red ${Math.round(thumb.meanRed)}); light "${key.name}" ${key.powerW} W at azimuth ${key.azimuth.toFixed(1)}`;
  });

  await check("booth_cancel stops a runaway script as cancelled, and the next script runs", async () => {
    const running = reportOf(await tool("booth_python", { code: "while True:\n    pass\n", wait_s: 2 }, 30));
    expect(running.state === "running", `state ${running.state}`);
    const refused = await tool("booth_python", { code: "print(1)", wait_s: 2 }, 30);
    expect(refused.isError === true && JSON.stringify(refused.content).includes(running.job), `a second script was not refused naming job ${running.job}: ${JSON.stringify(refused.content)}`);
    const asked = Date.now();
    let stopped = reportOf(await tool("booth_cancel", { job: running.job }, 30));
    // A tab whose main thread is busy answers late. The bridge then says the cancel is pending, and booth_wait follows it.
    const pending = stopped.state === "running";
    if (pending) stopped = reportOf(await tool("booth_wait", { job: running.job, wait_s: 60 }, 90));
    expect(stopped.state === "cancelled", `state ${stopped.state}`);
    const cancelSeconds = (Date.now() - asked) / 1000;
    const next = reportOf(await tool("booth_python", { code: "import bpy\nprint(len(bpy.data.objects), bpy.data.objects['E2E Key'].data.energy)", wait_s: 30 }, 60));
    expect(next.state === "done" && next.output.trim().endsWith("40.0"), `next script: ${next.state} ${JSON.stringify(next.output)} ${JSON.stringify(next.error)}`);
    return `cancelled job ${running.job} in ${cancelSeconds.toFixed(1)} s${pending ? " (the tab answered after the bridge's 10 s grace)" : ""} while a second booth_python was refused; the next script printed ${JSON.stringify(next.output.trim())}`;
  });

  await check("a path outside the working directory is refused with a message that says what to do", async () => {
    const read = reportOf(await tool("booth_python", { code: "import bpy\nbpy.ops.wm.stl_import(filepath='/usr/share/outside.stl')", wait_s: 30 }, 60));
    expect(read.state === "failed" && read.error !== null, `state ${read.state}`);
    const message = read.error?.message ?? "";
    expect(message.includes("outside the folders the booth may use") && message.includes("Use a path under the working directory") && message.includes(work), message);
    const climb = reportOf(await tool("booth_python", { code: "import bpy\nbpy.ops.wm.stl_import(filepath='../bracket.stl')", wait_s: 30 }, 60));
    expect(climb.state === "failed" && (climb.error?.message ?? "").includes("outside the folders"), `../ escape: ${climb.state} ${climb.error?.message}`);
    return message;
  });

  await check("bpy.ops.render.opengl returns a preview image from the live viewport, which the agent can see", async () => {
    const started = Date.now();
    const result = await tool("booth_python", { code: "import bpy\nbpy.ops.render.opengl()\nprint('previewed')", wait_s: 120 }, 150);
    const report = reportOf(result);
    expect(report.state === "done", `state ${report.state}: ${JSON.stringify(report.error)}`);
    const image = report.images[0];
    expect(report.images.length === 1 && image?.label === "preview" && image.path === null && /not a Cycles photo/.test(image.note), `images ${JSON.stringify(report.images)}`);
    const blocks = imageBlocks(result);
    expect(blocks.length === 1, `${blocks.length} image blocks`);
    const thumb = await decodedThumbnail(page, Buffer.from(String((blocks[0] as { data: string }).data), "base64"));
    expect(thumb.width === image.width && thumb.height === image.height && thumb.meanRed > 10, `the preview decodes to ${JSON.stringify(thumb)}`);
    return `${((Date.now() - started) / 1000).toFixed(1)} s, ${image.width}x${image.height}, "${image.note}", mean red ${Math.round(thumb.meanRed)}`;
  });

  await check("no errors reached the page console", async () => {
    // Cycles' wasm module writes its OpenColorIO notice to stderr, which the console reports as an error.
    const relevant = pageErrors.filter((text) => !/ws:\/\/127\.0\.0\.1|OpenColorIO Info/.test(text));
    expect(relevant.length === 0, relevant.join("\n"));
    return pageErrors.length === 0 ? "none" : `none besides ${pageErrors.length} known notices`;
  });

  await check("turning the switch off in the UI stops a running script as cancelled and leaves the bridge with no tab", async () => {
    const running = reportOf(await tool("booth_python", { code: "while True:\n    pass\n", wait_s: 1 }, 30));
    expect(running.state === "running", `state ${running.state}`);
    await openSection(page, "agent");
    await page.getByRole("switch", { name: /control this tab/ }).click();
    const ended = reportOf(await tool("booth_wait", { job: running.job, wait_s: 60 }, 90));
    expect(ended.state === "cancelled", `the script ended as ${ended.state}: ${JSON.stringify(ended.error)}`);
    await page.locator(".agent .agent-status", { hasText: /^Off/ }).waitFor();
    expect(await page.locator(".topbar .agent-badge").count() === 0, "the badge is still there");
    const gone = Date.now();
    while (pythonWorkers(page) > 0 && Date.now() - gone < 10_000) await page.waitForTimeout(100);
    expect(pythonWorkers(page) === 0, "the Python worker is still alive 10 s after the switch went off");
    await page.waitForTimeout(500);
    const waited = Date.now();
    const result = await tool("booth_python", { code: "print(1)", wait_s: 1 }, TAB_WAIT_S + 30);
    const seconds = (Date.now() - waited) / 1000;
    const text = JSON.stringify(result.content);
    expect(result.isError === true && text.includes("No booth tab is connected") && text.includes(`#agent=${bridgePort}.`), `result: ${text}`);
    expect(seconds >= TAB_WAIT_S - 1, `the bridge answered after ${seconds.toFixed(1)} s, before its ${TAB_WAIT_S} s wait for a tab`);
    return `the running script ended as ${ended.state}; switch off, badge and worker gone; the bridge answered after ${seconds.toFixed(1)} s: ${text.slice(0, 160)}`;
  });
} finally {
  await client.close().catch(() => {});
  await session.close();
  await rm(base, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
say(`\n${results.length - failed.length} of ${results.length} checks passed`);
say(`photo: ${engineNote === "" ? "none" : engineNote} in ${renderSeconds.toFixed(1)} s, ${gpu ? "hardware-GPU session" : "headless Chromium"}`);
if (!gpu) process.exit(failed.length === 0 ? 0 : 1);
if (failed.length === 0) say("ok");
process.exit(0);
