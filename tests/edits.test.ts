import { describe, expect, test } from "vitest";
import { DEFAULT_GLOSS, defaultDocument, deg, m, parseDocument, watts, type BoothDocument, type StudioLight } from "../src/document";
import {
  addLight, applyFilamentPreset, applyLook, applyOpticsPreset, focusAt, patchLight, removeLight, setFocal, type Edit,
} from "../src/edits";
import { FILAMENT_PRESETS, LOOK_PRESETS, OPTICS_PRESETS } from "../src/presets";
import { compileScene } from "../src/scene";

/** Applies an edit to a fresh default document and returns what the boundary accepts. */
function applied(edit: Edit, from: BoothDocument = defaultDocument()): BoothDocument {
  const draft = structuredClone(from);
  edit(draft);
  return parseDocument(draft);
}

const centre = (l: StudioLight): [number, number, number] => {
  const az = (l.azimuth * Math.PI) / 180, el = (l.elevation * Math.PI) / 180;
  return [l.distance * Math.sin(az) * Math.cos(el), -l.distance * Math.cos(az) * Math.cos(el), l.distance * Math.sin(el)];
};

describe("applyLook", () => {
  test("replaces the whole studio with the look and records it", () => {
    const doc = applied(applyLook("dark"));
    expect(doc.studio).toEqual(LOOK_PRESETS.dark.studio);
    expect(doc.lookBase).toBe("dark");
  });

  test("leaves the document's other sections alone", () => {
    const before = defaultDocument();
    const after = applied(applyLook("rim"), before);
    expect(after.camera).toEqual(before.camera);
    expect(after.filament).toEqual(before.filament);
  });

  test("the applied studio is a copy: editing it does not reach the preset", () => {
    const draft = defaultDocument();
    applyLook("dark")(draft);
    draft.studio.lights[0].name = "renamed";
    expect(LOOK_PRESETS.dark.studio.lights[0].name).toBe("Top softbox");
  });
});

describe("applyFilamentPreset", () => {
  test("copies the recipe and the neutral gloss, keeping imperfections and bed", () => {
    const before = defaultDocument();
    before.filament.gloss = 0.9;
    before.filament.bed = "smooth";
    before.filament.imperfections.heatGloss = 0.1;
    const after = applied(applyFilamentPreset("pla-matte"), before);
    expect(after.filament.presetId).toBe("pla-matte");
    expect(after.filament.recipe).toEqual(FILAMENT_PRESETS["pla-matte"].recipe);
    expect(after.filament.gloss).toBe(DEFAULT_GLOSS);
    expect(after.filament.bed).toBe("smooth");
    expect(after.filament.imperfections.heatGloss).toBe(0.1);
  });
});

describe("applyOpticsPreset", () => {
  test("copies the profile into output.optics without mutating the preset", () => {
    const draft = defaultDocument();
    applyOpticsPreset("studio-dslr")(draft);
    expect(draft.output.optics).toEqual(OPTICS_PRESETS["studio-dslr"].optics);
    draft.output.optics.grain = 0.99;
    expect(OPTICS_PRESETS["studio-dslr"].optics.grain).toBeLessThan(0.5);
  });
});

describe("setFocal", () => {
  const framedWidthM = (doc: BoothDocument): number => {
    const { camera } = compileScene(doc, null, 0);
    return (Math.hypot(...camera.position.map((p, i) => p - camera.target[i])) * camera.sensorMm) / camera.focalMm;
  };

  test("keeps the framed width of the subject within 1 percent across every focal preset", () => {
    const base = defaultDocument();
    const reference = framedWidthM(base);
    for (const focal of [24, 35, 50, 100, 135, 200]) {
      const doc = applied(setFocal(focal), base);
      expect(doc.camera.focalMm).toBe(focal);
      expect(Math.abs(framedWidthM(doc) / reference - 1)).toBeLessThan(0.01);
    }
  });

  test("keeps the camera on the same line of sight", () => {
    const doc = applied(setFocal(35));
    expect(doc.camera.azimuth).toBe(defaultDocument().camera.azimuth);
    expect(doc.camera.target).toEqual(defaultDocument().camera.target);
  });

  test("a focal length outside the camera's range is rejected at the boundary", () => {
    expect(() => applied(setFocal(2))).toThrow(/focalMm/);
  });
});

describe("focusAt", () => {
  test("stores a copy of the part-local point, and null clears it", () => {
    const point = [m(0.01), m(0.02), m(0.03)] as const;
    const focused = applied(focusAt(point));
    expect(focused.camera.focusPartPoint).toEqual([0.01, 0.02, 0.03]);
    expect(focused.camera.focusPartPoint).not.toBe(point);
    expect(applied(focusAt(null), focused).camera.focusPartPoint).toBeNull();
  });
});

