/**
 * drive.ts: the real app end to end, in a hardware-GPU Chromium.
 *
 *   bun run e2e [flow numbers...] [table]
 *
 * Prints PASS or FAIL per flow with what it observed and exits non-zero on a
 * failure. Screenshots, photos and the native Blender render go to
 * tools/e2e/out/. `table` adds the preview against Cycles brightness table
 * for the five looks (five more Cycles photos). Native Blender is
 * $BLENDER, else ~/apps/blender-5.2.3-linux-x64/blender. The test parts come
 * from $BOOTH_REF, else ~/.t3/scratch/lekv2-photoreal-ref.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { compare, encodePng, sideBySide } from "../parity/image";
import { numberField, openSection, section, setNumber } from "../ui/harness";
import { count, greenMask, iou, maskFromBase64, meanLuma, readPng, resize, sharpness, type Rgba8 } from "./pixels";
import { enterGamescope, REPO, startSession, WIDTH, HEIGHT, type Session } from "./session";

const argv = process.argv.slice(2);
const outcome = await enterGamescope(fileURLToPath(import.meta.url), argv);
if (outcome !== null) process.exit(outcome ? 0 : 1);

const OUT = join(import.meta.dirname, "out");
mkdirSync(OUT, { recursive: true });
const REF = process.env.BOOTH_REF ?? `${process.env.HOME}/.t3/scratch/lekv2-photoreal-ref`;
const BLENDER = process.env.BLENDER ?? `${process.env.HOME}/apps/blender-5.2.3-linux-x64/blender`;
const BSCH04 = join(REF, "bsch04/input/BSCH-04.gcode.3mf");
const BSCH04_NAME = "BSCH-04.gcode.3mf";
const STL = join(REF, "bsch05v2/input/BSCH-05-v2.stl");
const LEKV2 = join(REF, "sliced/plate_1.gcode");
const LOOKS = ["studio", "dark", "gradient", "rim", "raking"] as const;
const GREEN = "#2f9e44";

const say = (line: string) => console.log(`@ ${line}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const f1 = (x: number) => x.toFixed(1), f3 = (x: number) => x.toFixed(3);

class Failed extends Error {}
function expect(cond: boolean, message: string): void {
  if (!cond) throw new Failed(message);
}

async function until<T>(what: string, probe: () => Promise<T | null | false>, ms = 60_000, every = 100): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value !== null && value !== false) return value;
    if (Date.now() > end) throw new Failed(`timed out after ${ms / 1000} s waiting for ${what}`);
    await sleep(every);
  }
}

// ---- the page ------------------------------------------------------------------------------

const session: Session = await startSession();
const page: Page = session.page;
page.setDefaultTimeout(15_000);
page.on("pageerror", (e) => { say(`page error: ${e.message}`); });
page.on("console", (m) => { if (m.type() === "error") say(`console error: ${m.text().slice(0, 300)}`); });

/** Loads the app, with the driver's probe module beside it. */
async function load(query = "", fresh = false): Promise<void> {
  if (fresh) {
    await page.goto(session.origin);
    await page.evaluate(() => { localStorage.clear(); });
  }
  await page.goto(`${session.origin}/${query}`);
  await page.waitForSelector(".app");
  await page.addScriptTag({ type: "module", url: "/tools/e2e/probe.ts" });
  await page.waitForFunction(() => window.boothProbe !== undefined && window.boothDev !== undefined);
}

/** Drops real files on the window the way a desktop drag does. */
async function drop(paths: readonly string[]): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("e2e-files")) return;
    document.body.append(Object.assign(document.createElement("input"), { type: "file", id: "e2e-files", multiple: true, hidden: true }));
  });
  await page.setInputFiles("#e2e-files", [...paths]);
  await page.evaluate(() => {
    const input = document.getElementById("e2e-files");
    if (!(input instanceof HTMLInputElement)) throw new Error("no #e2e-files");
    const transfer = new DataTransfer();
    for (const f of input.files ?? []) transfer.items.add(f);
    for (const type of ["dragenter", "dragover", "drop"]) {
      window.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }
  });
}

const statusMain = () => page.locator(".statusline .status-main").innerText();

async function ready(name: string, ms = 300_000): Promise<number> {
  const t0 = Date.now();
  await until(`${name} ready`, async () => {
    const s = await statusMain();
    if (page.isClosed()) throw new Failed("the page closed");
    if (await page.locator(".banner").count() > 0) throw new Failed(`error banner: ${await page.locator(".banner").innerText()}`);
    return s === `${name} ready`;
  }, ms);
  return Date.now() - t0;
}

