import { describe, expect, test, vi } from "vitest";
import { progressText } from "../src/agent/host";
import { defaultDocument } from "../src/document";
import type { RadianceFrame } from "../src/film";
import type { PhotoEngine } from "../src/photo/photo";
import { FILM_DEFAULTS, sphericalAbout, type Scene } from "../src/scene";
import { binaryStl, err, hostRig, memoryIo, ok, wire } from "./agent-fixtures";

type Value = { v: unknown; wrap: string | null } | { struct: string; type: string } | { coll: string; owner: string };

function rig(raster: Parameters<typeof hostRig>[0] = null) {
  const r = hostRig(raster);
  const { io, log, cancel } = memoryIo({ "/agent/parts/bracket.stl": binaryStl() });
  const w = wire(r.host, io);
  const get = (handle: string, type: string, attr: string) => ok<Value>(w.send("get", handle, type, attr));
  const v = (handle: string, type: string, attr: string): unknown => {
    const value = get(handle, type, attr);
    if (!("v" in value)) throw new Error(`${attr} is not a plain value`);
    return value.v;
  };
  const set = (handle: string, type: string, attr: string, value: unknown) => w.send("set", handle, type, attr, value);
  const op = (name: string, args: Record<string, unknown> = {}) => w.send("op", name, args);
  const opAsync = (name: string, args: Record<string, unknown> = {}) => w.sendAsync("op", name, args);
  const names = (collection: string) => ok<{ name: string; struct: string; type: string }[]>(w.send("members", collection, "scene"));
  return { ...r, io, log, cancel, w, get, v, set, op, opAsync, names };
}

const near = (actual: unknown, expected: readonly number[], digits = 9) => {
  expect(Array.isArray(actual)).toBe(true);
  expected.forEach((e, i) => expect((actual as number[])[i]).toBeCloseTo(e, digits));
};

async function importPart(r: ReturnType<typeof rig>): Promise<void> {
  ok(await r.opAsync("wm.stl_import", { filepath: "parts/bracket.stl" }));
}

describe("reading", () => {
  test("a light's data reads the document in Blender's units", () => {
    const r = rig();
    const top = defaultDocument().studio.lights[0];
    expect(r.v("light:top", "AreaLight", "energy")).toBe(top.kind === "area" ? top.powerW : null);
    expect(r.v("light:top", "AreaLight", "spread")).toBeCloseTo(Math.PI, 12);
    expect(r.get("light:top", "AreaLight", "color")).toEqual({ v: [1, 1, 1], wrap: "Color" });
    expect(r.v("light:top", "LightObject", "hide_render")).toBe(false);
  });

  test("structs and collections come back as handles Python wraps", () => {
    const r = rig();
    expect(r.get("light:top", "LightObject", "data")).toEqual({ struct: "light:top", type: "AreaLight" });
    expect(r.get("scene", "Scene", "camera")).toEqual({ struct: "camera", type: "CameraObject" });
    expect(r.get("scene", "BlendData", "objects")).toEqual({ coll: "objects", owner: "scene" });
  });

  test("objects list the camera and the backdrop first, then every light with a unique name", () => {
    const r = rig();
    r.booth.update((d) => { d.studio.lights[1].name = "Camera"; });
    expect(r.names("objects").map((x) => [x.name, x.type])).toEqual([
      ["Camera", "CameraObject"], ["Backdrop", "BackdropObject"], ["Top softbox", "LightObject"], ["Camera.001", "ScrimObject"],
      ["Left strip", "LightObject"], ["Left rim", "LightObject"], ["Front fill", "LightObject"],
    ]);
    expect(r.names("lights").map((x) => x.name)).toEqual(["Top softbox", "Left strip", "Left rim", "Front fill"]);
    expect(r.w.send("repr", "light:right", "ScrimObject")).toEqual({ ok: "bpy.data.objects['Camera.001']" });
  });

  test("every FILM_DEFAULTS value reads through scene.cycles", () => {
    const r = rig();
    expect(r.v("scene", "CyclesRenderSettings", "max_bounces")).toBe(FILM_DEFAULTS.maxBounces);
    expect(r.v("scene", "CyclesRenderSettings", "adaptive_threshold")).toBe(FILM_DEFAULTS.adaptiveThreshold);
    expect(r.v("scene", "CyclesRenderSettings", "filter_width")).toBe(FILM_DEFAULTS.filterWidthPx);
  });

  test("resolution is the film the scene compiles", () => {
    const r = rig();
    expect([r.v("scene", "RenderSettings", "resolution_x"), r.v("scene", "RenderSettings", "resolution_y")])
      .toEqual([r.booth.scene.film.width, r.booth.scene.film.height]);
  });
});

