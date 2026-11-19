import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { Booth, STORAGE_KEY, type BoothDeps, type PrintPort, type Schedule } from "../src/booth";
import { DocumentError, defaultDocument, deg, m, mm, type BoothDocument, type SliceSettings } from "../src/document";
import { applyFilamentPreset, applyLook, focusAt, patchLight } from "../src/edits";
import type { Photo, PhotoRun } from "../src/photo/photo";
import { FILAMENT_PRESETS, LOOK_PRESETS } from "../src/presets";
import { Superseded, type BeadMesh, type LoadedPrint, type PrintPipeline, type PrintSource, type SlicedPrint } from "../src/print";
import { framePart, type Scene } from "../src/scene";

// ---- fixtures ------------------------------------------------------------------

function meshOfHeight(heightM: number): BeadMesh {
  return {
    position: new Float32Array(300), normal: new Int16Array(300), tangent: new Int16Array(300),
    word: new Float32Array(100), index: new Uint32Array(60), tris: 20, layerCount: 100, layerHeightM: 2e-4, vRefMmS: 100,
    bboxM: { min: [-0.03, -0.02, 0], max: [0.03, 0.02, heightM] },
  };
}

function slicedWith(settings: SliceSettings): SlicedPrint {
  return {
    settings, settingsSource: "booth", layerHeightMm: mm(0.2),
    layerTimeS: Float32Array.from({ length: 101 }, (_, k) => (k === 0 ? 0 : 5 + k)),
    layerFan: new Float32Array(101).fill(0.5),
    filamentName: null, bedFromFile: null, note: null,
  };
}

function printFrom(source: PrintSource, heightM = 0.1): LoadedPrint {
  const mesh = meshOfHeight(heightM);
  return { source, sliced: slicedWith(defaultDocument().slicing), mesh, liteMesh: async () => mesh };
}

const bytes = (...parts: (string | number[])[]): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));

function binaryStl(name = "bracket.stl"): File {
  const header = new Uint8Array(84);
  new DataView(header.buffer).setUint32(80, 1, true);
  return new File([header, new Uint8Array(50)], name);
}
const asciiStl = (name = "ascii.stl") => new File([bytes("solid part\nendsolid part\n")], name);
const gcodeFile = (name = "benchy.gcode") => new File([bytes("; generated\nG1 X0 Y0\n")], name);
const threeMf = (name = "plate.gcode.3mf") => new File([bytes([0x50, 0x4b, 0x03, 0x04], "rest")], name);

/** A pipeline double. Every call stays pending until the test settles it. */
interface Call {
  readonly op: "open" | "reslice";
  readonly src: PrintSource | null;
  readonly settings: SliceSettings;
  readonly stage: (s: string) => void;
  readonly resolve: (p: LoadedPrint) => void;
  readonly reject: (e: unknown) => void;
}
class FakePrint implements PrintPort {
  readonly calls: Call[] = [];
  disposed = false;
  readonly rejectSuperseded: boolean;
  /** The real pipeline rejects the call a new one supersedes. Pass false to model a late result instead. */
  constructor(rejectSuperseded = true) {
    this.rejectSuperseded = rejectSuperseded;
  }

  open(src: PrintSource, settings: SliceSettings, stage: (s: string) => void) { return this.#start("open", src, settings, stage); }
  reslice(settings: SliceSettings, stage: (s: string) => void) { return this.#start("reslice", null, settings, stage); }
  dispose() { this.disposed = true; }

  #start(op: Call["op"], src: PrintSource | null, settings: SliceSettings, stage: (s: string) => void): Promise<LoadedPrint> {
    if (this.rejectSuperseded) this.calls.at(-1)?.reject(new Superseded());
    return new Promise((resolve, reject) => { this.calls.push({ op, src, settings, stage, resolve, reject }); });
  }
}

class ManualClock {
  #now = 0;
  readonly #tasks = new Set<{ at: number; fn: () => void }>();
  readonly schedule: Schedule = (fn, ms) => {
    const task = { at: this.#now + ms, fn };
    this.#tasks.add(task);
    return () => { this.#tasks.delete(task); };
  };
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const due = [...this.#tasks].filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      this.#tasks.delete(due);
      this.#now = due.at;
      due.fn();
    }
    this.#now = target;
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    map, writes,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); writes.push(v); },
  };
}

