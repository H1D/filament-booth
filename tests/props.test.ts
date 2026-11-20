/** Props: the document boundary, the named edits, the scene section and its geometry, and Booth's mesh store. */
import { describe, expect, test } from "vitest";
import { Booth, type PrintPort } from "../src/booth";
import { DocumentError, defaultDocument, parseDocument, type BoothDocument } from "../src/document";
import { addProp, patchProp, removeProp } from "../src/edits";
import { compileScene, exportScene, primitiveGeometry, propMatrix, propWorldBounds, stlPropGeometry, transformPoint, type PropGeometry } from "../src/scene";

const withProps = (...edits: ((d: BoothDocument) => void)[]): BoothDocument => {
  const doc = defaultDocument();
  for (const e of edits) e(doc);
  return doc;
};

describe("the document", () => {
  test("a setup saved before props existed opens with none", () => {
    const old = JSON.parse(JSON.stringify(defaultDocument())) as Record<string, unknown>;
    delete old.props;
    expect(parseDocument(old).props).toEqual([]);
  });

  test("a prop round-trips, and its fields are checked", () => {
    const doc = withProps(addProp("cylinder", { segments: 48 }));
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).props).toEqual(doc.props);
    const bad = (mutate: (p: Record<string, unknown>) => void) => {
      const raw = JSON.parse(JSON.stringify(doc)) as { props: Record<string, unknown>[] };
      mutate(raw.props[0]);
      return () => parseDocument(raw);
    };
    expect(bad((p) => { p.size = [0, 1, 1]; })).toThrow(new DocumentError("props[0].size[0]", "must be greater than 0, got 0"));
    expect(bad((p) => { p.segments = 2; })).toThrow(DocumentError);
    expect(bad((p) => { p.shape = "torus"; })).toThrow(/props\[0\]\.shape/);
    expect(bad((p) => { p.mesh = "mesh-1"; })).toThrow(/a cylinder has no mesh/);
    expect(bad((p) => { p.shape = "mesh"; })).toThrow(/a mesh prop names its mesh/);
  });

  test("ids are unique", () => {
    const doc = withProps(addProp("cube"), addProp("cube"));
    expect(doc.props.map((p) => p.id)).toEqual(["prop-1", "prop-2"]);
    const raw = JSON.parse(JSON.stringify(doc)) as { props: { id: string }[] };
    raw.props[1].id = "prop-1";
    expect(() => parseDocument(raw)).toThrow(/duplicate prop id/);
  });

  test("patch keeps id and shape, remove drops only its prop", () => {
    const doc = withProps(addProp("cube"), addProp("sphere"));
    patchProp("prop-1", { roughness: 0.2, ...({ id: "x", shape: "plane" } as object) })(doc);
    expect(doc.props[0]).toMatchObject({ id: "prop-1", shape: "cube", roughness: 0.2 });
    removeProp("prop-1")(doc);
    expect(doc.props.map((p) => p.id)).toEqual(["prop-2"]);
  });
});

/** Every triangle's winding agrees with its corner normals, so faces point out. */
function windsOutward(g: PropGeometry): boolean {
  for (let t = 0; t < g.index.length; t += 3) {
    const p = [0, 1, 2].map((k) => Array.from(g.positions.subarray(g.index[t + k] * 3, g.index[t + k] * 3 + 3)));
    const n = Array.from(g.normals.subarray(g.index[t] * 3, g.index[t] * 3 + 3));
    const u = p[1].map((v, i) => v - p[0][i]), w = p[2].map((v, i) => v - p[0][i]);
    const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] <= 0) return false;
  }
  return true;
}

describe("geometry", () => {
  test("primitives are Blender's, 1 m across, with outward windings and unit normals", () => {
    for (const [shape, segments] of [["cube", 0], ["plane", 0], ["cylinder", 8], ["cylinder", 32], ["sphere", 8], ["sphere", 32]] as const) {
      const g = primitiveGeometry(shape, segments);
      expect(windsOutward(g), `${shape} ${segments}`).toBe(true);
      for (let i = 0; i < g.normals.length; i += 3) expect(Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2])).toBeCloseTo(1, 5);
      expect([...g.bounds.max]).toEqual(shape === "plane" ? [0.5, 0.5, 0] : [0.5, 0.5, 0.5]);
    }
  });

  test("a primitive is built once and shared", () => {
    expect(primitiveGeometry("cylinder", 32)).toBe(primitiveGeometry("cylinder", 32));
    expect(primitiveGeometry("cube", 3)).toBe(primitiveGeometry("cube", 64));
  });

  test("curved sides turn smooth above 12 segments", () => {
    const radial = (g: PropGeometry) => {
      // A side corner's normal is radial when smooth, so it points straight at its own position in XY.
      let worst = 0;
      for (let i = 0; i < g.positions.length; i += 3) {
        if (Math.abs(g.normals[i + 2]) > 0.5) continue;
        const a = Math.atan2(g.positions[i + 1], g.positions[i]), b = Math.atan2(g.normals[i + 1], g.normals[i]);
        worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
      }
      return worst;
    };
    expect(radial(primitiveGeometry("cylinder", 16))).toBeLessThan(1e-6);
    expect(radial(primitiveGeometry("cylinder", 8))).toBeGreaterThan(0.3);
  });

  test("an STL reads in millimetres and stands on the middle of its base", () => {
    const soup = Float32Array.of(10, 20, 5, 30, 20, 5, 10, 60, 105);
    const g = stlPropGeometry(soup);
    expect([...g.bounds.min].map((v) => +v.toFixed(6))).toEqual([-0.01, -0.02, 0]);
    expect([...g.bounds.max].map((v) => +v.toFixed(6))).toEqual([0.01, 0.02, 0.1]);
    expect(windsOutward(g)).toBe(true);
    expect(() => stlPropGeometry(new Float32Array(0))).toThrow(/no triangles/);
  });
});