describe("writing", () => {
  test("an assignment is one booth.update in document units", () => {
    const r = rig();
    const heard = vi.fn();
    r.booth.subscribe(heard);
    expect(ok(r.set("light:top", "AreaLight", "spread", (40 * Math.PI) / 180))).toEqual({ warning: null });
    expect(heard).toHaveBeenCalledTimes(1);
    const top = r.booth.doc.studio.lights[0];
    expect(top.kind === "area" && top.spreadDeg).toBeCloseTo(40, 9);
  });

  test("a value outside BOUNDS is a ValueError naming the bpy attribute and the document field, and nothing changes", () => {
    const r = rig();
    const before = r.booth.doc;
    expect(err(r.set("light:top", "AreaLight", "energy", 2e6))).toEqual({
      type: "ValueError",
      message: "bpy.data.lights['Top softbox'].energy: must be at most 1000000, got 2000000 (document field studio.lights[0].powerW)",
    });
    expect(err(r.set("light:top", "AreaLight", "spread", 0.001)).message)
      .toBe("bpy.data.lights['Top softbox'].spread: 0.001 is out of range, 0.0174533 to 3.14159 rad (document field studio.lights[0].spreadDeg)");
    expect(r.booth.doc).toBe(before);
  });

  test("a wrong type is a TypeError in Blender's words", () => {
    const r = rig();
    expect(err(r.set("light:top", "AreaLight", "energy", "bright"))).toEqual({
      type: "TypeError", message: "bpy.data.lights['Top softbox'].energy: expected a float type, not str",
    });
    expect(err(r.set("scene", "ViewSettings", "look", "Filmic")).message).toContain(`enum "Filmic" not found in ('None', 'AgX - Punchy'`);
  });

  test("a fixed attribute accepts its own value and refuses any other", () => {
    const r = rig();
    expect(ok(r.set("scene", "RenderSettings", "engine", "CYCLES"))).toEqual({ warning: null });
    expect(err(r.set("scene", "RenderSettings", "engine", "BLENDER_EEVEE_NEXT"))).toEqual({
      type: "ValueError", message: "bpy.data.scenes['Scene'].render.engine is always 'CYCLES' in the booth: the booth renders with Cycles",
    });
  });

  test("Blender attributes the booth lacks say what to use instead, unknown ones list what exists", () => {
    const r = rig();
    expect(err(r.set("light:top", "AreaLight", "shadow_soft_size", 0.2))).toEqual({
      type: "AttributeError", message: "bpy.data.lights['Top softbox'].shadow_soft_size is not in the booth: an area light's softness is data.size and data.size_y",
    });
    const unknown = err(r.w.send("get", "light:top", "AreaLight", "wattage"));
    expect(unknown.type).toBe("AttributeError");
    expect(unknown.message).toMatch(/^'AreaLight' object has no attribute 'wattage'\. The booth's AreaLight has: name, type, energy, size/);
  });

  test("a light removed in the tab is Blender's ReferenceError", () => {
    const r = rig();
    r.booth.update((d) => { d.studio.lights = d.studio.lights.filter((l) => l.id !== "top"); });
    expect(err(r.w.send("get", "light:top", "AreaLight", "energy"))).toEqual({ type: "ReferenceError", message: "StructRNA of type AreaLight has been removed" });
    expect(err(r.set("light:top", "LightObject", "name", "Key")).type).toBe("ReferenceError");
  });

  test("a light's location is its place about the subject, read back exactly", () => {
    const r = rig();
    ok(r.set("light:top", "LightObject", "location", [0.5, -0.8, 0.6]));
    near(r.v("light:top", "LightObject", "location"), [0.5, -0.8, 0.6]);
    const placed = sphericalAbout(r.booth.scene.lights.aim, [0.5, -0.8, 0.6]);
    expect(r.booth.doc.studio.lights[0]).toMatchObject({ azimuth: placed.azimuth, elevation: placed.elevation, distance: placed.distance });
    expect(err(r.set("light:top", "LightObject", "location", [...r.booth.scene.lights.aim])).message)
      .toBe("bpy.data.objects['Top softbox'].location: a light cannot sit on the point it aims at");
  });

  test("moving the camera keeps its target, so it orbits", () => {
    const r = rig();
    const target = [...r.booth.doc.camera.target];
    ok(r.set("camera", "CameraObject", "location", [0.6, -0.6, 0.4]));
    near(r.v("camera", "CameraObject", "location"), [0.6, -0.6, 0.4]);
    expect([...r.booth.doc.camera.target]).toEqual(target);
  });

  test("the camera's rotation reads as Blender's and turning it keeps the camera where it is", () => {
    const r = rig();
    near(r.v("camera", "CameraObject", "rotation_euler"), [(68 * Math.PI) / 180, 0, 0]);
    const at = [...r.booth.scene.camera.position];
    ok(r.set("camera", "CameraObject", "rotation_euler", [(80 * Math.PI) / 180, 0, (30 * Math.PI) / 180]));
    near([...r.booth.scene.camera.position], at);
    expect(r.booth.doc.camera).toMatchObject({ elevation: expect.closeTo(10, 9), azimuth: expect.closeTo(30, 9) });
    expect(err(r.set("camera", "CameraObject", "rotation_euler", [1, 0.2, 0])).message)
      .toBe("bpy.data.objects['Camera'].rotation_euler: the booth camera never rolls: rotation_euler.y must be 0");
  });

  test("resolution_x then resolution_y sets the aspect and the long edge", () => {
    const r = rig();
    ok(r.set("scene", "RenderSettings", "resolution_x", 1920));
    ok(r.set("scene", "RenderSettings", "resolution_y", 1080));
    expect(r.booth.scene.film).toMatchObject({ width: 1920, height: 1080 });
    expect(r.booth.doc.output).toMatchObject({ aspect: { w: 16, h: 9 }, longEdgePx: 1920 });
    ok(r.set("scene", "RenderSettings", "resolution_x", 1601));
    expect(r.booth.scene.film).toMatchObject({ width: 1601, height: 1080 });
  });

  test("a temperature turns use_temperature on, and a colour then waits for it to be turned off", () => {
    const r = rig();
    ok(r.set("light:top", "AreaLight", "temperature", 4800));
    expect(r.v("light:top", "AreaLight", "use_temperature")).toBe(true);
    expect(r.booth.doc.studio.lights[0].color).toEqual({ kind: "kelvin", kelvin: 4800 });
    expect(err(r.set("light:top", "AreaLight", "color", [1, 0.5, 0.2])).type).toBe("ValueError");
    ok(r.set("light:top", "AreaLight", "use_temperature", false));
    expect(ok(r.set("light:top", "AreaLight", "color", [1, 0.5, 0.2]))).toEqual({ warning: null });
    expect(ok(r.set("light:top", "AreaLight", "color", [0.2, 0.1, 0.1]))).toEqual({ warning: expect.stringContaining("energy alone") });
  });

  test("renaming to a taken name gets Blender's suffix", () => {
    const r = rig();
    ok(r.set("light:left", "LightObject", "name", "Top softbox"));
    expect(r.v("light:left", "LightObject", "name")).toBe("Top softbox.001");
    expect(r.booth.doc.studio.lights[2].name).toBe("Top softbox.001");
  });

  test("the world's nodes reach strength and rotation, and its colour says it is the HDR", () => {
    const r = rig();
    expect(r.names("world.nodes").map((x) => x.name)).toEqual(["Mapping", "Environment Texture", "Background"]);
    ok(r.set("world", "WorldStrengthInput", "default_value", 0.05));
    ok(r.set("world", "WorldRotationInput", "default_value", [0, 0, Math.PI / 2]));
    expect(r.booth.doc.studio.world).toMatchObject({ strength: 0.05, rotationDeg: expect.closeTo(90, 9) });
    expect(err(r.set("world", "WorldColorInput", "default_value", [0, 0, 0, 1])).message).toContain("is not in the booth: the world's colour is the HDR image");
    expect(r.get("world", "WorldEnvironment", "image")).toEqual({ struct: "image:studio_small_09_1k", type: "Image" });
    expect(ok(r.set("world", "WorldEnvironment", "image", { $struct: "image:studio_small_09_1k" }))).toEqual({ warning: null });
  });

  test("scene.render.filepath is the session's, not the document's", () => {
    const r = rig();
    expect(r.v("scene", "RenderSettings", "filepath")).toBe("//");
    const before = r.booth.doc;
    ok(r.set("scene", "RenderSettings", "filepath", "//renders/hero.png"));
    expect(r.v("scene", "RenderSettings", "filepath")).toBe("//renders/hero.png");
    expect(r.booth.doc).toBe(before);
  });
});

describe("operators", () => {
  test("light_add adds an area light where asked, Blender-named, as bpy.context.object", () => {
    const r = rig();
    expect(ok(r.op("object.light_add", { type: "AREA", location: [0.4, -0.5, 0.6] }))).toEqual(["FINISHED"]);
    expect(ok(r.op("object.light_add", { type: "AREA" }))).toEqual(["FINISHED"]);
    const added = r.booth.doc.studio.lights.slice(-2);
    expect(added.map((l) => [l.kind, l.name])).toEqual([["area", "Area"], ["area", "Area.001"]]);
    expect(r.get("scene", "Context", "object")).toEqual({ struct: `light:${added[1].id}`, type: "LightObject" });
    near(r.v(`light:${added[0].id}`, "LightObject", "location"), [0.4, -0.5, 0.6]);
  });

  test("a spot light is refused with the booth's recipe and nothing is added", () => {
    const r = rig();
    const before = r.booth.doc;
    const e = err(r.op("object.light_add", { type: "SPOT", location: [-0.4, -0.5, 0.6] }));
    expect(e.type).toBe("RuntimeError");
    expect(e.message).toContain("light_add: the booth has area lights only (type='AREA'). A spot is an area light with a small size and a narrow spread");
    expect(r.booth.doc).toBe(before);
  });

  test("unknown keywords, ignored values and unknown operators are refused", () => {
    const r = rig();
    expect(err(r.op("object.light_add", { type: "AREA", energy: 30 }))).toEqual({
      type: "TypeError", message: "bpy.ops.object.light_add: keyword \"energy\" unrecognized. It takes type, location, rotation, align, radius, scale",
    });
    expect(err(r.op("object.light_add", { type: "AREA", rotation: [1, 0, 0] })).message)
      .toBe("bpy.ops.object.light_add: rotation can only be (0, 0, 0) in the booth: a booth light always faces the subject, so place it with location alone");
    expect(ok(r.op("object.light_add", { type: "AREA", rotation: [0, 0, 0] }))).toEqual(["FINISHED"]);
    expect(err(r.op("import_mesh.stl", { filepath: "x.stl" }))).toEqual({
      type: "AttributeError", message: "bpy.ops.import_mesh.stl is not in the booth: bpy.ops.import_mesh.stl was removed in Blender 4.2. Use bpy.ops.wm.stl_import(filepath=...)",
    });
    expect(err(r.op("mesh.bevel")).message).toMatch(/^Calling operator "bpy\.ops\.mesh\.bevel" error, could not be found\./);
  });

  test("a scrim takes its size, and removing it clears bpy.context.object", () => {
    const r = rig();
    ok(r.op("booth.scrim_add", { location: [0.8, 0.3, 0.5], size: [1.2, 1.6] }));
    const scrim = r.booth.doc.studio.lights.at(-1);
    expect(scrim).toMatchObject({ kind: "scrim", name: "Scrim", width: 1.2, height: 1.6 });
    ok(r.w.send("remove", "objects", `light:${scrim?.id}`));
    expect(r.booth.doc.studio.lights.some((l) => l.id === scrim?.id)).toBe(false);
    expect(r.get("scene", "Context", "object")).toEqual({ v: null, wrap: null });
    expect(err(r.w.send("remove", "objects", "camera"))).toEqual({ type: "RuntimeError", message: "bpy.data.objects.remove: the booth's Camera cannot be removed" });
  });

  test("look_apply and filament_apply apply the booth's presets", () => {
    const r = rig();
    ok(r.op("booth.look_apply", { look: "DARK" }));
    expect(r.booth.doc.lookBase).toBe("dark");
    expect(r.v("scene", "BoothScene", "look")).toBe("DARK");
    ok(r.op("booth.filament_apply", { preset: "PLA_MATTE" }));
    expect(r.booth.doc.filament.presetId).toBe("pla-matte");
    expect(err(r.op("booth.look_apply")).message).toBe("bpy.ops.booth.look_apply: look is required, one of ('STUDIO', 'DARK', 'GRADIENT', 'RIM', 'RAKING')");
  });

  test("stl_import reads the agent's file, waits until it is sliced and makes the part bpy.context.object", async () => {
    const r = rig();
    await importPart(r);
    expect(r.booth.print.status).toBe("ready");
    expect(r.get("scene", "Context", "object")).toEqual({ struct: "part", type: "PartObject" });
    expect(r.names("objects").map((x) => x.name)).toContain("bracket");
    expect(r.log.progress).toContain("opening bracket.stl · slicing");
    near(r.v("part", "PartObject", "dimensions"), [0.06, 0.04, 0.1]);
  });

  test("stl_import refuses another kind of file and says when the file cannot be read", async () => {
    const r = rig();
    expect(err(await r.opAsync("wm.stl_import", { filepath: "parts/benchy.gcode" })).message)
      .toBe("bpy.ops.wm.stl_import reads .stl files, not benchy.gcode: open G-code with bpy.ops.booth.gcode_import(filepath=...)");
    expect(err(await r.opAsync("wm.stl_import", { filepath: "parts/missing.stl" }))).toEqual({
      type: "RuntimeError", message: "bpy.ops.wm.stl_import: cannot read parts/missing.stl: no such file: /agent/parts/missing.stl",
    });
  });

  test("a slicing edit then a render waits for the re-slice", async () => {
    const r = rig();
    await importPart(r);
    ok(r.set("part", "BoothSlicing", "layer_height_mm", 0.12));
    const rendering = r.opAsync("render.render");
    await vi.waitFor(() => expect(r.runs).toHaveLength(1), { timeout: 2000 });
    expect(r.print.slices.at(-1)?.layerHeight).toBe(0.12);
    r.runs[0].finish();
    expect(ok(await rendering)).toEqual(["FINISHED"]);
  });
});

describe("render.render", () => {
  test("goes through the photo card, reports progress and returns a thumbnail", async () => {
    const r = rig();
    await importPart(r);
    const rendering = r.opAsync("render.render");
    await vi.waitFor(() => expect(r.runs).toHaveLength(1));
    expect(r.photos.state.get().run.phase).toBe("running");
    r.runs[0].emit({ state: "rendering", fraction: 0.42, image: null, etaS: 150 });
    r.runs[0].finish();
    expect(ok(await rendering)).toEqual(["FINISHED"]);
    expect(r.log.progress).toContain("rendering 42% · about 2m30s left · time limit 5m");
    expect(r.log.images.map((i) => i.meta)).toEqual([{ label: "render", path: null, width: 1600, height: 1600, note: "32/32 samples, Cycles" }]);
    expect(r.log.written.size).toBe(0);
  });

  test("write_still writes to scene.render.filepath, as a file or into a folder", async () => {
    const r = rig();
    await importPart(r);
    ok(r.set("scene", "RenderSettings", "filepath", "//renders/hero.png"));
    let rendering = r.opAsync("render.render", { write_still: true });
    await vi.waitFor(() => expect(r.runs).toHaveLength(1));
    r.runs[0].finish({ samples: 20, stoppedBy: { kind: "time-limit", limitS: 300 } });
    ok(await rendering);
    ok(r.set("scene", "RenderSettings", "filepath", "//renders"));
    rendering = r.opAsync("render.render", { write_still: true });
    await vi.waitFor(() => expect(r.runs).toHaveLength(2));
    r.runs[1].finish();
    ok(await rendering);
    expect([...r.log.written.keys()]).toEqual(["/agent/renders/hero.png", "/agent/renders/bracket_20261119-2200.png"]);
    expect(r.log.images[0].meta).toMatchObject({ path: "/agent/renders/hero.png", note: "20/32 samples, stopped by the 300 s time limit, Cycles" });
    expect(r.log.prints).toContain("Render stopped by the 300 s time limit at 20 of 32 samples (scene.cycles.time_limit).\n");
  });

  test("with no part, or with a photo already running, it says why", async () => {
    const r = rig();
    expect(err(await r.opAsync("render.render")).message).toMatch(/^render\.render: no part is open\. Import one first/);
    await importPart(r);
    r.photos.take();
    expect(err(await r.opAsync("render.render")).message).toBe("render.render: a photo is already running in the booth tab. Wait for it, or cancel it in the photo card");
  });

  test("cancelling the job cancels the photo", async () => {
    const r = rig();
    await importPart(r);
    const rendering = r.opAsync("render.render");
    await vi.waitFor(() => expect(r.runs).toHaveLength(1));
    r.cancel();
    expect(err(await rendering)).toEqual({ type: "RuntimeError", message: "the script was cancelled" });
    expect(r.runs[0].cancelled).toBe(true);
    expect(r.photos.state.get().run.phase).toBe("cancelled");
  });

  test("a photo cancelled in the tab returns CANCELLED and says so", async () => {
    const r = rig();
    await importPart(r);
    const rendering = r.opAsync("render.render");
    await vi.waitFor(() => expect(r.runs).toHaveLength(1));
    r.photos.cancel();
    expect(ok(await rendering)).toEqual(["CANCELLED"]);
    expect(r.log.prints).toEqual(["render.render: the photo was cancelled in the booth tab.\n"]);
  });
});

describe("render.opengl", () => {
  test("renders a small raster preview of the setup without touching the document", async () => {
    const rendered: Scene[] = [];
    const raster: Pick<PhotoEngine, "render"> = {
      render: async (scene): Promise<RadianceFrame> => {
        rendered.push(scene);
        return { width: scene.film.width, height: scene.film.height, samples: scene.film.samples, rgba: new Float32Array(4) };
      },
    };
    const r = rig(raster);
    const before = r.booth.doc;
    expect(ok(await r.opAsync("render.opengl"))).toEqual(["FINISHED"]);
    expect(rendered[0].film).toMatchObject({ width: 768, height: 768, samples: 16 });
    expect(r.booth.doc).toBe(before);
    expect(r.log.images.map((i) => i.meta)).toEqual([{ label: "preview", path: null, width: 768, height: 768, note: "raster preview, not a Cycles photo" }]);
  });

  test("without a viewport it says the preview is not available", async () => {
    const r = rig();
    expect(err(await r.opAsync("render.opengl"))).toEqual({ type: "RuntimeError", message: "render.opengl: the preview is not available in this tab" });
  });
});

describe("the FFI boundary", () => {
  test("a malformed request is a RuntimeError, not a crash", () => {
    const r = rig();
    expect(JSON.parse(r.host.call("not json", null) as string)).toEqual({ error: { type: "RuntimeError", message: expect.stringContaining("not JSON") } });
    expect(err(r.w.send("get", "lamp:1", "AreaLight", "energy")).message).toContain("no handle");
    expect(err(r.w.send("get", "light:top", "SpotLight", "energy")).message).toContain("no type");
  });

  test("boot lists every type's Python class and attributes, without the missing ones", () => {
    const r = rig();
    const boot = ok<{ types: Record<string, { pyClass: string; attrs: string[] }> }>(r.w.send("boot"));
    expect(boot.types.AreaLight.pyClass).toBe("AreaLight");
    expect(boot.types.LightObject.pyClass).toBe("Object");
    expect(boot.types.AreaLight.attrs).toContain("energy");
    expect(boot.types.AreaLight.attrs).not.toContain("shadow_soft_size");
  });

  test("progress text reads like the photo card", () => {
    expect(progressText({ state: "rendering", fraction: 0.08, image: null, etaS: 540 }, 600)).toBe("rendering 8% · about 9m left · time limit 10m");
    expect(progressText({ state: "rendering", fraction: 0.5, image: null, etaS: null }, 0)).toBe("rendering 50%");
    expect(progressText({ state: "cancelled" }, 0)).toBeNull();
  });
});

