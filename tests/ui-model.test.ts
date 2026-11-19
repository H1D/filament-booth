import { describe, expect, test } from "vitest";
import { deg, m, mm, watts } from "../src/document";
import { applyFilamentPreset, applyLook, patchLight, setFocal } from "../src/edits";
import type { BeadMesh, LoadedPrint, PrintSource, PrintState, SlicedPrint } from "../src/print";
import { DEFAULTS, SECTION_IDS, formatDuration, isSame, lookLight, printSource, sectionState, slicingEditable, sourceName, stageLabel, titleCase, type SectionId } from "../src/ui/model";
import { boothWith } from "./ui-fixtures";

const stl: PrintSource = { kind: "stl", file: new File([], "bracket.stl"), fileHash: "x" };
const gcode: PrintSource = { kind: "gcode", file: new File([], "benchy.gcode"), fileHash: "y" };

function loaded(source: PrintSource, settingsSource: SlicedPrint["settingsSource"]): LoadedPrint {
  const sliced: SlicedPrint = {
    settings: DEFAULTS.slicing, settingsSource, layerHeightMm: mm(0.2),
    layerTimeS: new Float32Array(2), layerFan: new Float32Array(2), filamentName: null, bedFromFile: null, note: null,
  };
  const mesh: BeadMesh = {
    position: new Float32Array(0), normal: new Int16Array(0), tangent: new Int16Array(0), word: new Float32Array(0),
    index: new Uint32Array(0), tris: 0, layerCount: 1, layerHeightM: 2e-4, vRefMmS: 100,
    bboxM: { min: [0, 0, 0], max: [0.01, 0.01, 0.01] },
  };
  return { source, sliced, mesh, liteMesh: async () => mesh };
}

const ready = (source: PrintSource, settingsSource: SlicedPrint["settingsSource"]): PrintState => ({ status: "ready", loaded: loaded(source, settingsSource) });

type Booth = ReturnType<typeof boothWith>["booth"];
const stateOf = (booth: Booth, print: PrintState, id: SectionId) =>
  sectionState(id, { doc: booth.doc, print, filamentModified: booth.filamentModified });
const empty: PrintState = { status: "empty" };

describe("section state", () => {
  test("a fresh document marks nothing", () => {
    const { booth } = boothWith();
    expect(SECTION_IDS.filter((id) => stateOf(booth, empty, id).modified)).toEqual([]);
  });

  test.each<[SectionId, (b: ReturnType<typeof boothWith>["booth"]) => void]>([
    ["part", (b) => { b.update((d) => { d.slicing.layerHeight = mm(0.12); }); }],
    ["filament", (b) => { b.update((d) => { d.filament.recipe.ior = 1.3; }); }],
    ["lights", (b) => { b.update(patchLight("top", { powerW: watts(30) })); }],
    ["world", (b) => { b.update((d) => { d.studio.backdrop.roughness = 0.9; }); }],
    ["camera", (b) => { b.update((d) => { d.camera.fStop = 4; }); }],
    ["pose", (b) => { b.update((d) => { d.pose.turntableDeg = deg(30); }); }],
    ["output", (b) => { b.update((d) => { d.output.samples = 1024; }); }],
    ["output", (b) => { b.update((d) => { d.output.timeLimitS = 0; }); }],
  ])("%s is marked after an edit and its reset restores it", (id, edit) => {
    const { booth } = boothWith();
    edit(booth);
    const marked = stateOf(booth, empty, id);
    expect(marked.modified).toBe(true);
    expect(marked.reset).not.toBeNull();
    if (marked.reset !== null) booth.update(marked.reset);
    expect(stateOf(booth, empty, id).modified).toBe(false);
  });

  test("the camera is marked by focal length, aperture, focus or aspect, but not by orbiting", () => {
    const { booth } = boothWith();
    booth.update((d) => { d.camera.azimuth = deg(40); d.camera.elevation = deg(10); d.camera.distance = m(1.2); });
    expect(stateOf(booth, empty, "camera").modified).toBe(false);
    booth.update(setFocal(50));
    expect(stateOf(booth, empty, "camera").modified).toBe(true);
  });

  test("resetting the camera keeps the framing: the distance follows the focal length back", () => {
    const { booth } = boothWith();
    booth.update(setFocal(35));
    const wide = booth.doc.camera.distance;
    const reset = stateOf(booth, empty, "camera").reset;
    if (reset !== null) booth.update(reset);
    expect(booth.doc.camera.focalMm).toBe(85);
    expect(booth.doc.camera.distance).toBeCloseTo((wide * 85) / 35, 9);
  });

  test("the output section ignores the aspect, which the camera section owns", () => {
    const { booth } = boothWith();
    booth.update((d) => { d.output.aspect = { w: 16, h: 9 }; });
    const output = stateOf(booth, empty, "output");
    expect(output.modified).toBe(false);
    expect(stateOf(booth, empty, "camera").modified).toBe(true);
    if (output.reset !== null) booth.update(output.reset);
    expect(booth.doc.output.aspect).toEqual({ w: 16, h: 9 });
  });

  test("lights and world are compared with the look the studio came from, not with the default", () => {
    const { booth } = boothWith();
    booth.update(applyLook("dark"));
    expect(stateOf(booth, empty, "lights").modified).toBe(false);
    expect(stateOf(booth, empty, "world").modified).toBe(false);
    booth.update((d) => { d.studio.world.strength = 0.5; });
    const world = stateOf(booth, empty, "world");
    expect(world.modified).toBe(true);
    expect(stateOf(booth, empty, "lights").modified).toBe(false);
    if (world.reset !== null) booth.update(world.reset);
    expect(stateOf(booth, empty, "world").modified).toBe(false);
    expect(booth.lookModified).toBe(false);
  });

  test("a document with no look has nothing to compare lights and world against", () => {
    const { booth } = boothWith();
    booth.update((d) => { d.lookBase = null; });
    expect(stateOf(booth, empty, "lights")).toEqual({ modified: false, reset: null });
    expect(stateOf(booth, empty, "world")).toEqual({ modified: false, reset: null });
  });

  test("the filament resets to its preset, keeps the preset and restores imperfections and bed", () => {
    const { booth } = boothWith();
    booth.update(applyFilamentPreset("pla-silk"));
    booth.update((d) => { d.filament.gloss = 0.9; d.filament.bed = "smooth"; d.filament.imperfections.heatGloss = 0.1; });
    const marked = stateOf(booth, empty, "filament");
    expect(marked.modified).toBe(true);
    if (marked.reset !== null) booth.update(marked.reset);
    expect(booth.doc.filament.presetId).toBe("pla-silk");
    expect(booth.doc.filament.bed).toBe("auto");
    expect(stateOf(booth, empty, "filament").modified).toBe(false);
  });

  test("slicing offers a reset only where it can be edited", () => {
    const { booth } = boothWith();
    booth.update((d) => { d.slicing.wallCount = 4; });
    expect(stateOf(booth, ready(stl, "booth"), "part").reset).not.toBeNull();
    expect(stateOf(booth, ready(gcode, "file"), "part")).toEqual({ modified: false, reset: null });
  });
});

