/**
 * Real Pyodide in Node, running the shim against a real AgentHost through a
 * direct synchronous booth_host. Blocking operators need the worker channel,
 * so they are left to tools/agent/drive.ts.
 */
import { loadPyodide, type PyodideAPI } from "pyodide";
import { beforeAll, describe, expect, test } from "vitest";
import type { JobIo } from "../src/agent/host";
import type { ScriptOutcome } from "../src/agent/protocol";
import { installShim, runScript } from "../src/agent/python";
import { createChannel, hostCaller, serveHost } from "../src/agent/rpc";
import { linearToHex } from "../src/ui/color";
import { binaryStl, hostRig, memoryIo } from "./agent-fixtures";

let py: PyodideAPI;
let rig = hostRig();
let io: JobIo = memoryIo().io;
let output: string[] = [];

beforeAll(async () => {
  py = await loadPyodide();
  installShim(py, (request) => {
    const reply = rig.host.call(request, io);
    if (typeof reply !== "string") throw new Error("a blocking operator needs the worker channel");
    return reply;
  }, (text) => { output.push(text); });
}, 60_000);

/** A fresh booth for each test. The interpreter is shared, as one worker serves many scripts. */
function fresh(): typeof rig {
  rig = hostRig();
  io = memoryIo().io;
  return rig;
}

function run(code: string): { outcome: ScriptOutcome; output: string } {
  output = [];
  const outcome = runScript(py, code);
  return { outcome, output: output.join("") };
}

function done(code: string): string {
  const { outcome, output: text } = run(code);
  if (outcome.kind !== "done") throw new Error(`${JSON.stringify(outcome)}\n${text}`);
  return text;
}

function failed(code: string): Extract<ScriptOutcome, { kind: "failed" }> {
  const { outcome } = run(code);
  if (outcome.kind !== "failed") throw new Error(`expected a failure, got ${JSON.stringify(outcome)}`);
  return outcome;
}

const py_ = (lines: readonly string[]) => lines.join("\n");

