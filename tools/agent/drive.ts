/**
 * drive.ts: drives dev/agent.html in headless Chromium, with the real Python
 * worker, and reports each check as PASS or FAIL with what it saw. Run it
 * with `bun run agent:drive`. It exits non-zero when any check fails, and
 * leaves one screenshot in $BOOTH_TMP (or the system temp folder).
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { start } from "../ui/harness";

type ScriptRun = Awaited<ReturnType<Window["agentPage"]["run"]>>;

interface Result { readonly name: string; readonly ok: boolean; readonly detail: string }
const results: Result[] = [];

async function check(name: string, body: () => Promise<string>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await body() });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  const r = results[results.length - 1];
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const lines = (...code: string[]) => code.join("\n");
const run = (page: Page, code: string): Promise<ScriptRun> => page.evaluate((c) => window.agentPage.run(c), code);
const ticks = (page: Page): Promise<number> => page.evaluate(() => window.agentPage.ticks());

function done(r: ScriptRun): string {
  if (r.outcome.kind !== "done") throw new Error(`the script did not finish: ${JSON.stringify(r.outcome)}\n${r.output}`);
  return r.output;
}

/** Types into the page's script box and presses Run, as a person would. */
async function runInUi(page: Page, code: string): Promise<void> {
  await page.locator("#script").fill(code);
  await page.getByRole("button", { name: "Run" }).click();
}

async function outcomeInUi(page: Page, ms: number): Promise<string> {
  const pane = page.getByTestId("outcome");
  await pane.filter({ hasText: /\S/ }).waitFor({ timeout: ms });
  return pane.innerText();
}

const SESSION_2 = lines(
  "import bpy, math",
  "",
  "bpy.ops.wm.stl_import(filepath='parts/bracket.stl')",
  "part = bpy.context.object",
  "print(part.name, part.type, tuple(round(d, 4) for d in part.dimensions))",
  "",
  "part.booth.slicing.layer_height_mm = 0.12",
  "part.booth.rest_face = 'FRONT'",
  "part.rotation_euler.z = math.radians(-30)",
  "bpy.ops.booth.filament_apply(preset='PLA_MATTE')",
  "bsdf = part.active_material.node_tree.nodes['Principled BSDF']",
  "bsdf.inputs['Base Color'].default_value = (0.6, 0.02, 0.015, 1.0)",
  "",
  "bpy.ops.render.opengl()",
);

const SESSION_1 = lines(
  "import bpy, math",
  "",
  "scene = bpy.context.scene",
  "for obj in list(bpy.data.objects):",
  "    if obj.type == 'LIGHT':",
  "        bpy.data.objects.remove(obj, do_unlink=True)",
  "",
  "def area(name, azimuth_deg, height, energy, size, kelvin=None):",
  "    a = math.radians(azimuth_deg)",
  "    bpy.ops.object.light_add(type='AREA', location=(1.1 * math.sin(a), -1.1 * math.cos(a), height))",
  "    light = bpy.context.object",
  "    light.name = name",
  "    light.data.energy = energy",
  "    light.data.size = size",
  "    if kelvin:",
  "        light.data.use_temperature = True",
  "        light.data.temperature = kelvin",
  "    return light",
  "",
  "area('Key', 40, 0.9, 30, 0.8, kelvin=4800)",
  "area('Fill', -70, 0.4, 6, 1.2)",
  "rim = area('Rim', 165, 0.6, 25, 0.15)",
  "rim.data.spread = math.radians(40)",
  "",
  "cam = scene.camera",
  "cam.data.lens = 100",
  "cam.data.dof.aperture_fstop = 8",
  "scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.05",
  "",
  "scene.render.resolution_x = 1600",
  "scene.render.resolution_y = 2000",
  "scene.cycles.samples = 512",
  "scene.cycles.time_limit = 600",
  "scene.render.filepath = '//renders/bracket_hero.png'",
  "print('lights:', [o.name for o in bpy.data.objects if o.type == 'LIGHT'])",
  "print('key at', tuple(round(v, 3) for v in bpy.data.objects['Key'].location))",
  "bpy.ops.render.render(write_still=True)",
  "print('saved', scene.render.filepath)",
);

const s = await start({ width: 1280, height: 900 });
const { page, origin } = s;
const failures: string[] = [];
page.on("console", (m) => { if (m.type() === "error") failures.push(m.text()); });