describe("print state helpers", () => {
  test("slicing is editable for an STL, with nothing open, and while an STL loads, but not for G-code", () => {
    expect(slicingEditable({ status: "empty" })).toBe(true);
    expect(slicingEditable({ status: "loading", stage: "slicing", source: stl })).toBe(true);
    expect(slicingEditable({ status: "loading", stage: "parsing", source: gcode })).toBe(false);
    expect(slicingEditable(ready(stl, "booth"))).toBe(true);
    expect(slicingEditable(ready(gcode, "file"))).toBe(false);
    expect(slicingEditable({ status: "error", message: "x", loaded: null })).toBe(true);
    expect(slicingEditable({ status: "error", message: "x", loaded: loaded(gcode, "file") })).toBe(false);
  });

  test("the source is found in every state that has one", () => {
    expect(printSource({ status: "empty" })).toBeNull();
    expect(printSource({ status: "loading", stage: "reading", source: stl })).toBe(stl);
    expect(printSource({ status: "error", message: "x", loaded: null })).toBeNull();
    const kept = loaded(gcode, "file");
    expect(printSource({ status: "error", message: "x", loaded: kept })).toBe(gcode);
  });

  test("a sample is named by its file, decoded", () => {
    expect(sourceName({ kind: "bin", url: "/samples/my%20part.bin?v=2" })).toBe("my part.bin");
    expect(sourceName(stl)).toBe("bracket.stl");
  });

  test("stage words read as phrases, and an unknown stage is shown as it came", () => {
    expect(stageLabel("slicing")).toBe("Slicing");
    expect(stageLabel("walls")).toBe("Finding the exposed walls");
    expect(stageLabel("warming-up")).toBe("Warming up");
  });

  test("a look's light is the baseline only for the same id and kind", () => {
    expect(lookLight("studio", "top", "area")?.kind).toBe("area");
    expect(lookLight("studio", "top", "scrim")).toBeNull();
    expect(lookLight("studio", "no-such", "area")).toBeNull();
    expect(lookLight(null, "top", "area")).toBeNull();
  });
});

describe("small helpers", () => {
  test("isSame compares plain data deeply and ignores nothing", () => {
    expect(isSame({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isSame({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(isSame([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(isSame(null, {})).toBe(false);
  });

  test("titleCase turns an id into a label", () => {
    expect(titleCase("monotonic-line")).toBe("Monotonic line");
    expect(titleCase("medium-high-contrast")).toBe("Medium high contrast");
  });
});

describe("formatDuration", () => {
  test("names whole seconds, minutes and hours, and breaks anything else into minutes and seconds", () => {
    expect([1, 30, 60, 120, 300, 3600, 7200, 5400].map((s) => formatDuration(s))).toEqual(
      ["1 second", "30 seconds", "1 minute", "2 minutes", "5 minutes", "1 hour", "2 hours", "90 minutes"]);
    expect(formatDuration(90)).toBe("1 min 30 s");
  });

  test("reads before a noun without a plural", () => {
    expect([30, 60, 300, 3600].map((s) => formatDuration(s, true))).toEqual(["30 second", "1 minute", "5 minute", "1 hour"]);
  });
});