describe("the sessions of usage.md, without the blocking operators", () => {
  test("session 1: a three-light hero setup", () => {
    const r = fresh();
    const text = done(py_([
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
    ]));
    expect(text).toBe("lights: ['Key', 'Fill', 'Rim']\nkey at (0.707, -0.843, 0.9)\n");
    const doc = r.booth.doc;
    expect(doc.studio.lights.map((l) => [l.kind, l.name])).toEqual([["scrim", "Right gradient"], ["area", "Key"], ["area", "Fill"], ["area", "Rim"]]);
    expect(doc.studio.lights[1]).toMatchObject({ powerW: 30, width: 0.8, color: { kind: "kelvin", kelvin: 4800 } });
    expect(doc.studio.lights[3]).toMatchObject({ powerW: 25, width: 0.15, spreadDeg: expect.closeTo(40, 9) });
    expect(doc.camera).toMatchObject({ focalMm: 100, fStop: 8 });
    expect(doc.studio.world.strength).toBe(0.05);
    expect(doc.output).toMatchObject({ longEdgePx: 2000, samples: 512, timeLimitS: 600 });
    expect(r.booth.scene.film).toMatchObject({ width: 1600, height: 2000 });
    expect(r.host.session.renderFilepath).toBe("//renders/bracket_hero.png");
  });

  test("session 2: pose, slice and colour the part", async () => {
    const r = fresh();
    await r.booth.open(binaryStl());
    await r.booth.whenIdle();
    const text = done(py_([
      "import bpy, math",
      "part = bpy.data.objects['bracket']",
      "print(part.name, part.type, tuple(round(d, 4) for d in part.dimensions))",
      "part.booth.slicing.layer_height_mm = 0.12",
      "part.booth.rest_face = 'FRONT'",
      "part.rotation_euler.z = math.radians(-30)",
      "bpy.ops.booth.filament_apply(preset='PLA_MATTE')",
      "bsdf = part.active_material.node_tree.nodes['Principled BSDF']",
      "bsdf.inputs['Base Color'].default_value = (0.6, 0.02, 0.015, 1.0)",
      "print(bsdf.inputs['Base Color'].default_value[3], part.booth.filament.preset)",
    ]));
    expect(text).toBe("bracket MESH (0.06, 0.04, 0.1)\n1.0 PLA_MATTE\n");
    const doc = r.booth.doc;
    expect(doc.slicing.layerHeight).toBe(0.12);
    expect(doc.pose).toEqual({ restFace: "front", turntableDeg: expect.closeTo(-30, 9) });
    expect(doc.filament).toMatchObject({ presetId: "pla-matte", recipe: { colorHex: linearToHex([0.6, 0.02, 0.015]) } });
  });

  test("session 3: a spot light fails with the booth's recipe, and the retry works", () => {
    const r = fresh();
    const before = r.booth.doc;
    const spot = failed(py_([
      "import bpy, math",
      "bpy.ops.object.light_add(type='SPOT', location=(-0.4, -0.5, 0.6))",
      "spot = bpy.context.object",
      "spot.data.spot_size = math.radians(30)",
    ]));
    expect(spot.type).toBe("RuntimeError");
    expect(spot.message).toMatch(/^light_add: the booth has area lights only \(type='AREA'\)\. A spot is an area light with a small size and a narrow spread/);
    expect(spot.traceback).toMatch(/^Traceback \(most recent call last\):\n {2}File "<agent>", line 2, in <module>\n {4}bpy\.ops\.object\.light_add\(type='SPOT'/);
    expect(spot.traceback).not.toContain("/booth/");
    expect(spot.traceback.trimEnd().split("\n").at(-1)).toBe(`RuntimeError: ${spot.message}`);
    expect(r.booth.doc).toBe(before);
    expect(done(py_([
      "import bpy, math",
      "bpy.ops.object.light_add(type='AREA', location=(-0.4, -0.5, 0.6))",
      "spot = bpy.context.object",
      "spot.name = 'Spot'",
      "spot.data.size = 0.1",
      "spot.data.spread = math.radians(30)",
      "spot.data.energy = 50",
      "print(spot.name, spot.data.shape, round(math.degrees(spot.data.spread)))",
    ]))).toBe("Spot RECTANGLE 30\n");
  });
});

describe("Blender's shapes", () => {
  test("a vector read from a struct writes back through it, a copy does not", () => {
    const r = fresh();
    const text = done(py_([
      "import bpy",
      "obj = bpy.data.objects['Top softbox']",
      "before = obj.location.copy()",
      "obj.location.z += 0.1",
      "loc = obj.location",
      "loc.x = 0.25",
      "copy = obj.location.copy()",
      "copy.y = 9",
      "print(round(obj.location.z - before.z, 6), round(obj.location.x, 6), obj.location.y != 9)",
    ]));
    expect(text).toBe("0.1 0.25 True\n");
    const centre = r.booth.scene.lights.emitters.find((e) => e.id === "top")?.centre;
    expect(centre?.[0]).toBeCloseTo(0.25, 9);
  });

  test("structs are Blender classes, compare by what they are and print as Blender does", () => {
    fresh();
    expect(done(py_([
      "import bpy",
      "obj = bpy.data.objects['Top softbox']",
      "print(isinstance(obj, bpy.types.Object), isinstance(obj.data, bpy.types.AreaLight), repr(obj))",
      "print(obj == bpy.data.objects[obj.name], obj.data == bpy.data.lights['Top softbox'], obj == obj.data)",
      "print(len(bpy.data.objects), 'Camera' in bpy.data.objects, obj in bpy.data.objects, bpy.data.objects.get('Nope'))",
      "print(sorted({o.type for o in bpy.data.objects}), bpy.context.scene.camera.data.lens)",
      "print('energy' in dir(obj.data), bpy.data.objects.find('Backdrop'), bpy.app.version)",
    ]))).toBe([
      "True True bpy.data.objects['Top softbox']",
      "True True False",
      "7 True True None",
      "['CAMERA', 'LIGHT', 'MESH'] 85.0",
      "True 1 (5, 2, 3)",
      "",
    ].join("\n"));
  });

  test("each script starts with fresh globals while the scene and bpy.context.object carry over", () => {
    fresh();
    done("x = 41\nimport bpy\nbpy.ops.object.light_add(type='AREA')");
    const stale = failed("print(x + 1)");
    expect(stale).toMatchObject({ type: "NameError", message: "name 'x' is not defined" });
    expect(done("import bpy\nprint(bpy.context.object.name)")).toBe("Area\n");
  });

  test("a warning from the booth reaches the output", () => {
    fresh();
    expect(done("import bpy\nbpy.data.lights['Top softbox'].color = (0.2, 0.1, 0.1)"))
      .toMatch(/<agent>:2: UserWarning: the booth sets a light's brightness by energy alone, so a dark color only tints it/);
  });

  test("the same warning shows again in the next script and on each pass of a loop", () => {
    fresh();
    const dim = "import bpy\nbpy.data.lights['Top softbox'].color = (0.2, 0.1, 0.1)";
    done(dim);
    expect(done(dim)).toMatch(/UserWarning: the booth sets a light's brightness by energy alone/);
    const looped = done("import bpy\nfor _ in range(3):\n    bpy.data.lights['Top softbox'].color = (0.2, 0.1, 0.1)");
    expect(looped.match(/UserWarning/g)).toHaveLength(3);
  });

  test("a warning for a write through a colour component names the agent's line", () => {
    fresh();
    const text = done("import bpy\nlight = bpy.data.lights['Top softbox']\nlight.color = (0.6, 0.3, 0.2)\nlight.color.r = 0.1");
    expect(text).toMatch(/^<agent>:4: UserWarning: /);
  });

  test("bpy.booth.reference() is the table's", () => {
    fresh();
    expect(done("import bpy\nprint(bpy.booth.reference('AreaLight'))")).toContain(".energy: float W, 0 to 1000000");
  });
});

describe("errors read as Blender's", () => {
  const cases: [string, string, string, string][] = [
    ["a value outside the booth's limits", "bpy.data.lights['Top softbox'].energy = 2e6", "ValueError",
      "bpy.data.lights['Top softbox'].energy: must be at most 1000000, got 2000000 (document field studio.lights[0].powerW)"],
    ["a fixed setting", "bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'", "ValueError",
      "bpy.data.scenes['Scene'].render.engine is always 'CYCLES' in the booth: the booth renders with Cycles"],
    ["an operator Blender removed", "bpy.ops.import_mesh.stl(filepath='x.stl')", "AttributeError",
      "bpy.ops.import_mesh.stl is not in the booth: bpy.ops.import_mesh.stl was removed in Blender 4.2. Use bpy.ops.wm.stl_import(filepath=...)"],
    ["a missing object", "bpy.data.objects['Nope']", "KeyError", `'bpy_prop_collection[key]: key "Nope" not found'`],
    ["a removed light", "l = bpy.data.objects['Top softbox']\nbpy.data.objects.remove(l)\nl.location", "ReferenceError",
      "StructRNA of type Object has been removed"],
    ["a wrong type", "bpy.context.scene.cycles.samples = 'many'", "TypeError",
      "bpy.data.scenes['Scene'].cycles.samples: expected a float type, not str"],
  ];
  for (const [name, code, type, message] of cases) {
    test(name, () => {
      fresh();
      expect(failed(`import bpy\n${code}`)).toMatchObject({ type, message });
    });
  }

  test("a syntax error points at the agent's line", () => {
    fresh();
    const e = failed("import bpy\nbpy.context.scene.cycles.samples = = 4");
    expect(e.type).toBe("SyntaxError");
    expect(e.traceback).toContain(`File "<agent>", line 2`);
  });

  test("an error in a function shows every agent frame and none of the shim's", () => {
    fresh();
    const e = failed(py_([
      "import bpy",
      "def dim(name):",
      "    bpy.data.lights[name].energy = -1",
      "dim('Top softbox')",
    ]));
    expect(e.traceback.match(/File "<agent>"/g)).toHaveLength(2);
    expect(e.traceback).toContain("line 3, in dim");
    expect(e.traceback).not.toContain("bpy.py");
  });
});

describe("the call channel", () => {
  function channel(handler: (request: string) => string, bytes = 64) {
    const worker = new EventTarget();
    const buffer = createChannel(bytes);
    const stop = serveHost(worker, buffer, handler);
    const call = hostCaller(buffer, (message) => { worker.dispatchEvent(new MessageEvent("message", { data: message })); });
    return { call, stop };
  }

  test("answers a call with the handler's string", () => {
    expect(channel((request) => request.toUpperCase()).call("ping")).toBe("PING");
  });

  test("a failing handler is an error in the caller, with its message", () => {
    expect(() => channel(() => { throw new Error("no booth"); }).call("ping")).toThrow("no booth");
  });

  test("an answer larger than the buffer is an error naming its size, not a truncation", () => {
    expect(() => channel(() => "x".repeat(100)).call("ping")).toThrow("the answer is 100 bytes, more than the 64 byte channel holds");
  });
});