try {
  const opened = Date.now();
  await page.goto(`${origin}/dev/agent.html`);

  await check("the page is cross-origin isolated and Python loads in the worker", async () => {
    expect(await page.evaluate(() => window.agentPage.isolated), "the page is not cross-origin isolated");
    const state = await page.evaluate(() => window.agentPage.ready());
    expect(state === "ready", state);
    return `ready ${Date.now() - opened} ms after navigation`;
  });

  await check("host calls from the worker are cheap", async () => {
    const out = done(await run(page, lines(
      "import bpy, time",
      "light = bpy.data.lights[0]",
      "t = time.perf_counter()",
      "for i in range(2000):",
      "    light.energy",
      "print(round((time.perf_counter() - t) * 1000))",
    )));
    const ms = Number(out.trim());
    expect(ms < 2000, `2000 reads took ${ms} ms`);
    return `2000 attribute reads in ${ms} ms (${((ms * 1000) / 2000).toFixed(0)} us each)`;
  });

  await check("session 2: import the agent's STL, pose, slice and colour it, then a preview", async () => {
    const t0 = Date.now();
    await runInUi(page, SESSION_2);
    const outcome = await outcomeInUi(page, 20_000);
    const output = await page.getByTestId("output").innerText();
    expect(outcome === "done", `outcome: ${outcome}\n${output}`);
    expect(output.trim() === "bracket MESH (0.036, 0.036, 0.03)", `output: ${JSON.stringify(output)}`);
    const doc = await page.evaluate(() => window.agentPage.doc());
    expect(doc.slicing.layerHeight === 0.12 && doc.pose.restFace === "front" && doc.filament.presetId === "pla-matte",
      `document: ${JSON.stringify({ slicing: doc.slicing.layerHeight, pose: doc.pose, preset: doc.filament.presetId })}`);
    const images = await page.evaluate(() => window.agentPage.images());
    const preview = images.find((i) => i.label === "preview");
    expect(preview !== undefined && preview.width === 614 && preview.height === 768, `images: ${JSON.stringify(images)}`);
    expect(await page.locator(".images img").count() === 1, "the preview thumbnail is not on the page");
    return `done in ${Date.now() - t0} ms (re-slice included), output ${JSON.stringify(output.trim())}, preview ${preview?.width}x${preview?.height}`;
  });

  await check("session 1: three lights, then a blocking render while the page keeps ticking", async () => {
    const before = await ticks(page);
    const r = await run(page, SESSION_1);
    const after = await ticks(page);
    const output = done(r);
    expect(output === "lights: ['Key', 'Fill', 'Rim']\nkey at (0.707, -0.843, 0.9)\nsaved //renders/bracket_hero.png\n", `output: ${JSON.stringify(output)}`);
    expect(r.ms > 4000, `the script returned after ${Math.round(r.ms)} ms, before the fake photo could finish`);
    const expected = r.ms / 50;
    expect(after - before >= 0.8 * expected, `${after - before} page ticks in ${Math.round(r.ms)} ms, expected about ${Math.round(expected)}`);
    const files = await page.evaluate(() => window.agentPage.files());
    expect(files.includes("/agent/renders/bracket_hero.png"), `files: ${files.join(", ")}`);
    const render = (await page.evaluate(() => window.agentPage.images())).find((i) => i.label === "render");
    expect(render?.path === "/agent/renders/bracket_hero.png" && render.width === 1600 && render.height === 2000, `render: ${JSON.stringify(render)}`);
    expect(await page.evaluate(() => window.agentPage.shots()) === 1, "the photo card did not keep the photo");
    return `script blocked ${Math.round(r.ms)} ms on render.render, page ticked ${after - before} of ~${Math.round(expected)}, wrote ${render?.path}`;
  });

  await check("session 3: a spot light fails with the booth's recipe and a trimmed traceback, the retry works", async () => {
    const failed = await run(page, lines(
      "import bpy, math",
      "bpy.ops.object.light_add(type='SPOT', location=(-0.4, -0.5, 0.6))",
      "spot = bpy.context.object",
      "spot.data.spot_size = math.radians(30)",
    ));
    const o = failed.outcome;
    expect(o.kind === "failed" && o.type === "RuntimeError" && o.message.startsWith("light_add: the booth has area lights only"), JSON.stringify(o));
    expect(o.kind === "failed" && o.traceback.startsWith("Traceback (most recent call last):\n  File \"<agent>\", line 2, in <module>"), JSON.stringify(o));
    expect(o.kind === "failed" && !o.traceback.includes("/booth/"), "the shim's frames are in the traceback");
    const retry = done(await run(page, lines(
      "import bpy, math",
      "bpy.ops.object.light_add(type='AREA', location=(-0.4, -0.5, 0.6))",
      "spot = bpy.context.object",
      "spot.name = 'Spot'",
      "spot.data.size = 0.1",
      "spot.data.spread = math.radians(30)",
      "spot.data.energy = 50",
      "print(spot.name, spot.data.shape, round(math.degrees(spot.data.spread)))",
    )));
    expect(retry === "Spot RECTANGLE 30\n", `retry: ${JSON.stringify(retry)}`);
    return `failed as RuntimeError at <agent> line 2, retry printed ${JSON.stringify(retry.trim())}`;
  });

  await check("a file the agent's folder does not have is a RuntimeError naming it", async () => {
    const r = await run(page, "import bpy\nbpy.ops.wm.stl_import(filepath='parts/missing.stl')");
    expect(r.outcome.kind === "failed" && r.outcome.message === "bpy.ops.wm.stl_import: cannot read parts/missing.stl: no such file: /agent/parts/missing.stl",
      JSON.stringify(r.outcome));
    return r.outcome.kind === "failed" ? r.outcome.message : "";
  });

  await check("while True: pass leaves the page live, Stop ends it, and the next script runs on a fresh interpreter", async () => {
    await runInUi(page, "while True:\n    pass\n");
    const before = await ticks(page);
    await page.waitForTimeout(1000);
    const during = (await ticks(page)) - before;
    expect(during >= 16, `the page ticked ${during} times in 1 s of a runaway script`);
    const stopped = Date.now();
    await page.getByRole("button", { name: "Stop" }).click();
    const outcome = await outcomeInUi(page, 5000);
    expect(outcome === "cancelled by the user", `outcome: ${outcome}`);
    const next = await run(page, "import bpy\nprint(bpy.context.object.name, bpy.context.scene.camera.data.lens)");
    expect(done(next) === "Spot 100.0\n", `next script: ${JSON.stringify(next)}`);
    return `page ticked ${during} times in 1 s of the loop, the next script printed ${JSON.stringify(next.output.trim())} ${Date.now() - stopped} ms after Stop`;
  });

  await page.screenshot({ path: join(process.env.BOOTH_TMP ?? tmpdir(), "agent-drive.png") });
  await check("no errors in the page console", async () => {
    expect(failures.length === 0, failures.join("\n"));
    return "none";
  });
} finally {
  await s.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
