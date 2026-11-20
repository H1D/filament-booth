/**
 * Props through the agent's bpy, as bpy.py sends requests: the primitive add
 * operators, booth.prop_import, the object and material attributes, removal.
 */
import { describe, expect, test } from "vitest";
import { err, hostRig, memoryIo, ok, wire } from "./agent-fixtures";

type Value = { v: unknown; wrap: string | null } | { struct: string; type: string } | { coll: string; owner: string };

/** A binary STL of an axis-aligned box from `min` to `max`, millimetres. */
function boxStl(min: readonly number[], max: readonly number[], name = "battery.stl"): File {
  const c = (i: number) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
  const quads = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
  const tris = quads.flatMap(([a, b, cc, d]) => [[a, b, cc], [a, cc, d]]);
  const bytes = new Uint8Array(84 + 50 * tris.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, tris.length, true);
  tris.forEach((t, i) => t.forEach((corner, k) => c(corner).forEach((v, a) => view.setFloat32(84 + 50 * i + 12 + 12 * k + 4 * a, v, true))));
  return new File([bytes], name);
}

function rig() {
  const r = hostRig();
  const { io } = memoryIo({ "/agent/props/battery.stl": boxStl([100, 200, 5], [190, 280, 305]) });
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
  const members = (collection: string, owner = "scene") => ok<{ name: string; struct: string; type: string }[]>(w.send("members", collection, owner));
  const active = () => get("scene", "Context", "object");
  return { ...r, w, get, v, set, op, opAsync, members, active };
}

const near = (actual: unknown, expected: readonly number[], digits = 9) => {
  expect(Array.isArray(actual)).toBe(true);
  expect((actual as number[]).length).toBe(expected.length);
  expected.forEach((e, i) => expect((actual as number[])[i]).toBeCloseTo(e, digits));
};

describe("adding primitives", () => {
  test("a cube takes Blender's size, location, rotation and scale, and becomes the active object", () => {
    const r = rig();
    expect(ok(r.op("mesh.primitive_cube_add", { size: 0.1, location: [0.2, 0, 0.05], rotation: [0, 0, Math.PI / 2], scale: [1, 2, 3] }))).toEqual(["FINISHED"]);
    expect(r.booth.doc.props).toEqual([expect.objectContaining({
      id: "prop-1", name: "Cube", shape: "cube", mesh: null, size: [0.1, 0.2, expect.closeTo(0.3, 12)], location: [0.2, 0, 0.05],
      scale: [1, 1, 1], rotationDeg: [0, 0, expect.closeTo(90, 9)],
    })]);
    expect(r.active()).toEqual({ struct: "prop:prop-1", type: "PropObject" });
    near(r.v("prop:prop-1", "PropObject", "dimensions"), [0.1, 0.2, 0.3]);
    near(r.v("prop:prop-1", "PropObject", "rotation_euler"), [0, 0, Math.PI / 2]);
    expect(r.booth.scene.props).toHaveLength(1);
  });

  test("Blender's defaults hold: a bare cube is 2 m at the origin", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add"));
    expect(r.booth.doc.props[0]).toMatchObject({ size: [2, 2, 2], location: [0, 0, 0] });
  });

  test("a cylinder's radius and depth, and its vertices as segments", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cylinder_add", { vertices: 64, radius: 0.04, depth: 0.3 }));
    expect(r.booth.doc.props[0]).toMatchObject({ shape: "cylinder", size: [0.08, 0.08, 0.3], segments: 64 });
    expect(r.v("prop:prop-1", "BoothProp", "segments")).toBe(64);
  });

  test("a sphere's rings are half its segments, and another ring_count is refused", () => {
    const r = rig();
    ok(r.op("mesh.primitive_uv_sphere_add", { segments: 48, ring_count: 24, radius: 0.05 }));
    expect(r.booth.doc.props[0]).toMatchObject({ shape: "sphere", size: [0.1, 0.1, 0.1], segments: 48 });
    expect(err(r.op("mesh.primitive_uv_sphere_add", { segments: 48, ring_count: 10 })).message).toContain("ring_count must be 24");
  });

  test("a plane stood up as a wall", () => {
    const r = rig();
    ok(r.op("mesh.primitive_plane_add", { size: 0.6, location: [0, 0.12, 0.3], rotation: [Math.PI / 2, 0, 0] }));
    const wall = r.booth.scene.props[0];
    // Rotated 90 degrees about X, the plane's +Z normal points to -Y, towards the camera.
    near(wall.toWorld.slice(8, 11), [0, -1, 0]);
    near(r.v("prop:prop-1", "PropObject", "dimensions"), [0.6, 0.6, 0]);
  });

  test("names are unique among objects, as Blender's", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    expect(r.booth.doc.props.map((p) => p.name)).toEqual(["Cube", "Cube.001"]);
  });

  test("an unknown argument and a non-positive size are refused, and the booth is unchanged", () => {
    const r = rig();
    expect(err(r.op("mesh.primitive_cube_add", { radius: 1 })).type).toBe("TypeError");
    expect(err(r.op("mesh.primitive_cube_add", { size: 0 })).message).toMatch(/size/);
    expect(err(r.op("mesh.primitive_cube_add", { size: 1, scale: [1, -1, 1] })).message).toContain("scale must be positive");
    expect(err(r.op("mesh.primitive_cube_add", { enter_editmode: true })).message).toContain("edit mode");
    expect(r.booth.doc.props).toEqual([]);
  });
});

