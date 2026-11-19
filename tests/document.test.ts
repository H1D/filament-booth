import { expect, test } from "vitest";
import { DocumentError, LOOK_IDS, defaultDocument, parseDocument } from "../src/document";
import { LOOK_PRESETS } from "../src/presets";

const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

type Key = string | number;
const isContainer = (v: unknown): v is Record<Key, unknown> => typeof v === "object" && v !== null;

/** Sets (or, for `undefined`, removes) the field at `path` inside saved JSON. */
function edit(json: unknown, path: readonly Key[], value: unknown): void {
  let node = json;
  for (const key of path.slice(0, -1)) {
    if (!isContainer(node)) throw new Error(`no ${String(key)} to descend into`);
    node = node[key];
  }
  const last = path[path.length - 1];
  if (!isContainer(node)) throw new Error(`no parent for ${String(last)}`);
  if (value === undefined) delete node[last];
  else node[last] = value;
}

function rejectionOf(path: readonly Key[], value: unknown): DocumentError {
  const saved = roundTrip(defaultDocument());
  edit(saved, path, value);
  try {
    parseDocument(saved);
  } catch (e) {
    if (e instanceof DocumentError) return e;
    throw e;
  }
  throw new Error(`${path.join(".")} = ${JSON.stringify(value)} was accepted`);
}

test("the default document is PETG Basic under the studio look, 4:5 at 2000 px and 256 samples", () => {
  const d = defaultDocument();
  expect(d.filament.presetId).toBe("petg-basic");
  expect(d.lookBase).toBe("studio");
  expect(d.studio.lights.length).toBeGreaterThan(0);
  expect(d.output).toMatchObject({ aspect: { w: 4, h: 5 }, longEdgePx: 2000, samples: 256 });
});

test("a document survives JSON and parseDocument unchanged", () => {
  const d = defaultDocument();
  expect(parseDocument(roundTrip(d))).toEqual(d);
});

test("a document holding any look parses back unchanged", () => {
  for (const id of LOOK_IDS) {
    const d = { ...defaultDocument(), studio: structuredClone(LOOK_PRESETS[id].studio), lookBase: id };
    expect(parseDocument(roundTrip(d))).toEqual(d);
  }
});

test("two default documents share no mutable state", () => {
  const a = defaultDocument();
  const b = defaultDocument();
  a.studio.lights[0].on = false;
  a.filament.recipe.roughness[0] = 0.9;
  expect(b.studio.lights[0].on).toBe(true);
  expect(b.filament.recipe.roughness[0]).toBe(0.21);
});

test("a bad value is rejected with the path to the field", () => {
  const e = rejectionOf(["camera", "focalMm"], -3);
  expect(e.path).toBe("camera.focalMm");
  expect(e.message).toContain("camera.focalMm");
});

test("the path reaches into arrays and nested objects", () => {
  const e = rejectionOf(["studio", "lights", 2, "color"], { kind: "kelvin", kelvin: "warm" });
  expect(e.path).toBe("studio.lights[2].color.kelvin");
});

test("a wrong enum names the field and lists the choices", () => {
  const e = rejectionOf(["pose", "restFace"], "sideways");
  expect(e.path).toBe("pose.restFace");
  expect(e.message).toContain("plate");
});

test("a missing field or a null where an object is needed is rejected", () => {
  expect(rejectionOf(["output"], undefined).path).toBe("output");
  expect(rejectionOf(["filament"], null).path).toBe("filament");
  expect(rejectionOf(["filament", "gloss"], undefined).path).toBe("filament.gloss");
});

test("roughness keys are exhaustive", () => {
  expect(rejectionOf(["filament", "recipe", "roughness", "2"], undefined).path).toBe("filament.recipe.roughness[2]");
});

test("non-integers and out-of-range values are rejected", () => {
  expect(rejectionOf(["output", "longEdgePx"], 1.5).path).toBe("output.longEdgePx");
  expect(rejectionOf(["output", "samples"], 0).path).toBe("output.samples");
  expect(rejectionOf(["studio", "backdrop", "roughness"], 2).path).toBe("studio.backdrop.roughness");
  expect(rejectionOf(["slicing", "layerHeight"], 0).path).toBe("slicing.layerHeight");
});

test("a number that JSON would have turned into null is rejected", () => {
  expect(rejectionOf(["camera", "distance"], null).path).toBe("camera.distance");
});

test("duplicate light ids are rejected", () => {
  const e = rejectionOf(["studio", "lights", 1, "id"], defaultDocument().studio.lights[0].id);
  expect(e.path).toBe("studio.lights[1].id");
});

test("an unknown version and a non-object are rejected", () => {
  expect(rejectionOf(["version"], 2).path).toBe("version");
  expect(() => parseDocument("nope")).toThrow(DocumentError);
  expect(() => parseDocument(null)).toThrow(/document/);
});

test("unknown fields are dropped rather than carried into the document", () => {
  const saved = roundTrip(defaultDocument());
  edit(saved, ["extra"], 1);
  edit(saved, ["camera", "extra"], 1);
  const parsed = parseDocument(saved);
  expect(parsed).not.toHaveProperty("extra");
  expect(parsed.camera).not.toHaveProperty("extra");
});