async function converged(ms = 120_000): Promise<number> {
  const t0 = Date.now();
  await until("the preview to settle", () => page.evaluate(() => window.boothDev?.viewport?.stats.converged === true), ms, 50);
  return Date.now() - t0;
}

async function openPart(path: string, name: string): Promise<number> {
  await drop([path]);
  const ms = await ready(name);
  await converged();
  return ms;
}

/** The photo frame on the canvas, in page pixels. */
const cropOnPage = () => page.evaluate(() => {
  const canvas = document.querySelector(".canvas-slot canvas");
  const film = window.boothDev?.booth.scene.film;
  if (!(canvas instanceof HTMLCanvasElement) || !film) throw new Error("no canvas");
  const r = canvas.getBoundingClientRect();
  const s = 0.9 * Math.min(r.width / film.width, r.height / film.height);
  return { x: r.x + (r.width - film.width * s) / 2, y: r.y + (r.height - film.height * s) / 2, width: film.width * s, height: film.height * s };
});

/** The settled preview inside the photo frame, as the user sees it. */
async function previewShot(name: string): Promise<{ path: string; img: Rgba8 }> {
  await converged();
  const c = await cropOnPage();
  const clip = { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) };
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, clip });
  return { path, img: readPng(path) };
}

const partMask = (width: number, height: number, erodePx = 3) =>
  page.evaluate(([w, h, e]) => window.boothProbe?.partMask(w, h, e) ?? "", [width, height, erodePx] as const).then(maskFromBase64);

/** The saved document as text, to compare whole. */
const doc = () => page.evaluate(() => window.boothDev?.booth.exportJson() ?? "");

interface Cam { azimuth: number; elevation: number; distance: number; target: number[] }
const isCamera = (v: unknown): v is Cam => typeof v === "object" && v !== null && "azimuth" in v && "elevation" in v && "distance" in v && "target" in v;

const camera = (): Promise<Cam> => page.evaluate(() => {
  const c = window.boothDev?.booth.doc.camera;
  if (!c) throw new Error("no booth");
  return { azimuth: c.azimuth, elevation: c.elevation, distance: c.distance, target: [...c.target] };
});

async function setField(sectionId: string, name: string, value: string): Promise<void> {
  await openSection(page, sectionId);
  await setNumber(page, name, value);
  await until(`${name} to read ${value}`, async () => (await numberField(page, name).inputValue()) === value || Number(await numberField(page, name).inputValue()) === Number(value), 5000);
}

async function setOutput(longEdge: number, samples: number): Promise<void> {
  await setField("output", "Long edge", String(longEdge));
  await setField("output", "Samples", String(samples));
  const film = await page.evaluate(() => window.boothDev?.booth.scene.film);
  expect(film?.samples === samples, `the film has ${film?.samples} samples, not ${samples}`);
}

async function setSwitch(sectionId: string, name: string, on: boolean): Promise<void> {
  const s = await openSection(page, sectionId);
  const sw = s.getByRole("switch", { name, exact: true });
  if ((await sw.isChecked()) !== on) await sw.click();
}

async function setColour(hex: string): Promise<void> {
  const s = await openSection(page, "filament");
  const field = s.getByRole("textbox", { name: "Colour hex" });
  await field.fill(hex);
  await field.press("Enter");
  await until(`the filament colour ${hex}`, () => page.evaluate((v) => window.boothDev?.booth.doc.filament.recipe.colorHex === v, hex), 5000);
}

async function applyLook(id: string): Promise<void> {
  await page.locator("#look-select").selectOption(id);
  await until(`the ${id} look`, () => page.evaluate((v) => window.boothDev?.booth.doc.lookBase === v, id), 5000);
}

// ---- photos ------------------------------------------------------------------------------

interface Shot {
  readonly path: string;
  readonly img: Rgba8;
  readonly readout: string;
  readonly engine: string;
  readonly samples: number;
  readonly ms: number;
  readonly sawRefining: boolean;
  readonly refiningLuma: number | null;
  readonly preparing: string[];
}

const photoButton = () => page.locator(".topbar .photo");
const cardState = () => page.locator(".photo-card .state").innerText().catch(() => "");

/**
 * The refining image the photo card is showing, as a PNG in base64, read from
 * the bitmap the card draws. Not from the screen: in the gamescope session an
 * accelerated 2D canvas neither reads back nor composites (a plain fillRect
 * stays invisible), so a screenshot of the card says nothing about the app.
 */
const refiningImage = () => page.evaluate(async () => {
  const run = window.boothDev?.photos.state.get().run;
  if (run?.phase !== "running" || run.progress.state !== "rendering" || run.progress.image === null) return null;
  const image = run.progress.image;
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});