describe("a prop as an object", () => {
  test("it is listed after the lights and removed like one", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    const objects = r.members("objects");
    expect(objects.at(-1)).toEqual({ name: "Cube", struct: "prop:prop-1", type: "PropObject" });
    ok(r.w.send("remove", "objects", "prop:prop-1"));
    expect(r.booth.doc.props).toEqual([]);
    expect(r.active()).toEqual({ v: null, wrap: null });
    expect(err(r.w.send("get", "prop:prop-1", "PropObject", "location")).type).toBe("ReferenceError");
  });

  test("location, rotation, scale, dimensions and hide_render are one booth.update each", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cylinder_add", { radius: 0.05, depth: 0.2 }));
    ok(r.set("prop:prop-1", "PropObject", "location", [0.1, 0.2, 0.1]));
    ok(r.set("prop:prop-1", "PropObject", "rotation_euler", [0, Math.PI / 2, 0]));
    ok(r.set("prop:prop-1", "PropObject", "dimensions", [0.05, 0.05, 0.4]));
    expect(r.booth.doc.props[0]).toMatchObject({ location: [0.1, 0.2, 0.1], scale: [0.5, 0.5, 2], rotationDeg: [0, expect.closeTo(90, 9), 0] });
    ok(r.set("prop:prop-1", "PropObject", "hide_render", true));
    expect(r.booth.doc.props[0].on).toBe(false);
    expect(r.booth.scene.props).toEqual([]);
  });

  test("an out-of-range value names the document field and changes nothing", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    const e = err(r.set("prop:prop-1", "PropObject", "location", [500, 0, 0]));
    expect(e.type).toBe("ValueError");
    expect(e.message).toContain("props[0].location[0]");
    expect(r.booth.doc.props[0].location).toEqual([0, 0, 0]);
  });

  test("its material is its own Principled BSDF, listed in bpy.data.materials under its name", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    ok(r.set("prop:prop-1", "PropObject", "name", "Battery"));
    expect(r.get("prop:prop-1", "PropObject", "active_material")).toEqual({ struct: "prop:prop-1", type: "PropMaterial" });
    expect(r.members("materials").map((m) => m.name)).toEqual(["Backdrop", "Filament", "Battery"]);
    const nodes = r.get("prop:prop-1", "PropNodeTree", "nodes");
    expect(nodes).toEqual({ coll: "prop.nodes", owner: "prop:prop-1" });
    expect(r.members("prop.principled.inputs", "prop:prop-1").map((m) => [m.name, m.struct]))
      .toEqual([["Base Color", "prop:prop-1"], ["Metallic", "prop:prop-1"], ["Roughness", "prop:prop-1"]]);
    ok(r.set("prop:prop-1", "PropBaseColorInput", "default_value", [0.02, 0.02, 0.02, 1]));
    ok(r.set("prop:prop-1", "PropRoughnessInput", "default_value", 0.35));
    expect(r.booth.doc.props[0]).toMatchObject({ color: [0.02, 0.02, 0.02], roughness: 0.35 });
    expect(err(r.set("prop:prop-1", "PropMetallicInput", "default_value", 1)).message).toContain("dielectrics");
    expect(err(r.w.send("get", "prop:prop-1", "PropMaterial", "diffuse_color")).message).toContain("Base Color");
    expect(r.w.send("repr", "prop:prop-1", "PropRoughnessInput"))
      .toEqual({ ok: "bpy.data.materials['Battery'].node_tree.nodes['Principled BSDF'].inputs['Roughness']" });
  });

  test("a light and a prop can share neither handle nor name", () => {
    const r = rig();
    ok(r.op("mesh.primitive_cube_add", { size: 0.1 }));
    ok(r.set("prop:prop-1", "PropObject", "name", "Top softbox"));
    expect(r.booth.doc.props[0].name).toBe("Top softbox.001");
  });
});