describe("addLight", () => {
  test.each(["area", "scrim"] as const)("adds a valid %s with a fresh id", (kind) => {
    const before = defaultDocument();
    const after = applied(addLight(kind), before);
    expect(after.studio.lights).toHaveLength(before.studio.lights.length + 1);
    const added = after.studio.lights[after.studio.lights.length - 1];
    expect(added.kind).toBe(kind);
    expect(before.studio.lights.map((l) => l.id)).not.toContain(added.id);
    expect(added.on).toBe(true);
  });

  test("repeated adds get unique ids and distinct places", () => {
    let doc = defaultDocument();
    for (let i = 0; i < 20; i++) doc = applied(addLight(i % 2 === 0 ? "area" : "scrim"), doc);
    const lights = doc.studio.lights;
    expect(new Set(lights.map((l) => l.id)).size).toBe(lights.length);
    for (const [i, a] of lights.entries()) {
      for (const b of lights.slice(i + 1)) {
        const [ax, ay, az] = centre(a), [bx, by, bz] = centre(b);
        expect(Math.hypot(ax - bx, ay - by, az - bz), `${a.id} vs ${b.id}`).toBeGreaterThan(0.1);
      }
    }
  });

  test("does not sit on a light that already occupies the first spot", () => {
    const first = applied(addLight("area"), { ...defaultDocument(), studio: { ...defaultDocument().studio, lights: [] } });
    const spot = first.studio.lights[0];
    const second = applied(addLight("area"), first).studio.lights[1];
    expect([second.azimuth, second.elevation]).not.toEqual([spot.azimuth, spot.elevation]);
  });

  test("a removed id is free to reuse", () => {
    const one = applied(addLight("area"));
    const added = one.studio.lights[one.studio.lights.length - 1].id;
    const again = applied(addLight("area"), applied(removeLight(added), one));
    expect(again.studio.lights.map((l) => l.id).filter((id) => id === added)).toHaveLength(1);
  });
});

describe("removeLight", () => {
  test("removes the light by id", () => {
    const doc = applied(removeLight("top"));
    expect(doc.studio.lights.map((l) => l.id)).not.toContain("top");
    expect(doc.studio.lights).toHaveLength(defaultDocument().studio.lights.length - 1);
  });

  test("an unknown id changes nothing", () => {
    expect(applied(removeLight("nope"))).toEqual(defaultDocument());
  });
});

describe("patchLight", () => {
  const light = (doc: BoothDocument, id: string): StudioLight => {
    const found = doc.studio.lights.find((l) => l.id === id);
    if (!found) throw new Error(`no light ${id}`);
    return found;
  };

  test("patches fields of the named light only", () => {
    const before = defaultDocument();
    const after = applied(patchLight("left", { on: false, azimuth: deg(-45) }), before);
    expect(light(after, "left")).toMatchObject({ on: false, azimuth: -45 });
    expect(light(after, "top")).toEqual(light(before, "top"));
  });

  test("reaches the fields only one kind has", () => {
    const after = applied(patchLight("top", { powerW: watts(9) }));
    expect(light(after, "top")).toMatchObject({ kind: "area", powerW: 9 });
    const scrim = applied(patchLight("right", { topRadiance: 7 }));
    expect(light(scrim, "right")).toMatchObject({ kind: "scrim", topRadiance: 7 });
  });

  test("cannot change id or kind, even when the patch carries them", () => {
    const before = defaultDocument();
    const original = light(before, "right");
    const hostile = Object.assign({}, { id: "other", kind: "area", on: false });
    const after = applied(patchLight("right", hostile), before);
    expect(light(after, "right")).toMatchObject({ id: "right", kind: "scrim", on: false });
    expect(original.kind).toBe("scrim");
  });

  test("a patch spread from a whole light is accepted", () => {
    const before = defaultDocument();
    const whole = light(before, "left");
    const after = applied(patchLight("left", { ...whole, name: "Strip" }), before);
    expect(light(after, "left")).toEqual({ ...whole, name: "Strip" });
  });

  test("a light that is gone changes nothing", () => {
    expect(applied(patchLight("nope", { on: false }))).toEqual(defaultDocument());
  });

  test("an invalid patch is rejected at the boundary with the field path", () => {
    expect(() => applied(patchLight("top", { distance: m(-1) }))).toThrow(/studio\.lights\[0\]\.distance/);
  });
});