/** Presses PHOTO and waits for the photo; Save writes it to tools/e2e/out/<name>.png through a real download. */
async function photo(name: string, ms = 600_000, during?: (state: string) => Promise<void>): Promise<Shot> {
  const t0 = Date.now();
  await photoButton().click();
  let sawRefining = false, refiningLuma: number | null = null;
  const preparing: string[] = [];
  await until("the photo to finish", async () => {
    const state = await cardState();
    if (state === "Failed") throw new Failed(`photo failed: ${await page.locator(".photo-card .note").innerText()}`);
    if (state === "Preparing") {
      const text = await page.locator(".photo-card .readout").innerText().catch(() => "");
      if (text && !preparing.includes(text)) preparing.push(text);
    }
    if (!sawRefining && state === "Rendering") {
      const image = await refiningImage();
      if (image !== null) {
        sawRefining = true;
        const p = join(OUT, `${name}-refining.png`);
        writeFileSync(p, Buffer.from(image, "base64"));
        refiningLuma = meanLuma(readPng(p));
      }
    }
    await during?.(state);
    return state === "Done";
  }, ms, 200);
  const readout = await page.locator(".photo-card .readout").innerText();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".photo-card").getByRole("button", { name: "Save" }).click()]);
  const path = join(OUT, `${name}.png`);
  await download.saveAs(path);
  const m = /(\d+) samples, (\w+)/.exec(readout);
  return { path, img: readPng(path), readout, engine: m?.[2] ?? "?", samples: Number(m?.[1] ?? NaN), ms: Date.now() - t0, sawRefining, refiningLuma, preparing };
}

async function closeCard(): Promise<void> {
  const close = page.getByRole("button", { name: "Close the photo card" });
  if (await close.count()) await close.click();
}

// ---- reporting ---------------------------------------------------------------------------

interface Result { readonly flow: string; readonly ok: boolean; readonly detail: string }
const results: Result[] = [];
const wanted = argv.filter((a) => !a.startsWith("--"));

async function flow(id: string, name: string, body: () => Promise<string>): Promise<void> {
  if (wanted.length > 0 && !wanted.includes(id)) return;
  const t0 = Date.now();
  let r: Result;
  try {
    r = { flow: id, ok: true, detail: await body() };
  } catch (e) {
    r = { flow: id, ok: false, detail: e instanceof Error ? e.message : String(e) };
    await page.screenshot({ path: join(OUT, `${id}-failure.png`) }).catch(() => {});
  }
  results.push(r);
  say(`${r.ok ? "PASS" : "FAIL"}  ${id}. ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${r.detail}`);
}

/** Makes sure BSCH-04 is the part on show, opening it in a fresh document when it is not or when asked. */
async function withBsch04(fresh = false): Promise<void> {
  if (!fresh && (await statusMain().catch(() => "")) === `${BSCH04_NAME} ready`) return;
  await load("", true);
  await openPart(BSCH04, BSCH04_NAME);
}

let photo5: { shot: Shot; preview: Rgba8 } | null = null;