describe("importing an STL as a prop", () => {
  test("it reads millimetres, stands on its base and keeps the part", async () => {
    const r = rig();
    expect(ok(await r.opAsync("booth.prop_import", { filepath: "props/battery.stl", location: [0, 0.02, 0] }))).toEqual(["FINISHED"]);
    const prop = r.booth.doc.props[0];
    expect(prop).toMatchObject({ shape: "mesh", name: "battery", size: [1, 1, 1], location: [0, 0.02, 0] });
    expect(prop.mesh).toMatch(/^mesh-[0-9a-f]{8}$/);
    expect(r.booth.partName).toBeNull();
    near(r.v("prop:prop-1", "PropObject", "dimensions"), [0.09, 0.08, 0.3], 6);
    expect(r.v("prop:prop-1", "BoothProp", "mesh_file")).toBe("battery.stl");
    expect(r.v("prop:prop-1", "BoothProp", "is_loaded")).toBe(true);
    const g = r.booth.scene.props[0].geometry;
    expect([...g.bounds.min].map((x) => Number(x.toFixed(6)))).toEqual([-0.045, -0.04, 0]);
    expect(g.index.length).toBe(36);
  });

  test("the same file twice shares one mesh, and global_scale multiplies its size", async () => {
    const r = rig();
    ok(await r.opAsync("booth.prop_import", { filepath: "props/battery.stl" }));
    ok(await r.opAsync("booth.prop_import", { filepath: "//props/battery.stl", global_scale: 0.5 }));
    const [a, b] = r.booth.doc.props;
    expect(b.mesh).toBe(a.mesh);
    expect(b).toMatchObject({ name: "battery.001", size: [0.5, 0.5, 0.5] });
  });

  test("a missing file or another format is a RuntimeError that names it", async () => {
    const r = rig();
    expect(err(await r.opAsync("booth.prop_import", { filepath: "props/nothing.stl" })).message).toContain("cannot read props/nothing.stl");
    expect(err(await r.opAsync("booth.prop_import", { filepath: "props/battery.obj" })).message).toContain("reads .stl files");
    expect(r.booth.doc.props).toEqual([]);
  });

  test("a prop whose mesh is not loaded is not drawn and says so", () => {
    const r = rig();
    r.booth.update((d) => {
      d.props.push({ ...structuredClone(d.props[0] ?? null), id: "prop-1", name: "Old", on: true, shape: "mesh", mesh: "mesh-00000000",
        size: [1, 1, 1], segments: 32, location: [0, 0, 0], rotationDeg: [0, 0, 0], scale: [1, 1, 1], color: [0.5, 0.5, 0.5], roughness: 0.5 } as never);
    });
    expect(r.booth.scene.props).toEqual([]);
    expect(r.v("prop:prop-1", "BoothProp", "is_loaded")).toBe(false);
    expect(err(r.set("prop:prop-1", "PropObject", "dimensions", [1, 1, 1])).message).toContain("not loaded");
  });
});

describe("the reference", () => {
  test("names the new operators and types", () => {
    const r = rig();
    const text = ok<string>(r.w.send("reference", null));
    for (const name of ["bpy.ops.mesh.primitive_cube_add", "bpy.ops.mesh.primitive_cylinder_add", "bpy.ops.mesh.primitive_uv_sphere_add",
      "bpy.ops.mesh.primitive_plane_add", "bpy.ops.booth.prop_import", "PropObject: Object", "PropMaterial: Material"]) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain("the booth holds one printed part");
  });
});