function setup(over: Partial<BoothDeps> = {}, print = new FakePrint()) {
  const clock = new ManualClock();
  const storage = memoryStorage();
  const photos: { scene: Scene; name: string }[] = [];
  const booth = new Booth({
    storage, print, schedule: clock.schedule,
    takePhoto: (scene, name) => { photos.push({ scene, name }); return stubRun; },
    ...over,
  });
  const notified = vi.fn();
  booth.subscribe(notified);
  return { booth, print, clock, storage, photos, notified };
}

const stubRun: PhotoRun = {
  docRev: 0, onProgress: () => () => {}, result: new Promise<Photo>(() => {}), cancel: () => {}, finishNow: () => {},
};

type Rig = ReturnType<typeof setup>;

const callCount = (rig: Rig) => rig.print.calls.length;
const lastCall = (rig: Rig): Call => {
  const call = rig.print.calls.at(-1);
  if (!call) throw new Error("the pipeline was never called");
  return call;
};
async function untilCalls(rig: Rig, n: number): Promise<void> {
  await vi.waitFor(() => expect(callCount(rig)).toBe(n));
}

/** Drops a file and settles the pipeline with a part built from the source it was handed. */
async function openPart(rig: Rig, file: File, heightM = 0.1): Promise<LoadedPrint> {
  const n = callCount(rig);
  const opened = rig.booth.open(file);
  await untilCalls(rig, n + 1);
  const call = lastCall(rig);
  if (call.src === null) throw new Error("expected an open call");
  const part = printFrom(call.src, heightM);
  call.resolve(part);
  await opened;
  return part;
}

const rejection = (fn: () => void): DocumentError => {
  try { fn(); } catch (e) { if (e instanceof DocumentError) return e; throw e; }
  throw new Error("expected a DocumentError");
};

test("PrintPipeline satisfies the port Booth depends on", () => {
  expectTypeOf<PrintPipeline>().toExtend<PrintPort>();
});

// ---- restore -------------------------------------------------------------------

describe("restoring the document", () => {
  test("a saved document comes back", () => {
    const saved = defaultDocument();
    saved.camera.fStop = 4;
    saved.studio.lights[0].name = "Kicker";
    const booth = new Booth({ storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify(saved) }), print: new FakePrint(), takePhoto: () => stubRun });
    expect(booth.doc).toEqual(saved);
    expect(booth.print).toEqual({ status: "empty" });
  });

  test("nothing saved gives the default document", () => {
    const { booth } = setup();
    expect(booth.doc).toEqual(defaultDocument());
  });

  test.each([
    ["corrupt JSON", "{not json"],
    ["JSON that is not a document", JSON.stringify([1, 2, 3])],
    ["a document with a bad field", JSON.stringify({ ...defaultDocument(), camera: { ...defaultDocument().camera, focalMm: 2 } })],
  ])("%s gives the default document and does not throw", (_, raw) => {
    const booth = new Booth({ storage: memoryStorage({ [STORAGE_KEY]: raw }), print: new FakePrint(), takePhoto: () => stubRun });
    expect(booth.doc).toEqual(defaultDocument());
  });

  test("a storage that throws gives the default document", () => {
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const { booth } = setup({ storage });
    expect(booth.doc).toEqual(defaultDocument());
    expect(() => { booth.update((d) => { d.camera.fStop = 5; }); booth.flush(); }).not.toThrow();
  });
});

// ---- update --------------------------------------------------------------------

