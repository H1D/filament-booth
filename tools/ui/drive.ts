/**
 * drive.ts: drives dev/panels.html in headless Chromium and reports each
 * check as PASS or FAIL with what it saw. Run it with `bun run ui:drive`.
 * It exits non-zero when any check fails, and leaves one screenshot in
 * tools/ui/out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  dropFile, numberField, openPanels, openSection, section, setNumber, standIn, start, type Session,
} from "./harness";

const OUT = join(import.meta.dirname, "out");
mkdirSync(OUT, { recursive: true });

interface Result { readonly name: string; readonly ok: boolean; readonly detail: string }
const results: Result[] = [];

async function check(name: string, body: () => Promise<string>): Promise<void> {
  try {
    const detail = await body();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  const r = results[results.length - 1];
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

async function until<T>(what: string, probe: () => Promise<T | null | false>, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value !== null && value !== false) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const text = (page: Page, selector: string): Promise<string> => page.locator(selector).first().innerText();

async function inputValue(page: Page, name: string): Promise<string> {
  return numberField(page, name).inputValue();
}

async function lightPower(page: Page, id: string): Promise<number | null> {
  const readout = await standIn(page);
  return readout?.lights.find((l) => l.id === id)?.powerW ?? null;
}

async function expandLight(page: Page, id: string): Promise<void> {
  const row = page.locator(`details.light[data-light="${id}"]`);
  if ((await row.getAttribute("open")) === null) await row.locator("> summary").click();
}

async function ready(page: Page, file: string): Promise<void> {
  await page.locator(".statusline").getByText(`${file} ready`).waitFor();
}

const session: Session = await start();
const { page } = session;
page.setDefaultTimeout(10_000);

try {
  await openPanels(session, { fresh: true });

  await check("drop a file to the ready state", async () => {
    const empty = await text(page, ".empty-card");
    expect(/\.stl/.test(empty) && /\.gcode\b/.test(empty) && /\.gcode\.3mf/.test(empty), `empty state does not name the file types: ${empty.replace(/\n/g, " ")}`);
    const photoWas = await page.locator(".topbar .photo").isDisabled();
    await dropFile(page, "bracket.stl", "stl");
    const seen = new Set<string>();
    await until("the ready status", async () => {
      const pill = await page.locator(".stage .pill").first().innerText().catch(() => "");
      if (pill !== "") seen.add(pill.replace(/\s+/g, " ").trim());
      return (await page.locator(".statusline").innerText()).includes("bracket.stl ready");
    });
    const geometry = await text(page, '[data-section="part"] .facts');
    expect(await standIn(page).then((r) => r?.hasPart === true), "the stand-in viewport shows no part");
    expect(await page.locator(".topbar .photo").isEnabled(), "PHOTO is not enabled once the part is ready");
    expect(photoWas, "PHOTO was enabled with nothing open");
    expect(await page.locator(".empty").count() === 0, "the empty state is still showing");
    return `loading text seen: ${[...seen].join(" | ")}; part facts: ${geometry.replace(/\n/g, " ")}`;
  });

  await check("a slider takes a typed value and updates the light list in the stand-in", async () => {
    await expandLight(page, "top");
    const before = await lightPower(page, "top");
    await setNumber(page, "Top softbox: Power", "20");
    const after = await until("the stand-in to show 20 W", async () => ((await lightPower(page, "top")) === 20 ? 20 : null));
    expect(before !== after, "the power did not change");
    return `top softbox ${before} W -> ${after} W; field shows ${await inputValue(page, "Top softbox: Power")}`;
  });

  await check("double-click and Delete reset a slider to its default", async () => {
    const range = page.getByRole("slider", { name: "Top softbox: Power" });
    await range.dblclick();
    const afterDouble = await inputValue(page, "Top softbox: Power");
    await setNumber(page, "Top softbox: Power", "30");
    await range.focus();
    await page.keyboard.press("Delete");
    const afterDelete = await inputValue(page, "Top softbox: Power");
    expect(afterDouble === "12.5" && afterDelete === "12.5", `expected 12.5 both times, got ${afterDouble} and ${afterDelete}`);
    return `double-click -> ${afterDouble} W, Delete -> ${afterDelete} W (the look's value)`;
  });

  await check("a look then an edit shows the modified mark", async () => {
    const tag = page.locator(".look-pick .tag");
    await page.locator(".chip", { hasText: "Dark" }).click();
    await until("the Dark look", async () => ((await page.locator("#look-select").inputValue()) === "dark" ? true : null));
    const cleanAfterLook = (await tag.count()) === 0 && (await section(page, "lights").getAttribute("data-modified")) === null;
    expect(cleanAfterLook, "a freshly applied look is already marked modified");
    await expandLight(page, "top");
    await setNumber(page, "Top softbox: Power", "9");
    await until("the modified tag", async () => ((await tag.count()) === 1 ? true : null));
    const marked = await section(page, "lights").getAttribute("data-modified");
    const chip = await page.locator(".chip[data-marked]").innerText();
    expect(marked !== null && chip === "Dark", "the lights section or the look chip is not marked");
    return `Dark applied clean; after editing, top bar tag "${await tag.innerText()}", Lights section marked, chip "${chip}" flagged`;
  });

  await check("resetting a section restores the look and clears the mark", async () => {
    await section(page, "lights").getByRole("button", { name: "Reset Lights" }).click();
    await until("the mark to clear", async () => ((await section(page, "lights").getAttribute("data-modified")) === null ? true : null));
    const power = await lightPower(page, "top");
    expect(power === 3, `top light is ${power} W, the Dark look has 3 W`);
    expect(await page.locator(".look-pick .tag").count() === 0, "the top bar still says modified");
    expect(await section(page, "lights").getByRole("button", { name: "Reset Lights" }).count() === 0, "the reset button stays when nothing is modified");

    await openSection(page, "pose");
    await setNumber(page, "Turntable", "45");
    await until("the pose mark", async () => ((await section(page, "pose").getAttribute("data-modified")) !== null ? true : null));
    await section(page, "pose").getByRole("button", { name: "Reset Pose" }).click();
    await until("the pose mark to clear", async () => ((await section(page, "pose").getAttribute("data-modified")) === null ? true : null));
    return `Lights reset to the Dark look (top 3 W), mark and button gone; Pose 45 -> ${await inputValue(page, "Turntable")} degrees after reset`;
  });

  await check("an STL slicing edit shows the re-slicing state", async () => {
    await openSection(page, "part");
    const layersBefore = await text(page, '[data-section="part"] .facts');
    await setNumber(page, "Layer height", "0.12");
    const busy = await until("the re-slicing status", async () => {
      const t = await text(page, '[data-section="part"] .busy');
      return /re-slicing/i.test(t) ? t : null;
    }, 4000);
    const pill = await text(page, ".stage .pill").catch(() => "");
    await until("the new slice", async () => ((await text(page, '[data-section="part"] .facts')) !== layersBefore ? true : null), 6000);
    const layersAfter = await text(page, '[data-section="part"] .facts');
    expect(await section(page, "part").getAttribute("data-modified") !== null, "the part section is not marked modified");
    return `status "${busy.trim()}", stage pill "${pill}"; facts ${layersBefore.replace(/\n/g, " ")} -> ${layersAfter.replace(/\n/g, " ")}`;
  });

  await check("a G-code shows its slicing read-only", async () => {
    await dropFile(page, "benchy.gcode", "gcode");
    await until("the G-code ready", async () => ((await page.locator(".statusline").innerText()).includes("benchy.gcode ready") ? true : null));
    const part = section(page, "part");
    const sliders = await part.locator('input[type="range"]').count();
    const note = await part.locator(".note").innerText();
    const facts = await part.locator('dl[aria-label="Slicing settings from the file"]').innerText();
    expect(sliders === 0, `${sliders} sliders are still in the slicing section`);
    expect(/from the G-code file/i.test(note), `no read-only note: ${note}`);
    expect(await part.getByRole("button", { name: /Reset/ }).count() === 0, "a reset button is offered for read-only slicing");
    return `0 sliders; note "${note}"; file values ${facts.replace(/\n/g, " ")}`;
  });

  await dropFile(page, "bracket.stl", "stl");
  await until("the STL back", async () => ((await page.locator(".statusline").innerText()).includes("bracket.stl ready") ? true : null));

  await check("an error keeps the last part on screen", async () => {
    await dropFile(page, "notes.txt", "gcode");
    const banner = await until("the error banner", async () => {
      const t = await page.locator(".banner").first().innerText().catch(() => "");
      return t === "" ? null : t;
    });
    const status = await page.locator(".statusline").innerText();
    const shown = (await standIn(page))?.hasPart === true;
    expect(shown, "the part is gone after the error");
    expect(/\.stl, \.gcode or \.gcode\.3mf/.test(banner), `the banner does not name the problem: ${banner}`);
    await page.getByRole("button", { name: "Dismiss the error" }).click();
    expect(await page.locator(".banner").count() === 0, "the banner stays after Dismiss");
    return `banner "${banner.replace(/\n/g, " ")}"; status line shows the message: ${status.includes("drop an .stl")}; part still in the viewport`;
  });

  await check("a top pattern the slicer accepts but the booth could not name before can be chosen", async () => {
    const part = await openSection(page, "part");
    const select = part.locator('select[aria-label="Top pattern"]');
    const labels = await select.locator("option").allInnerTexts();
    expect(labels.includes("Hilbert curve") && labels.length === 8, `the select offers ${labels.join(", ")}`);
    await select.selectOption("hilbert-curve");
    await until("the select to show it", async () => ((await select.inputValue()) === "hilbert-curve" ? true : null));
    expect(await part.getAttribute("data-modified") !== null, "the part section is not marked modified");
    await select.selectOption("monotonic");
    return `${labels.length} patterns (${labels.join(", ")}); Hilbert curve chosen and the section marked modified`;
  });

  await check("a filament preset nobody calibrated is marked as an estimate", async () => {
    const filament = await openSection(page, "filament");
    const select = filament.locator('select[aria-label="Preset"]');
    const labels = await select.locator("option").allInnerTexts();
    expect(labels.join("|") === "PETG Basic|PLA Basic (estimate)|PLA Matte|PLA Silk (estimate)", `the presets read ${labels.join(", ")}`);
    await select.selectOption("pla-silk");
    const shown = await select.evaluate((el) => (el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.textContent ?? "") : ""));
    await select.selectOption("petg-basic");
    expect(shown === "PLA Silk (estimate)", `with PLA Silk chosen the select reads ${shown}`);
    return `presets read ${labels.join(", ")}; PLA Silk chosen reads "${shown}"`;
  });

  await check("a focal preset keeps the framing", async () => {
    await openSection(page, "camera");
    const before = await standIn(page);
    if (before === null) throw new Error("no readout");
    await page.locator(".chip", { hasText: /^35$/ }).click();
    const after = await until("the 35 mm camera", async () => {
      const r = await standIn(page);
      return r !== null && r.camera.focalMm === 35 ? r : null;
    });
    const expected = (before.camera.distanceM * 35) / before.camera.focalMm;
    expect(Math.abs(after.camera.distanceM - expected) / expected < 0.01, `distance ${after.camera.distanceM} is not ${expected}`);
    await setNumber(page, "Focal length", "135");
    const long = await until("the 135 mm camera", async () => {
      const r = await standIn(page);
      return r !== null && r.camera.focalMm === 135 ? r : null;
    });
    expect(long.camera.distanceM > after.camera.distanceM, "a longer lens did not move the camera back");
    return `85 mm at ${before.camera.distanceM.toFixed(3)} m -> 35 mm at ${after.camera.distanceM.toFixed(3)} m (fov ${before.camera.fovYDeg.toFixed(1)} -> ${after.camera.fovYDeg.toFixed(1)} deg) -> 135 mm at ${long.camera.distanceM.toFixed(3)} m`;
  });

  await check("aperture is on the standard f-stop scale", async () => {
    await setNumber(page, "Aperture", "5.6");
    const r = await until("f/5.6", async () => {
      const x = await standIn(page);
      return x !== null && x.camera.fStop === 5.6 ? x : null;
    });
    const range = page.getByRole("slider", { name: "Aperture" });
    await range.focus();
    await page.keyboard.press("ArrowRight");
    const next = await until("one step wider", async () => {
      const x = await standIn(page);
      return x !== null && x.camera.fStop !== 5.6 ? x : null;
    });
    expect(next.camera.fStop === 6.3, `one step up from f/5.6 gave f/${next.camera.fStop}`);
    return `typed 5.6 -> f/${r.camera.fStop}; ArrowRight -> f/${next.camera.fStop} (third-stop scale); spoken value "${await range.getAttribute("aria-valuetext")}"`;
  });

  await check("the focus tool picks a point and clears", async () => {
    const tool = page.getByRole("button", { name: "Focus on part" });
    await tool.click();
    expect(await tool.getAttribute("aria-pressed") === "true", "the focus tool does not show as active");
    await page.keyboard.press("Escape");
    expect(await tool.getAttribute("aria-pressed") === "false", "Escape did not cancel the focus tool");
    await tool.click();
    await page.locator(".canvas-slot canvas").click({ position: { x: 300, y: 300 } });
    const note = await until("the focus note", async () => {
      const t = await text(page, '[data-section="camera"] .note');
      return /Focused on the part/.test(t) ? t : null;
    });
    expect(await tool.getAttribute("aria-pressed") === "false", "the tool stays on after a pick");
    await page.getByRole("button", { name: "Clear focus" }).click();
    const cleared = await until("focus cleared", async () => {
      const t = await text(page, '[data-section="camera"] .note');
      return /orbit target/.test(t) ? t : null;
    });
    return `pick -> "${note}"; Clear -> "${cleared}"`;
  });

  let photosTaken = 0;

  await check("PHOTO runs to done with Save enabled", async () => {
    await page.locator(".topbar .photo").click();
    const states = new Set<string>();
    let sawProgress = false;
    let sawEta = false;
    await until("the photo to finish", async () => {
      const state = await text(page, ".photo-card .state").catch(() => "");
      if (state !== "") states.add(state);
      const bar = await page.locator(".photo-card progress").getAttribute("value").catch(() => null);
      if (bar !== null && Number(bar) > 0) sawProgress = true;
      if (/left/.test(await text(page, ".photo-card .readout").catch(() => ""))) sawEta = true;
      return state === "Done" ? true : null;
    }, 15_000);
    const save = page.getByRole("button", { name: "Save" });
    expect(await save.isEnabled(), "Save is not enabled");
    const meta = await text(page, ".photo-card .readout");
    photosTaken += 1;
    expect(await page.locator(".photo-card .thumbs li").count() === photosTaken, "the thumbnail tray did not gain a photo");
    expect(sawProgress && sawEta, `progress bar seen ${sawProgress}, time left seen ${sawEta}`);
    const download = page.waitForEvent("download");
    await save.click();
    const file = await download;
    return `states seen ${[...states].join(" > ")}; progress bar and time left shown; result "${meta}"; Save downloaded ${file.suggestedFilename()}`;
  });

  await check("Cancel mid-run stops the photo", async () => {
    await page.locator(".topbar .photo").click();
    await until("rendering", async () => ((await text(page, ".photo-card .state").catch(() => "")) === "Rendering" ? true : null));
    const finish = await page.getByRole("button", { name: "Finish now" }).isEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await until("cancelled", async () => ((await text(page, ".photo-card .state").catch(() => "")) === "Cancelled" ? true : null));
    expect(await page.getByRole("button", { name: "Save" }).count() === 0, "Save is offered for a cancelled photo");
    expect(await page.locator(".topbar .photo").isEnabled(), "PHOTO stays disabled after a cancel");
    expect(await page.locator(".photo-card .thumbs li").count() === photosTaken, "a cancelled photo reached the tray");
    return `Finish now was enabled mid-run: ${finish}; card shows "Cancelled", no Save, PHOTO enabled again, tray still ${photosTaken}`;
  });

  await check("Finish now develops what exists", async () => {
    await page.locator(".topbar .photo").click();
    await until("rendering", async () => ((await text(page, ".photo-card .state").catch(() => "")) === "Rendering" ? true : null));
    const started = Date.now();
    await page.getByRole("button", { name: "Finish now" }).click();
    await until("done", async () => ((await text(page, ".photo-card .state").catch(() => "")) === "Done" ? true : null), 5000);
    photosTaken += 1;
    const lines = (await page.locator(".photo-card .readout").allInnerTexts()).join(" | ");
    expect(/\d+ of \d+ samples/.test(lines) && lines.includes("Finished early."), `the card reads "${lines}" after Finish now`);
    return `done ${((Date.now() - started) / 1000).toFixed(1)} s after Finish now, tray holds ${await page.locator(".photo-card .thumbs li").count()}; the card reads "${lines}"`;
  });

  await check("the time limit offers nine choices and starts at 5 minutes", async () => {
    const output = await openSection(page, "output");
    const limit = output.getByRole("combobox", { name: "Time limit", exact: true });
    const offered = await limit.locator("option").allInnerTexts();
    expect(offered.length === 9 && offered[0] === "No limit" && offered[8] === "1 hour", `options: ${offered.join(", ")}`);
    expect((await limit.inputValue()) === "300", `the limit starts at ${await limit.inputValue()} s`);
    await limit.selectOption({ label: "10 minutes" });
    await until("the setup to hold 600 s", async () => ((await limit.inputValue()) === "600" ? true : null), 3000);
    return `options ${offered.join(", ")}; default 300 s; picked 10 minutes -> 600 s`;
  });

  await check("export then import restores an edited value", async () => {
    await openSection(page, "output");
    await setNumber(page, "Samples", "777");
    await openSection(page, "setup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const file = await download;
    const path = join(OUT, "exported-setup.json");
    await file.saveAs(path);
    const exported: unknown = JSON.parse(readFileSync(path, "utf8"));
    const samples = typeof exported === "object" && exported !== null && "output" in exported
      && typeof exported.output === "object" && exported.output !== null && "samples" in exported.output
      ? exported.output.samples : undefined;
    expect(samples === 777, `the exported file has samples ${String(samples)}`);
    await setNumber(page, "Samples", "64");
    expect(await inputValue(page, "Samples") === "64", "could not change the value before importing");
    await page.locator('input[aria-label="Import a setup file"]').setInputFiles(path);
    await until("the imported value", async () => ((await inputValue(page, "Samples")) === "777" ? true : null));
    return `${file.suggestedFilename()} holds samples 777; changed to 64; after import the field reads ${await inputValue(page, "Samples")}`;
  });

  await check("an invalid import is refused and the setup is kept", async () => {
    const path = join(OUT, "bad-setup.json");
    writeFileSync(path, JSON.stringify({ version: 1, slicing: {} }));
    await page.locator('input[aria-label="Import a setup file"]').setInputFiles(path);
    const notice = await until("the notice", async () => {
      const t = await text(page, ".status-notice").catch(() => "");
      return t === "" ? null : t;
    });
    expect(await inputValue(page, "Samples") === "777", "the setup changed after a refused import");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    return `status line: "${notice.replace(/\n/g, " ")}"; samples still 777`;
  });

  await check("a reload restores the saved setup", async () => {
    await new Promise((r) => setTimeout(r, 800));
    await page.reload();
    await page.waitForSelector(".app");
    await openSection(page, "output");
    const samples = await inputValue(page, "Samples");
    const lookTag = await page.locator("#look-select").inputValue();
    expect(samples === "777", `samples read ${samples} after the reload`);
    return `samples ${samples} and look "${lookTag}" survived the reload`;
  });

  await dropFile(page, "bracket.stl", "stl");
  await ready(page, "bracket.stl");

  await check("every control in the rail is reachable with the Tab key", async () => {
    for (const id of ["part", "filament", "lights", "world", "camera", "pose", "output", "setup", "agent"]) await openSection(page, id);
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("details.light, details.fold")) d.setAttribute("open", "");
    });
    const expected = await page.evaluate(() => {
      const visible = (el: Element): boolean => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const all = [...document.querySelectorAll(".rail :is(button, input, select, summary, textarea)")]
        .filter((el): el is HTMLElement => el instanceof HTMLElement && visible(el))
        .filter((el) => !(el instanceof HTMLInputElement && (el.type === "file" || el.hidden)))
        .filter((el) => !("disabled" in el && el.disabled === true))
        .filter((el) => el.tabIndex >= 0);
      const radios = new Map<string, HTMLInputElement[]>();
      const stops: HTMLElement[] = [];
      for (const el of all) {
        if (el instanceof HTMLInputElement && el.type === "radio") {
          const group = radios.get(el.name) ?? [];
          group.push(el);
          radios.set(el.name, group);
        } else {
          stops.push(el);
        }
      }
      for (const group of radios.values()) stops.push(group.find((r) => r.checked) ?? group[0]);
      stops.forEach((el, i) => { el.dataset.kbd = String(i); });
      return stops.length;
    });
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    const reached = new Set<string>();
    for (let i = 0; i < expected + 80; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement instanceof HTMLElement ? (document.activeElement.dataset.kbd ?? "") : "");
      if (id !== "") reached.add(id);
    }
    const missed = await page.evaluate((got) => {
      return [...document.querySelectorAll("[data-kbd]")]
        .filter((el) => !(el instanceof HTMLElement) || !got.includes(el.dataset.kbd ?? ""))
        .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24)}]`);
    }, [...reached]);
    expect(missed.length === 0, `${missed.length} of ${expected} not reached: ${missed.slice(0, 8).join(", ")}`);
    return `${expected} tab stops in the rail (radio groups count once), all reached by Tab alone`;
  });

  await check("every input has an accessible name", async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const interactive = new Set(["button", "textbox", "slider", "combobox", "checkbox", "switch", "radio", "spinbutton", "progressbar", "DisclosureTriangle", "colorwell", "searchbox", "menuitem"]);
    let total = 0;
    const unnamed: string[] = [];
    for (const n of nodes) {
      const role = n.role?.value;
      if (n.ignored === true || typeof role !== "string" || !interactive.has(role)) continue;
      total += 1;
      const name = typeof n.name?.value === "string" ? n.name.value.trim() : "";
      if (name === "") unnamed.push(role);
    }
    const unlabeled = await page.evaluate(() => {
      return [...document.querySelectorAll("input, select, textarea")]
        .filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)
          && !(el instanceof HTMLInputElement && (el.type === "hidden" || el.hidden)) && el.getClientRects().length > 0)
        .filter((el) => (el.getAttribute("aria-label") ?? "").trim() === "" && (el.labels?.length ?? 0) === 0)
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(unnamed.length === 0, `${unnamed.length} unnamed: ${unnamed.join(", ")}`);
    expect(unlabeled.length === 0, `inputs with neither a label nor aria-label: ${unlabeled.join(" ")}`);
    return `${total} interactive nodes in the accessibility tree, each with a name; every visible input has a label or aria-label`;
  });

  await check("Reset everything confirms in a native popover", async () => {
    await openSection(page, "setup");
    await page.getByRole("button", { name: "Reset everything" }).first().click();
    const open = await page.evaluate(() => document.querySelector(".confirm")?.matches(":popover-open") === true);
    expect(open, "the confirmation is not an open popover");
    await page.locator(".confirm").getByRole("button", { name: "Reset everything" }).click();
    await until("samples back at 256", async () => ((await inputValue(page, "Samples")) === "256" ? true : null));
    const closed = await page.evaluate(() => document.querySelector(".confirm")?.matches(":popover-open") === false);
    expect(closed, "the popover stays open after confirming");
    expect((await standIn(page))?.hasPart === true, "the open part was dropped by the reset");
    return "popover opened from the button, Reset everything restored samples to 256 and left the part open";
  });


  const agentSwitch = page.getByRole("switch", { name: "Allow a local agent to control this tab" });

  await check("the Agent section starts off, shows the one command with the page's own token and says what an agent can do", async () => {
    await openSection(page, "agent");
    expect(await agentSwitch.isEnabled(), "the switch is disabled though the page made a token");
    const status = await text(page, ".agent .agent-status");
    expect(status.includes("Run the command below"), `status: ${status}`);
    const command = await text(page, ".agent-command code");
    expect(/^claude mcp add booth -- npx -y filament-booth --token [0-9a-f]{32}/.test(command), `command: ${command}`);
    const note = (await page.locator('[data-section="agent"] .note').allTextContents()).join(" ");
    expect(/change every setting/.test(note) && /open files/.test(note) && /save photos/.test(note) && /only to 127\.0\.0\.1/.test(note), `note: ${note}`);
    expect(await page.locator(".topbar .agent-badge").count() === 0, "the badge shows while the switch is off");
    return `switch available, command "${command}", note names settings, files, photos and 127.0.0.1`;
  });

  await check("a pasted token replaces the page's own, and turning it on loads Python in the real worker and waits for a bridge", async () => {
    await page.locator(".agent details.fold").evaluate((fold) => { (fold as HTMLDetailsElement).open = true; });
    const token = page.getByRole("textbox", { name: "Token" });
    await token.fill("9c1e47a0d2b35f86e4a1");
    await token.press("Enter");
    expect(await agentSwitch.isEnabled(), "the switch is disabled after a token was entered");
    expect((await text(page, ".agent-command code")).includes("--token 9c1e47a0d2b35f86e4a1"), "the command does not carry the pasted token");
    expect(await token.getAttribute("type") === "password", "the token field is not masked");
    await agentSwitch.click();
    const starting = await text(page, ".agent .agent-status");
    await page.locator(".agent .agent-status", { hasText: "Waiting for the bridge on port 47615" }).waitFor({ timeout: 30_000 });
    const badge = await text(page, ".topbar .agent-badge");
    expect(badge === "Agent waiting", `badge: ${badge}`);
    const saved = await page.evaluate(() => localStorage.getItem("booth.agent"));
    expect(saved !== null && JSON.parse(saved).enabled === true, `saved: ${saved}`);
    return `status "${starting}" then "Waiting for the bridge on port 47615", badge "${badge}", switch remembered`;
  });

  await check("the badge opens a native popover, and Turn off agent control closes it and removes the badge", async () => {
    await page.locator(".topbar .agent-badge").click();
    const open = await page.evaluate(() => document.querySelector(".agent-menu")?.matches(":popover-open") === true);
    expect(open, "the agent menu is not an open popover");
    const menu = await text(page, ".agent-menu");
    expect(/Waiting for the bridge/.test(menu) && !/Stop script/.test(menu), `menu: ${menu}`);
    await page.getByRole("button", { name: "Turn off agent control" }).click();
    await page.locator(".topbar .agent-badge").waitFor({ state: "detached" });
    const status = await text(page, ".agent .agent-status");
    const saved = await page.evaluate(() => localStorage.getItem("booth.agent"));
    expect(status.startsWith("Off") && saved !== null && JSON.parse(saved).enabled === false, `status ${status}, saved ${saved}`);
    expect(await agentSwitch.isChecked() === false, "the switch is still on");
    return "popover opened from the badge, Turn off agent control removed the badge, the status reads Off and the switch is remembered off";
  });

  // The setup is back at its defaults and the part is open.
  await page.reload();
  await page.waitForSelector(".app");
  await dropFile(page, "bracket.stl", "stl");
  await ready(page, "bracket.stl");
  await expandLight(page, "top");
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: join(OUT, "app-1440x900.png") });
} finally {
  await session.close();
}

const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length} of ${results.length} checks passed`;
console.log(`\n${summary}`);
writeFileSync(join(OUT, "results.txt"), results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`).join("\n") + `\n\n${summary}\n`);
process.exit(failed.length === 0 ? 0 : 1);