try {
  await load("", true);

  await flow("1", "drop the BSCH-04 .gcode.3mf", async () => {
    const readyMs = await openPart(BSCH04, BSCH04_NAME);
    await page.screenshot({ path: join(OUT, "1-app.png") });
    const { img } = await previewShot("1-preview");
    const mask = await partMask(img.width, img.height);
    const part = meanLuma(img, mask), backdrop = meanLuma(img, mask.map((v) => 1 - v));
    const mesh = await page.evaluate(() => {
      const p = window.boothDev?.booth.scene.part?.mesh;
      return p ? { tris: p.tris, layers: p.layerCount, words: p.word.length } : null;
    });
    expect(mesh !== null && mesh.tris > 1e6 && mesh.layers > 100, `the scene's part is ${JSON.stringify(mesh)}`);
    expect(count(mask) > 0.1 * img.width * img.height, `the part covers ${count(mask)} pixels of the frame`);
    expect(backdrop - part > 60, `the part (luma ${f1(part)}) does not stand out from the backdrop (${f1(backdrop)})`);
    const part$ = section(page, "part");
    const sliders = await part$.locator('input[type="range"]').count();
    const facts = (await part$.locator('dl[aria-label="Slicing settings from the file"]').innerText()).replace(/\n/g, " ");
    expect(sliders === 0, `${sliders} slicing sliders in the Part section for a G-code`);
    expect(/Layer height 0\.2 mm/.test(facts), `facts: ${facts}`);
    return `ready ${(readyMs / 1000).toFixed(1)} s after the drop; bead mesh ${mesh?.tris} triangles, ${mesh?.layers} layers; part luma ${f1(part)} on backdrop ${f1(backdrop)}; read-only facts: ${facts}`;
  });

  await flow("2", "top softbox power, then the five looks", async () => {
    await withBsch04();
    await applyLook("studio");
    const before = await previewShot("2-power-before");
    const mask = await partMask(before.img.width, before.img.height);
    await openSection(page, "lights");
    const row = page.locator('details.light[data-light="top"]');
    if ((await row.getAttribute("open")) === null) await row.locator("> summary").click();
    const was = Number(await numberField(page, "Top softbox: Power").inputValue());
    await setNumber(page, "Top softbox: Power", String(was * 3));
    await until("the top light at 3x", () => page.evaluate((w) => {
      const l = window.boothDev?.booth.doc.studio.lights.find((x) => x.id === "top");
      return l?.kind === "area" && Math.abs(l.powerW - w) < 1e-6;
    }, was * 3), 5000);
    const after = await previewShot("2-power-after");
    const lb = meanLuma(before.img, mask), la = meanLuma(after.img, mask);
    expect(la > lb * 1.1 && la - lb > 3, `part luma ${f1(lb)} -> ${f1(la)} after the top softbox went ${was} -> ${was * 3} W`);
    const looks: string[] = [];
    for (const id of LOOKS) {
      await applyLook(id);
      const t0 = Date.now();
      const shot = await previewShot(`2-look-${id}`);
      const m = await partMask(shot.img.width, shot.img.height);
      const part = meanLuma(shot.img, m), all = meanLuma(shot.img);
      expect(all > 3, `the ${id} look is black (mean luma ${f1(all)})`);
      looks.push(`${id} part ${f1(part)} frame ${f1(all)} (${Date.now() - t0} ms)`);
    }
    return `part luma ${f1(lb)} -> ${f1(la)} with the top softbox ${was} -> ${was * 3} W; looks: ${looks.join("; ")}`;
  });

  await flow("3", "orbit with the mouse, reload, the camera and setup come back", async () => {
    await withBsch04();
    await applyLook("rim");
    await converged();
    const start = await camera();
    const c = await cropOnPage();
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    await page.mouse.move(cx - 150, cy);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(cx - 150 + i * 10, cy + i * 2);
    await page.mouse.up();
    await page.mouse.wheel(0, -200);
    await sleep(100);
    // OrbitControls damping keeps turning after the mouse is up, so the document is read as the page goes.
    await page.evaluate(() => {
      window.addEventListener("pagehide", () => {
        const b = window.boothDev?.booth;
        if (!b) return;
        const c = b.doc.camera;
        sessionStorage.setItem("e2e-at-unload", JSON.stringify({ camera: { azimuth: c.azimuth, elevation: c.elevation, distance: c.distance, target: [...c.target] }, doc: b.exportJson() }));
      });
    });
    // No wait: the save is debounced, and a reload right after a drag must still keep it.
    await page.reload();
    await page.waitForSelector(".app");
    await page.addScriptTag({ type: "module", url: "/tools/e2e/probe.ts" });
    await page.waitForFunction(() => window.boothDev !== undefined);
    await sleep(1000);
    const atUnload = await page.evaluate(() => sessionStorage.getItem("e2e-at-unload") ?? "");
    const back = await camera(), setupBack = await doc();
    const orbited: unknown = JSON.parse(atUnload).camera;
    const setup: unknown = JSON.parse(JSON.parse(atUnload).doc);
    if (!isCamera(orbited)) throw new Failed(`no camera recorded at unload: ${atUnload.slice(0, 200)}`);
    expect(Math.abs(orbited.azimuth - start.azimuth) > 5, `the drag moved the azimuth ${f1(start.azimuth)} -> ${f1(orbited.azimuth)}`);
    const same = JSON.stringify(back) === JSON.stringify(orbited);
    expect(same, `camera before reload ${JSON.stringify(orbited)}, after ${JSON.stringify(back)}`);
    expect(isDeepStrictEqual(JSON.parse(setupBack), setup), "the document differs after the reload");
    await openPart(BSCH04, BSCH04_NAME);
    const reopened = await camera();
    await previewShot("3-after-reload");
    expect(Math.abs(reopened.azimuth - orbited.azimuth) < 1e-6 && Math.abs(reopened.elevation - orbited.elevation) < 1e-6,
      `opening the part again turned the camera: ${JSON.stringify(reopened)}`);
    return `azimuth ${f1(start.azimuth)} -> ${f1(orbited.azimuth)}, elevation ${f1(start.elevation)} -> ${f1(orbited.elevation)}, distance ${f3(start.distance)} -> ${f3(orbited.distance)} m; identical after reload, look ${await page.evaluate(() => window.boothDev?.booth.doc.lookBase)}; reopening the part keeps the angles and reframes the distance to ${f3(reopened.distance)} m`;
  });

  await flow("4", "resize the window", async () => {
    await withBsch04();
    const sizes: string[] = [];
    for (const [w, h] of [[1100, 700], [WIDTH, HEIGHT - 80]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(300);
      await converged();
      const canvas = await page.evaluate(() => {
        const el = document.querySelector(".canvas-slot canvas");
        if (!(el instanceof HTMLCanvasElement)) throw new Error("no canvas");
        return { cw: el.clientWidth, ch: el.clientHeight, bw: el.width, bh: el.height, dpr: devicePixelRatio };
      });
      expect(Math.abs(canvas.bw - Math.round(canvas.cw * canvas.dpr)) <= 1 && Math.abs(canvas.bh - Math.round(canvas.ch * canvas.dpr)) <= 1,
        `drawing buffer ${canvas.bw}x${canvas.bh} for a canvas of ${canvas.cw}x${canvas.ch} CSS px`);
      const c = await cropOnPage();
      const path = join(OUT, `4-resized-${w}x${h}.png`);
      const box = await page.locator(".canvas-slot canvas").boundingBox();
      if (!box) throw new Failed("no canvas box");
      await page.screenshot({ path, clip: box });
      const img = readPng(path);
      // The dimmed band: just outside the crop's left edge against just inside it, on the backdrop row a third down.
      const row = Math.round(c.y - box.y + c.height / 3), xIn = Math.round(c.x - box.x + 6), xOut = Math.round(c.x - box.x - 6);
      const at = (x: number) => { const p = row * img.width + x; return 0.2126 * img.data[p * 4] + 0.7152 * img.data[p * 4 + 1] + 0.0722 * img.data[p * 4 + 2]; };
      const inside = at(xIn), outside = at(xOut);
      expect(outside < inside * 0.9, `no dimmed band at the crop edge: ${f1(outside)} outside against ${f1(inside)} inside`);
      const aspect = c.width / c.height, film = await page.evaluate(() => { const f = window.boothDev?.booth.scene.film; return f ? f.width / f.height : 0; });
      expect(Math.abs(aspect - film) < 1e-3, `the crop's aspect ${aspect} is not the film's ${film}`);
      sizes.push(`${w}x${h}: buffer ${canvas.bw}x${canvas.bh} = canvas ${canvas.cw}x${canvas.ch}, crop ${Math.round(c.width)}x${Math.round(c.height)} at aspect ${f3(aspect)}, band ${f1(outside)} against ${f1(inside)}`);
    }
    return sizes.join("; ");
  });

  await flow("5", "PHOTO through Cycles at 800x1000, 64 samples, against the preview", async () => {
    await withBsch04(true);
    await applyLook("studio");
    await setColour(GREEN);
    await setOutput(1000, 64);
    const preview = await previewShot("5-preview");
    const shot = await photo("5-cycles");
    photo5 = { shot, preview: preview.img };
    const film = await page.evaluate(() => window.boothDev?.booth.scene.film);
    expect(shot.engine === "Cycles", `engine ${shot.engine}: ${shot.readout} ${shot.preparing.join(" | ")}`);
    expect(shot.sawRefining && (shot.refiningLuma ?? 0) > 10, `refining image seen ${shot.sawRefining}, luma ${shot.refiningLuma}`);
    expect(shot.img.width === film?.width && shot.img.height === film.height, `the PNG is ${shot.img.width}x${shot.img.height}, the film ${film?.width}x${film?.height}`);
    const all = meanLuma(shot.img);
    expect(all > 20, `the saved PNG is black: mean luma ${f1(all)}`);
    const small = resize(shot.img, preview.img.width, preview.img.height);
    const a = greenMask(preview.img), b = greenMask(small);
    const overlap = iou(a, b);
    writeFileSync(join(OUT, "5-preview-vs-cycles.png"), encodePng(sideBySide(preview.img, small)));
    const mPhoto = await partMask(shot.img.width, shot.img.height), mPreview = await partMask(preview.img.width, preview.img.height);
    const lumaPhoto = meanLuma(shot.img, mPhoto), lumaPreview = meanLuma(preview.img, mPreview);
    expect(overlap > 0.97, `silhouette IoU ${f3(overlap)} (${count(a)} and ${count(b)} part pixels)`);
    return `${shot.readout} in ${(shot.ms / 1000).toFixed(1)} s, refining image luma ${f1(shot.refiningLuma ?? NaN)}; PNG ${shot.img.width}x${shot.img.height} mean luma ${f1(all)}; silhouette IoU ${f3(overlap)} over ${count(a)} px; mean part luma preview ${f1(lumaPreview)}, Cycles ${f1(lumaPhoto)}`;
  });

  await flow("6", "native Blender on the exported scene against the browser photo", async () => {
    if (photo5 === null) throw new Failed("needs flow 5's photo");
    const dir = join(OUT, "6-scene");
    mkdirSync(dir, { recursive: true });
    const file = await page.evaluate(() => {
      const p = window.boothProbe;
      if (!p) throw new Error("no probe");
      return p.sceneFile();
    });
    writeFileSync(join(dir, "scene.json"), file.json);
    const chunkBytes = 6 << 20;
    for (const b of file.buffers) {
      const bytes = new Uint8Array(b.bytes);
      for (let start = 0; start < b.bytes; start += chunkBytes) {
        const part = await page.evaluate(([n, s, e]) => window.boothProbe?.chunk(n, s, e) ?? "", [b.name, start, Math.min(b.bytes, start + chunkBytes)] as const);
        bytes.set(Buffer.from(part, "base64"), start);
      }
      writeFileSync(join(dir, `${b.name}.bin`), bytes);
    }
    const out = join(OUT, "6-blender.png");
    const r = spawnSync(BLENDER, ["-b", "--factory-startup", "--debug-cycles", "--python", join(REPO, "tools/blender/render_scene.py"),
      "--", join(dir, "scene.json"), out, "--view", "film"], { encoding: "utf8", maxBuffer: 1 << 28 });
    writeFileSync(join(OUT, "6-blender.log"), `${r.stdout}\n${r.stderr}`);
    const line = /BOOTH_NATIVE build ([\d.]+)s render ([\d.]+)s/.exec(r.stdout);
    expect(r.status === 0 && line !== null, `Blender failed, see ${join(OUT, "6-blender.log")}`);
    const native = readPng(out);
    const d = compare(photo5.shot.img, native);
    writeFileSync(join(OUT, "6-cycles-vs-blender.png"), encodePng(sideBySide(photo5.shot.img, native)));
    const mask = await partMask(native.width, native.height);
    expect(d.psnrDb > 35, `PSNR ${f1(d.psnrDb)} dB`);
    return `PSNR ${d.psnrDb.toFixed(2)} dB, mean |d| ${f3(d.meanAbs)}/255, ${(d.over4 * 100).toFixed(2)} % of pixels over 4/255; part luma browser ${f1(meanLuma(photo5.shot.img, mask))}, Blender ${f1(meanLuma(native, mask))}; Blender built in ${line?.[1]} s, rendered in ${line?.[2]} s`;
  });

  await flow("7", "cancel mid-render, then Finish now", async () => {
    await withBsch04();
    await closeCard();
    await photoButton().click();
    await until("a refining image", async () => (await page.locator('.photo-card canvas[aria-label="The photo so far"]').count()) > 0, 120_000);
    const t0 = Date.now();
    await page.locator(".photo-card").getByRole("button", { name: "Cancel" }).click();
    await until("PHOTO usable again", () => photoButton().isEnabled(), 5000, 10);
    const usableMs = Date.now() - t0;
    const state = await cardState();
    expect(usableMs < 1000, `PHOTO came back ${usableMs} ms after Cancel`);
    expect(state === "Cancelled", `the card says ${state}`);
    const film = await page.evaluate(() => window.boothDev?.booth.scene.film.samples ?? 0);
    let pressed = false;
    const shot = await photo("7-finished-early", 600_000, async () => {
      if (pressed || (await page.locator('.photo-card canvas[aria-label="The photo so far"]').count()) === 0) return;
      pressed = true;
      await page.locator(".photo-card").getByRole("button", { name: "Finish now" }).click();
    });
    expect(shot.samples < film && shot.samples > 0, `Finish now gave ${shot.readout}, the film asks ${film}`);
    expect(meanLuma(shot.img) > 20, "the early photo is black");
    return `PHOTO usable ${usableMs} ms after Cancel (card: ${state}); Finish now: ${shot.readout} of ${film}, ${(shot.ms / 1000).toFixed(1)} s`;
  });

  await flow("8", "Cycles unavailable falls back to the raster engine", async () => {
    await load("?no-cycles");
    await openPart(BSCH04, BSCH04_NAME);
    const shot = await photo("8-raster");
    const film = await page.evaluate(() => window.boothDev?.booth.scene.film);
    expect(shot.engine === "Raster", `engine ${shot.engine}`);
    expect(shot.img.width === film?.width && shot.img.height === film.height, `PNG ${shot.img.width}x${shot.img.height}`);
    const mask = await partMask(shot.img.width, shot.img.height);
    const part = meanLuma(shot.img, mask), all = meanLuma(shot.img);
    expect(all > 20 && part > 5, `the raster photo is black: mean ${f1(all)}, part ${f1(part)}`);
    await closeCard();
    await load("");
    return `${shot.readout} in ${(shot.ms / 1000).toFixed(1)} s; first said "${shot.preparing.join(" | ")}"; mean luma ${f1(all)}, part ${f1(part)}`;
  });

  await flow("9", "a transparent background has real alpha", async () => {
    await withBsch04();
    await setOutput(1000, 32);
    await setSwitch("output", "Transparent background", true);
    const shot = await photo("9-transparent");
    await setSwitch("output", "Transparent background", false);
    const { img } = shot;
    const mask = await partMask(img.width, img.height);
    let zero = 0, partial = 0, partOpaque = 0;
    for (let px = 0; px < img.width * img.height; px++) {
      const a = img.data[px * 4 + 3];
      if (mask[px]) { if (a === 255) partOpaque++; continue; }
      if (a === 0) zero++;
      else if (a < 255) partial++;
    }
    const outside = img.width * img.height - count(mask);
    const corner = img.data[3];
    expect(corner === 0 && zero > 0.5 * outside, `outside the part ${zero} of ${outside} pixels are transparent, corner alpha ${corner}`);
    expect(partOpaque > 0.99 * count(mask), `${partOpaque} of ${count(mask)} part pixels are opaque`);
    expect(partial > 100, `only ${partial} semi-transparent pixels: no shadow`);
    return `${shot.readout}; outside the part ${(100 * zero / outside).toFixed(1)} % fully transparent and ${partial} px partly (the shadow); ${(100 * partOpaque / count(mask)).toFixed(2)} % of part pixels opaque`;
  });

  await flow("10", "an STL slices, re-slices, and a G-code dropped mid-slice wins", async () => {
    await load("", true);
    const t0 = Date.now();
    await drop([STL]);
    await ready("BSCH-05-v2.stl", 300_000);
    const sliceMs = Date.now() - t0;
    await converged();
    await previewShot("10-stl");
    const facts = () => section(page, "part").locator(".facts").first().innerText().then((t) => t.replace(/\n/g, " "));
    const layers = async () => Number(/([\d,]+) layers/.exec(await facts())?.[1].replace(/,/g, "") ?? NaN);
    const before = await layers();
    const t1 = Date.now();
    await setField("part", "Layer height", "0.28");
    await until("the re-slice to start", async () => (await statusMain()) !== "BSCH-05-v2.stl ready", 5000, 20);
    await ready("BSCH-05-v2.stl", 300_000);
    const after = await layers();
    const resliceMs = Date.now() - t1;
    expect(after !== before && after < before, `layers ${before} -> ${after} at 0.28 mm`);
    await converged();
    await previewShot("10-stl-0.28");
    await setField("part", "Layer height", "0.12");
    await until("re-slicing", async () => /slicing/i.test(await statusMain()), 5000, 20);
    await drop([BSCH04]);
    await ready(BSCH04_NAME);
    await sleep(Math.max(15_000, sliceMs));
    const status = await statusMain(), part = await facts();
    expect(status === `${BSCH04_NAME} ready` && part.includes(BSCH04_NAME), `after the stale slice could have landed: "${status}", part ${part}`);
    expect(await section(page, "part").locator('dl[aria-label="Slicing settings from the file"]').count() === 1, "the G-code's slicing is not read-only");
    return `sliced in ${(sliceMs / 1000).toFixed(1)} s, ${before} layers; at 0.28 mm re-sliced in ${(resliceMs / 1000).toFixed(1)} s to ${after} layers; G-code dropped during the 0.12 mm re-slice: "${status}" and still so ${Math.round(Math.max(15_000, sliceMs) / 1000)} s later`;
  });

  await flow("11", "depth of field at f/2.8 focused on the front edge", async () => {
    await withBsch04();
    await setOutput(1000, 64);
    await setField("camera", "Aperture", "11");
    const edges = async () => page.evaluate(() => {
      const p = window.boothProbe;
      if (!p) throw new Error("no probe");
      return p.topEdges();
    });
    const measure = (img: Rgba8, e: Awaited<ReturnType<typeof edges>>) => {
      const hw = img.width * 0.12, hh = img.height * 0.02;
      const near = sharpness(img, e.near[0] * img.width, e.near[1] * img.height, hw, hh);
      const far = sharpness(img, e.far[0] * img.width, e.far[1] * img.height, hw, hh);
      return { near, far, ratio: far / near };
    };
    const e = await edges();
    const sharp = await previewShot("11-preview-f11");
    const cSharp = await photo("11-cycles-f11");
    await closeCard();
    await setField("camera", "Aperture", "2.8");
    const camSection = await openSection(page, "camera");
    await camSection.getByRole("button", { name: "Focus on part" }).click();
    const c = await cropOnPage();
    // Just below the top front edge, on the front wall: a point on the part at the edge's depth.
    await page.mouse.click(c.x + e.near[0] * c.width, c.y + (e.near[1] + 0.02) * c.height);
    await until("the focus point", () => page.evaluate(() => window.boothDev?.booth.doc.camera.focusPartPoint !== null), 5000);
    const focus = await page.evaluate(() => window.boothDev?.booth.scene.camera.focusDistanceM ?? NaN);
    const soft = await previewShot("11-preview-f2.8");
    const cSoft = await photo("11-cycles-f2.8");
    await closeCard();
    const p11 = measure(sharp.img, e), p28 = measure(soft.img, e), c11 = measure(cSharp.img, e), c28 = measure(cSoft.img, e);
    const row = (n: string, a: typeof p11, b: typeof p11) => `${n}: near ${f1(a.near)} -> ${f1(b.near)}, far ${f1(a.far)} -> ${f1(b.far)}`;
    expect(p28.ratio < 0.75 * p11.ratio, `preview far/near sharpness ${f3(p11.ratio)} at f/11, ${f3(p28.ratio)} at f/2.8`);
    expect(c28.ratio < 0.75 * c11.ratio, `Cycles far/near sharpness ${f3(c11.ratio)} at f/11, ${f3(c28.ratio)} at f/2.8`);
    await setField("camera", "Aperture", "11");
    return `focus at ${f3(focus)} m (front edge ${f3(e.nearDepthM)} m, back edge ${f3(e.farDepthM)} m); gradient energy f/11 -> f/2.8, ${row("preview", p11, p28)}; ${row("Cycles", c11, c28)}`;
  });

  await flow("12", "LEKV2 at 1600x2000, 256 samples through Cycles", async () => {
    await load("", true);
    const parseMs = await openPart(LEKV2, "plate_1.gcode");
    const tris = await page.evaluate(() => window.boothDev?.booth.scene.part?.mesh.tris ?? 0);
    await previewShot("12-lekv2-preview");
    const shot = await photo("12-lekv2-cycles", 3_600_000);
    const stats = await page.evaluate(() => window.boothDev?.cyclesStats.at(-1) ?? null);
    expect(shot.engine === "Cycles" && stats !== null, `${shot.readout}`);
    expect(meanLuma(shot.img) > 20, "the LEKV2 photo is black");
    const s = stats ?? { syncMs: NaN, bvhMs: NaN, samplingMs: NaN, heapBytes: NaN, cyclesPeakBytes: NaN, threads: NaN };
    return `${tris} triangles; G-code parsed and meshed in ${(parseMs / 1000).toFixed(1)} s; ${shot.readout}; press to saved ${(shot.ms / 1000).toFixed(0)} s; `
      + `start to first sample ${(s.syncMs / 1000).toFixed(1)} s of which BVH ${(s.bvhMs / 1000).toFixed(1)} s, sampling ${(s.samplingMs / 1000).toFixed(1)} s, `
      + `wasm heap ${(s.heapBytes / 2 ** 20).toFixed(0)} MiB, Cycles peak ${(s.cyclesPeakBytes / 2 ** 20).toFixed(0)} MiB, ${s.threads} threads`;
  });

  await flow("table", "preview against Cycles brightness for the five looks", async () => {
    await load("", true);
    await openPart(BSCH04, BSCH04_NAME);
    await setOutput(1000, 64);
    const rows: string[] = [];
    for (const id of LOOKS) {
      await applyLook(id);
      const preview = await previewShot(`table-${id}-preview`);
      const shot = await photo(`table-${id}-cycles`);
      await closeCard();
      const lp = meanLuma(preview.img, await partMask(preview.img.width, preview.img.height));
      const lc = meanLuma(shot.img, await partMask(shot.img.width, shot.img.height));
      rows.push(`${id} preview ${f1(lp)} Cycles ${f1(lc)} ratio ${f3(lp / lc)}`);
    }
    return rows.join("; ");
  });
} finally {
  await session.close();
}
const failed = results.filter((r) => !r.ok).length;
say(`${results.length - failed} passed, ${failed} failed`);
if (failed === 0 && results.length > 0) say("ok");
process.exit(0);