describe("the scene section", () => {
  test("Blender's object matrix: translate, then Rz Ry Rx, then scale times size", () => {
    const mat = propMatrix({ location: [1, 2, 3] as never, rotationDeg: [90, 0, 90] as never, scale: [2, 1, 1], size: [1, 3, 1] as never });
    // X scaled by 2 turns by Rz 90 to +Y; Y scaled by 3 turns by Rx 90 to +Z, then Rz leaves it.
    const x = transformPoint(mat, [1, 0, 0]), y = transformPoint(mat, [0, 1, 0]);
    [1, 4, 3].forEach((v, i) => expect(x[i]).toBeCloseTo(v, 12));
    [1, 2, 6].forEach((v, i) => expect(y[i]).toBeCloseTo(v, 12));
  });

  test("props switched off, or whose mesh is not loaded, are left out", () => {
    const doc = withProps(addProp("cube"), addProp("sphere", { on: false }), addProp("mesh", { mesh: "mesh-deadbeef" }));
    expect(compileScene(doc, null, 1).props.map((p) => p.id)).toEqual(["prop-1"]);
    const g = stlPropGeometry(Float32Array.of(0, 0, 0, 10, 0, 0, 0, 10, 0));
    expect(compileScene(doc, null, 1, undefined, new Map([["mesh-deadbeef", g]])).props.map((p) => p.id)).toEqual(["prop-1", "prop-3"]);
  });

  test("an unchanged prop keeps its identity, and so does the section", () => {
    const doc = withProps(addProp("cube"), addProp("cylinder"));
    const first = compileScene(doc, null, 1);
    const same = compileScene(structuredClone(doc), null, 2, first);
    expect(same.props).toBe(first.props);
    const moved = structuredClone(doc);
    patchProp("prop-2", { location: [0.1, 0, 0] as never })(moved);
    const next = compileScene(moved, null, 3, first);
    expect(next.props).not.toBe(first.props);
    expect(next.props[0]).toBe(first.props[0]);
    expect(next.props[1].geometry).toBe(first.props[1].geometry);
    expect(next.lights).toBe(first.lights);
    expect(next.backdrop).toBe(first.backdrop);
  });

  test("world bounds follow the matrix", () => {
    const doc = withProps(addProp("cube", { size: [0.1, 0.2, 0.3] as never, location: [0, 0, 0.15] as never }));
    const b = propWorldBounds(compileScene(doc, null, 1).props[0]);
    expect([...b.min].map((v) => +v.toFixed(9))).toEqual([-0.05, -0.1, 0]);
    expect([...b.max].map((v) => +v.toFixed(9))).toEqual([0.05, 0.1, 0.3]);
  });

  test("the scene file carries props' arrays as buffers", () => {
    const file = exportScene(compileScene(withProps(addProp("cube")), null, 1));
    expect([...file.buffers.keys()]).toEqual(expect.arrayContaining(["props.0.geometry.positions", "props.0.geometry.normals", "props.0.geometry.index"]));
    expect(JSON.parse(file.json).props[0]).toMatchObject({ id: "prop-1", albedo: [0.6, 0.6, 0.6], roughness: 0.5 });
  });
});

describe("Booth's prop meshes", () => {
  const print: PrintPort = { open: () => Promise.reject(new Error("no")), reslice: () => Promise.reject(new Error("no")), dispose: () => {} };
  const booth = () => {
    const store = new Map<string, string>();
    return new Booth({
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
      print, takePhoto: () => { throw new Error("no photos"); }, schedule: () => () => {},
    });
  };
  const stl = (z: number): ArrayBuffer => {
    const bytes = new ArrayBuffer(84 + 50);
    const v = new DataView(bytes);
    v.setUint32(80, 1, true);
    [0, 0, 0, 10, 0, 0, 0, 10, z].forEach((x, i) => v.setFloat32(84 + 12 + 4 * i, x, true));
    return bytes;
  };

  test("an id is the file's hash: the same bytes give the same id, other bytes another", () => {
    const b = booth();
    const a = b.addPropMesh("a.stl", stl(0));
    expect(b.addPropMesh("again.stl", stl(0))).toBe(a);
    expect(b.addPropMesh("c.stl", stl(5))).not.toBe(a);
    expect(b.propMesh(a)).toMatchObject({ name: "a.stl" });
    expect(b.propMesh("mesh-00000000")).toBeNull();
  });

  test("a saved prop comes back when its file is imported again, and subscribers hear of it", () => {
    const b = booth();
    const id = b.addPropMesh("battery.stl", stl(7));
    b.update(addProp("mesh", { mesh: id }));
    const reloaded = booth();
    reloaded.importJson(b.exportJson());
    expect(reloaded.scene.props).toEqual([]);
    let heard = 0;
    reloaded.subscribe(() => { heard += 1; });
    expect(reloaded.addPropMesh("battery.stl", stl(7))).toBe(id);
    expect(reloaded.scene.props.map((p) => p.id)).toEqual(["prop-1"]);
    expect(heard).toBe(1);
    reloaded.addPropMesh("battery.stl", stl(7));
    expect(heard).toBe(1);
  });

  test("a prop naming a mesh appears once the mesh is there, in one update", () => {
    const b = booth();
    const id = b.addPropMesh("battery.stl", stl(3));
    b.update(addProp("mesh", { mesh: id }));
    expect(b.scene.props).toHaveLength(1);
    expect(b.scene.props[0].geometry.positions.length).toBe(9);
  });
});