describe("update", () => {
  test("a valid change notifies once, replaces only what changed and recompiles the scene", () => {
    const { booth, notified } = setup();
    const before = booth.doc;
    const sceneBefore = booth.scene;
    booth.update((d) => { d.camera.fStop = 4; });
    expect(notified).toHaveBeenCalledTimes(1);
    expect(booth.doc.camera.fStop).toBe(4);
    expect(booth.doc.camera).not.toBe(before.camera);
    expect(booth.doc.studio).toBe(before.studio);
    expect(booth.doc.filament).toBe(before.filament);
    expect(booth.doc.output).toBe(before.output);
    expect(booth.scene.docRev).toBe(sceneBefore.docRev + 1);
    expect(booth.scene.camera.fStop).toBe(4);
  });

  test("an invalid result is rejected with the field path and changes nothing", () => {
    const { booth, notified, clock, storage } = setup();
    const before = booth.doc;
    const sceneBefore = booth.scene;
    const e = rejection(() => booth.update((d) => { d.camera.focalMm = mm(2); }));
    expect(e.path).toBe("camera.focalMm");
    expect(booth.doc).toBe(before);
    expect(booth.scene).toBe(sceneBefore);
    expect(notified).not.toHaveBeenCalled();
    clock.advance(10_000);
    expect(storage.writes).toEqual([]);
  });

  test("a mutator that throws leaves the document as it was", () => {
    const { booth, notified } = setup();
    const before = booth.doc;
    expect(() => booth.update((d) => { d.camera.fStop = 3; throw new Error("boom"); })).toThrow("boom");
    expect(booth.doc).toBe(before);
    expect(notified).not.toHaveBeenCalled();
  });

  test("a mutator that changes nothing does not notify or bump the revision", () => {
    const { booth, notified } = setup();
    const before = booth.doc;
    const sceneBefore = booth.scene;
    booth.update(() => {});
    booth.update((d) => { d.camera.fStop = booth.doc.camera.fStop; });
    booth.update((d) => { d.camera = { ...d.camera }; d.studio.lights = d.studio.lights.map((l) => ({ ...l })); });
    expect(notified).not.toHaveBeenCalled();
    expect(booth.doc).toBe(before);
    expect(booth.scene).toBe(sceneBefore);
    expect(booth.scene.docRev).toBe(0);
  });

  test("doc, print and scene are the same reference until something changes", () => {
    const { booth } = setup();
    expect([booth.doc, booth.print, booth.scene]).toEqual([booth.doc, booth.print, booth.scene]);
    expect(booth.doc).toBe(booth.doc);
    expect(booth.print).toBe(booth.print);
    expect(booth.scene).toBe(booth.scene);
  });

  test("an unsubscribed listener hears nothing more", () => {
    const { booth } = setup();
    const heard = vi.fn();
    const stop = booth.subscribe(heard);
    booth.update((d) => { d.camera.fStop = 3; });
    stop();
    booth.update((d) => { d.camera.fStop = 5; });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test("the document handed out is frozen, so a panel cannot edit it behind Booth's back", () => {
    const { booth } = setup();
    booth.update((d) => { d.camera.fStop = 3; });
    expect(Object.isFrozen(booth.doc)).toBe(true);
    expect(Object.isFrozen(booth.doc.camera)).toBe(true);
    expect(Object.isFrozen(booth.doc.studio.lights[0])).toBe(true);
  });

  test("a light edit keeps scene.camera and scene.part by reference and replaces scene.lights", async () => {
    const rig = setup();
    await openPart(rig, binaryStl());
    const { part, camera, lights } = rig.booth.scene;
    expect(part).not.toBeNull();
    rig.booth.update(patchLight("left", { on: false }));
    expect(rig.booth.scene.camera).toBe(camera);
    expect(rig.booth.scene.part).toBe(part);
    expect(rig.booth.scene.lights).not.toBe(lights);
    expect(rig.booth.scene.lights.emitters.map((e) => e.id)).not.toContain("left");
  });
});

// ---- persistence ---------------------------------------------------------------

describe("saving", () => {
  test("edits are written after a quiet period, once for a burst", () => {
    const { booth, clock, storage } = setup();
    booth.update((d) => { d.camera.fStop = 4; });
    booth.update((d) => { d.camera.fStop = 5; });
    expect(storage.writes).toHaveLength(0);
    clock.advance(500);
    expect(storage.writes).toHaveLength(1);
    expect(JSON.parse(storage.writes[0]).camera.fStop).toBe(5);
  });

  test("flush writes at once, and again with nothing pending does nothing", () => {
    const { booth, storage } = setup();
    booth.update((d) => { d.camera.fStop = 4; });
    booth.flush();
    booth.flush();
    expect(storage.writes).toHaveLength(1);
  });

  test("a new Booth restores what the last one saved", () => {
    const { booth, storage } = setup();
    booth.update(applyLook("dark"));
    booth.flush();
    const next = new Booth({ storage, print: new FakePrint(), takePhoto: () => stubRun });
    expect(next.doc).toEqual(booth.doc);
    expect(next.doc.lookBase).toBe("dark");
  });
});

// ---- slicing -------------------------------------------------------------------

describe("slicing edits", () => {
  const thinner = (d: BoothDocument) => { d.slicing.layerHeight = mm(0.12); };

  test("an STL is re-sliced after 300 ms of quiet, with the old mesh on show meanwhile", async () => {
    const rig = setup();
    const first = await openPart(rig, binaryStl());
    rig.booth.update(thinner);
    rig.clock.advance(299);
    expect(callCount(rig)).toBe(1);
    rig.clock.advance(1);
    await untilCalls(rig, 2);
    const call = lastCall(rig);
    expect(call.op).toBe("reslice");
    expect(call.settings.layerHeight).toBe(0.12);
    expect(rig.booth.print).toMatchObject({ status: "loading", stage: "slicing" });
    expect(rig.booth.scene.part?.mesh).toBe(first.mesh);

    call.stage("sweeping");
    expect(rig.booth.print).toMatchObject({ status: "loading", stage: "sweeping" });
    const second = printFrom(first.source);
    call.resolve(second);
    await vi.waitFor(() => expect(rig.booth.print.status).toBe("ready"));
    expect(rig.booth.scene.part?.mesh).toBe(second.mesh);
  });

  test("a burst of edits makes one re-slice with the last values", async () => {
    const rig = setup();
    await openPart(rig, binaryStl());
    rig.booth.update((d) => { d.slicing.layerHeight = mm(0.1); });
    rig.clock.advance(200);
    rig.booth.update((d) => { d.slicing.layerHeight = mm(0.16); });
    rig.clock.advance(200);
    expect(callCount(rig)).toBe(1);
    rig.clock.advance(100);
    await untilCalls(rig, 2);
    expect(lastCall(rig).settings.layerHeight).toBe(0.16);
  });

  test("a G-code ignores slicing edits", async () => {
    const rig = setup();
    await openPart(rig, gcodeFile());
    rig.booth.update(thinner);
    rig.clock.advance(5000);
    expect(callCount(rig)).toBe(1);
    expect(rig.booth.doc.slicing.layerHeight).toBe(0.12);
  });

  test("a non-slicing edit does not re-slice", async () => {
    const rig = setup();
    await openPart(rig, binaryStl());
    rig.booth.update((d) => { d.camera.fStop = 5; });
    rig.clock.advance(5000);
    expect(callCount(rig)).toBe(1);
  });

  test("nothing is re-sliced before a part is open", () => {
    const rig = setup();
    rig.booth.update(thinner);
    rig.clock.advance(5000);
    expect(callCount(rig)).toBe(0);
  });

  test("an edit made while the STL is still opening is applied once it lands", async () => {
    const rig = setup();
    const opened = rig.booth.open(binaryStl());
    await untilCalls(rig, 1);
    rig.booth.update(thinner);
    rig.clock.advance(300);
    expect(callCount(rig)).toBe(1);
    const open = lastCall(rig);
    if (open.src === null) throw new Error("expected an open call");
    open.resolve(printFrom(open.src));
    await opened;
    await untilCalls(rig, 2);
    expect(lastCall(rig)).toMatchObject({ op: "reslice" });
    expect(lastCall(rig).settings.layerHeight).toBe(0.12);
  });

  test("a re-slice does not re-frame, so a camera the user moved stays put", async () => {
    const rig = setup();
    const first = await openPart(rig, binaryStl());
    rig.booth.update((d) => { d.camera.distance = m(0.55); d.camera.azimuth = deg(40); });
    rig.booth.update(thinner);
    rig.clock.advance(300);
    await untilCalls(rig, 2);
    lastCall(rig).resolve(printFrom(first.source, 0.3));
    await vi.waitFor(() => expect(rig.booth.print.status).toBe("ready"));
    expect(rig.booth.doc.camera.distance).toBe(0.55);
    expect(rig.booth.doc.camera.azimuth).toBe(40);
  });

  test("a failed re-slice keeps the old part and reports the error", async () => {
    const rig = setup();
    const first = await openPart(rig, binaryStl());
    rig.booth.update(thinner);
    rig.clock.advance(300);
    await untilCalls(rig, 2);
    lastCall(rig).reject(new Error("slicer ran out of memory"));
    await vi.waitFor(() => expect(rig.booth.print.status).toBe("error"));
    expect(rig.booth.print).toMatchObject({ message: "slicer ran out of memory", loaded: first });
    expect(rig.booth.scene.part?.mesh).toBe(first.mesh);
  });
});

// ---- open ----------------------------------------------------------------------

describe("open", () => {
  test("an STL goes through loading with stage text to ready", async () => {
    const rig = setup();
    const seen: string[] = [];
    rig.booth.subscribe(() => {
      const p = rig.booth.print;
      seen.push(p.status === "loading" ? `loading:${p.stage}` : p.status);
    });
    const opened = rig.booth.open(binaryStl());
    await untilCalls(rig, 1);
    const call = lastCall(rig);
    expect(call.src).toMatchObject({ kind: "stl" });
    expect(call.settings).toEqual(rig.booth.doc.slicing);
    call.stage("slicing");
    call.stage("slicing");
    call.stage("sweeping");
    if (call.src === null) throw new Error("expected an open call");
    call.resolve(printFrom(call.src));
    await opened;
    expect(seen).toEqual(["loading:reading", "loading:slicing", "loading:sweeping", "ready"]);
    expect(rig.booth.scene.part).not.toBeNull();
  });

  test.each([
    ["a binary STL", binaryStl(), "stl"],
    ["an ASCII STL", asciiStl(), "stl"],
    ["a .gcode", gcodeFile(), "gcode"],
    ["a .gcode.3mf", threeMf(), "gcode"],
    ["an upper case .STL", binaryStl("PART.STL"), "stl"],
  ] as const)("%s is classified as %s", async (_, file, kind) => {
    const rig = setup();
    await openPart(rig, file);
    const src = lastCall(rig).src;
    expect(src).toMatchObject({ kind, file });
    expect(src !== null && src.kind !== "bin" && src.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the hash follows the content, not the name", async () => {
    const rig = setup();
    await openPart(rig, binaryStl("a.stl"));
    await openPart(rig, binaryStl("b.stl"));
    await openPart(rig, asciiStl("c.stl"));
    const hashes = rig.print.calls.map((c) => (c.src !== null && c.src.kind !== "bin" ? c.src.fileHash : ""));
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[2]).not.toBe(hashes[0]);
  });

  test.each([
    ["an unknown extension", new File([bytes("solid x")], "model.obj"), /\.stl/],
    ["an .stl that is really a zip", new File([bytes([0x50, 0x4b, 0x03, 0x04], "xx")], "x.stl"), /not an STL/],
    ["an .stl of random text", new File([bytes("hello world, this is not a mesh")], "x.stl"), /not an STL/],
    ["a .3mf that is not a zip", new File([bytes("plain text")], "x.3mf"), /not a 3MF/],
    ["a binary .gcode", new File([bytes([1, 0, 2, 0, 3])], "x.gcode"), /not G-code/],
  ])("%s is refused before the pipeline sees it", async (_, file, message) => {
    const rig = setup();
    await rig.booth.open(file);
    expect(callCount(rig)).toBe(0);
    expect(rig.booth.print).toMatchObject({ status: "error", loaded: null });
    expect(rig.booth.print.status === "error" && rig.booth.print.message).toMatch(message);
  });

  test("a refused file keeps the part already on show", async () => {
    const rig = setup();
    const first = await openPart(rig, binaryStl());
    await rig.booth.open(new File([bytes("x")], "notes.txt"));
    expect(rig.booth.print).toMatchObject({ status: "error", loaded: first });
    expect(rig.booth.scene.part?.mesh).toBe(first.mesh);
  });

  test("an open that fails keeps the last good part on show", async () => {
    const rig = setup();
    const good = await openPart(rig, binaryStl("good.stl"));
    const sceneBefore = rig.booth.scene;
    const opened = rig.booth.open(binaryStl("bad.stl"));
    await untilCalls(rig, 2);
    lastCall(rig).reject(new Error("could not slice: non-manifold mesh"));
    await opened;
    expect(rig.booth.print).toMatchObject({ status: "error", message: "could not slice: non-manifold mesh", loaded: good });
    expect(rig.booth.scene).toBe(sceneBefore);
  });

  test("an open that fails with nothing before it has no part to keep", async () => {
    const rig = setup();
    const opened = rig.booth.open(binaryStl());
    await untilCalls(rig, 1);
    lastCall(rig).reject(new Error("nope"));
    await opened;
    expect(rig.booth.print).toMatchObject({ status: "error", loaded: null });
    expect(rig.booth.scene.part).toBeNull();
  });

  test("the part and its framing arrive in one notification, then the focus point is clear", async () => {
    const rig = setup();
    rig.booth.update(focusAt([m(0.01), m(0), m(0.02)]));
    const frames: { part: boolean; distance: number }[] = [];
    rig.booth.subscribe(() => {
      if (rig.booth.print.status === "ready") frames.push({ part: rig.booth.scene.part !== null, distance: rig.booth.doc.camera.distance });
    });
    const part = await openPart(rig, binaryStl(), 0.2);
    const framed = framePart(part.mesh, defaultDocument().camera, defaultDocument().output.aspect);
    expect(framed.distance).not.toBe(defaultDocument().camera.distance);
    expect(frames).toEqual([{ part: true, distance: framed.distance }]);
    expect(rig.booth.doc.camera.target).toEqual(framed.target);
    expect(rig.booth.doc.camera.focusPartPoint).toBeNull();
  });

  test("a second fresh part is framed again", async () => {
    const rig = setup();
    await openPart(rig, binaryStl("a.stl"), 0.05);
    const small = rig.booth.doc.camera.distance;
    const tall = await openPart(rig, binaryStl("b.stl"), 0.3);
    expect(rig.booth.doc.camera.distance).toBe(framePart(tall.mesh, defaultDocument().camera, defaultDocument().output.aspect).distance);
    expect(rig.booth.doc.camera.distance).toBeGreaterThan(small);
  });

  test("openSample opens a bundled .bin by url and names the photo after it", async () => {
    const rig = setup();
    const opened = rig.booth.openSample("/samples/lekv2.bin?v=3");
    await untilCalls(rig, 1);
    expect(lastCall(rig).src).toEqual({ kind: "bin", url: "/samples/lekv2.bin?v=3" });
    lastCall(rig).resolve(printFrom({ kind: "bin", url: "/samples/lekv2.bin?v=3" }));
    await opened;
    rig.booth.takePhoto();
    expect(rig.photos[0].name).toBe("lekv2");
  });
});

describe("a second open supersedes the first", () => {
  async function twoOpens(rig: Rig) {
    const a = rig.booth.open(binaryStl("a.stl"));
    await untilCalls(rig, 1);
    const b = rig.booth.open(binaryStl("b.stl"));
    await untilCalls(rig, 2);
    const [callA, callB] = rig.print.calls;
    if (callA.src === null || callB.src === null) throw new Error("expected open calls");
    return { a, b, callA, callB, partA: printFrom(callA.src, 0.05), partB: printFrom(callB.src, 0.25) };
  }

  test("when the old file finishes last, its late result is dropped", async () => {
    const rig = setup({}, new FakePrint(false));
    const { a, b, callA, callB, partA, partB } = await twoOpens(rig);
    callB.resolve(partB);
    await b;
    callA.resolve(partA);
    await a;
    expect(rig.booth.scene.part?.mesh).toBe(partB.mesh);
    expect(rig.booth.print).toMatchObject({ status: "ready", loaded: partB });
  });

  test("when the old file finishes first, the new one is still awaited", async () => {
    const rig = setup({}, new FakePrint(false));
    const { a, b, callA, callB, partA, partB } = await twoOpens(rig);
    callA.resolve(partA);
    await a;
    expect(rig.booth.print.status).toBe("loading");
    expect(rig.booth.scene.part).toBeNull();
    callB.resolve(partB);
    await b;
    expect(rig.booth.print).toMatchObject({ status: "ready", loaded: partB });
  });

  test("a pipeline that rejects the old call with Superseded does not surface as an error", async () => {
    const rig = setup();
    const statuses: string[] = [];
    rig.booth.subscribe(() => statuses.push(rig.booth.print.status));
    const { a, b, callB, partB } = await twoOpens(rig);
    callB.resolve(partB);
    await Promise.all([a, b]);
    expect(statuses).not.toContain("error");
    expect(rig.booth.print).toMatchObject({ status: "ready", loaded: partB });
  });

  test("a late result from an earlier open does not overwrite a later refusal", async () => {
    const rig = setup();
    const opened = rig.booth.open(binaryStl("a.stl"));
    await untilCalls(rig, 1);
    await rig.booth.open(new File([bytes("x")], "notes.txt"));
    const call = lastCall(rig);
    if (call.src === null) throw new Error("expected an open call");
    call.resolve(printFrom(call.src));
    await opened;
    expect(rig.booth.print).toMatchObject({ status: "error" });
    expect(rig.booth.scene.part).toBeNull();
  });
});

// ---- photo ---------------------------------------------------------------------

describe("takePhoto", () => {
  test("hands the current scene and the part's name, without its extension, to the photo dependency", async () => {
    const rig = setup();
    await openPart(rig, binaryStl("Cable clip v2.stl"));
    const run = rig.booth.takePhoto();
    expect(run).toBe(stubRun);
    expect(rig.photos).toHaveLength(1);
    expect(rig.photos[0].scene).toBe(rig.booth.scene);
    expect(rig.photos[0].name).toBe("Cable clip v2");
  });

  test("a .gcode.3mf loses both extensions", async () => {
    const rig = setup();
    await openPart(rig, threeMf("plate_1.gcode.3mf"));
    rig.booth.takePhoto();
    expect(rig.photos[0].name).toBe("plate_1");
  });

  test("the scene a run was given is a snapshot: later edits do not change it", async () => {
    const rig = setup();
    await openPart(rig, binaryStl());
    rig.booth.takePhoto();
    const taken = rig.photos[0].scene;
    const lights = taken.lights;
    rig.booth.update(patchLight("top", { on: false }));
    expect(taken.lights).toBe(lights);
    expect(rig.booth.scene.lights).not.toBe(lights);
    expect(rig.booth.scene.docRev).toBeGreaterThan(taken.docRev);
  });

  test("with no part open there is nothing to photograph", () => {
    const rig = setup();
    expect(() => rig.booth.takePhoto()).toThrow(/Open a part/);
    expect(rig.photos).toHaveLength(0);
  });
});

// ---- derived modified flags ------------------------------------------------------

describe("lookModified and filamentModified", () => {
  test("a fresh document is not modified", () => {
    const { booth } = setup();
    expect(booth.lookModified).toBe(false);
    expect(booth.filamentModified).toBe(false);
  });

  test("an edit to the studio sets lookModified, and editing the value back clears it", () => {
    const { booth } = setup();
    const original = booth.doc.studio.lights[0].on;
    booth.update(patchLight("top", { on: !original }));
    expect(booth.lookModified).toBe(true);
    booth.update(patchLight("top", { on: original }));
    expect(booth.lookModified).toBe(false);
  });

  test("backdrop and world edits count, and an added then removed light does not", () => {
    const { booth } = setup();
    booth.update((d) => { d.studio.world.strength = 0.9; });
    expect(booth.lookModified).toBe(true);
    booth.update((d) => { d.studio.world.strength = LOOK_PRESETS.studio.studio.world.strength; });
    expect(booth.lookModified).toBe(false);
    booth.update((d) => { d.studio.backdrop.roughness = 0.1; });
    expect(booth.lookModified).toBe(true);
  });

  test("applying another look clears it and records the new base", () => {
    const { booth } = setup();
    booth.update((d) => { d.studio.world.strength = 0.9; });
    booth.update(applyLook("rim"));
    expect(booth.doc.lookBase).toBe("rim");
    expect(booth.lookModified).toBe(false);
    booth.update((d) => { d.studio.floorCards = null; });
    expect(booth.lookModified).toBe(true);
  });

  test("a studio with no look behind it is not reported as modified", () => {
    const { booth } = setup();
    booth.update((d) => { d.lookBase = null; });
    expect(booth.lookModified).toBe(false);
  });

  test("a recipe edit sets filamentModified and editing it back clears it", () => {
    const { booth } = setup();
    const original = booth.doc.filament.recipe.roughness[0];
    booth.update((d) => { d.filament.recipe.roughness[0] = 0.9; });
    expect(booth.filamentModified).toBe(true);
    booth.update((d) => { d.filament.recipe.roughness[0] = original; });
    expect(booth.filamentModified).toBe(false);
  });

  test("a gloss change counts, and applying a preset clears it", () => {
    const { booth } = setup();
    booth.update((d) => { d.filament.gloss = 0.8; });
    expect(booth.filamentModified).toBe(true);
    booth.update(applyFilamentPreset("pla-silk"));
    expect(booth.doc.filament.presetId).toBe("pla-silk");
    expect(booth.doc.filament.recipe).toEqual(FILAMENT_PRESETS["pla-silk"].recipe);
    expect(booth.filamentModified).toBe(false);
  });

  test("imperfections and bed are not part of a preset and do not count", () => {
    const { booth } = setup();
    booth.update((d) => { d.filament.imperfections.tauS = 30; d.filament.bed = "smooth"; });
    expect(booth.filamentModified).toBe(false);
  });

  test("the flags are never saved", () => {
    const { booth, storage } = setup();
    booth.update((d) => { d.filament.gloss = 0.8; });
    booth.flush();
    expect(Object.keys(JSON.parse(storage.writes[0])).sort()).toEqual(Object.keys(defaultDocument()).sort());
  });
});

// ---- export and import -------------------------------------------------------------

describe("export and import", () => {
  test("a document round-trips through JSON into another booth as one update", () => {
    const a = setup();
    a.booth.update(applyLook("gradient"));
    a.booth.update((d) => { d.camera.azimuth = deg(33); d.output.samples = 64; d.filament.gloss = 0.7; });
    const json = a.booth.exportJson();

    const b = setup();
    b.booth.importJson(json);
    expect(b.booth.doc).toEqual(a.booth.doc);
    expect(b.notified).toHaveBeenCalledTimes(1);
    expect(b.booth.exportJson()).toBe(json);
  });

  test("an invalid document is rejected with its field path and the current one stays", () => {
    const { booth, notified } = setup();
    const before = booth.doc;
    const broken = { ...defaultDocument(), output: { ...defaultDocument().output, samples: 0 } };
    expect(rejection(() => booth.importJson(JSON.stringify(broken))).path).toBe("output.samples");
    expect(booth.doc).toBe(before);
    expect(notified).not.toHaveBeenCalled();
  });

  test("text that is not JSON is rejected the same way", () => {
    const { booth } = setup();
    expect(rejection(() => booth.importJson("{oops")).message).toMatch(/not valid JSON/);
  });

  test("importing the document already in place changes nothing", () => {
    const { booth, notified } = setup();
    booth.importJson(booth.exportJson());
    expect(notified).not.toHaveBeenCalled();
  });

  test("an imported slicing change re-slices an open STL", async () => {
    const rig = setup();
    await openPart(rig, binaryStl());
    const other = defaultDocument();
    other.slicing.wallCount = 4;
    rig.booth.importJson(JSON.stringify(other));
    rig.clock.advance(300);
    await untilCalls(rig, 2);
    expect(lastCall(rig).settings.wallCount).toBe(4);
  });
});

// ---- dispose -----------------------------------------------------------------------

describe("dispose", () => {
  test("saves what is pending, releases the pipeline and drops a result still in flight", async () => {
    const rig = setup();
    const opened = rig.booth.open(binaryStl());
    await untilCalls(rig, 1);
    rig.booth.update((d) => { d.camera.fStop = 4; });
    rig.booth.dispose();
    expect(rig.storage.writes).toHaveLength(1);
    expect(rig.print.disposed).toBe(true);
    const call = lastCall(rig);
    if (call.src === null) throw new Error("expected an open call");
    call.resolve(printFrom(call.src));
    await opened;
    expect(rig.booth.scene.part).toBeNull();
  });
});
