import { describe, expect, test } from "vitest";
import { FILAMENT_PRESET_IDS, LOOK_IDS, defaultDocument, m } from "../src/document";
import { ASPECT_PRESETS, FILAMENT_PRESETS, FOCAL_PRESETS_MM, LOOK_PRESETS } from "../src/presets";
import { resolveMaterial, solveLight } from "../src/scene";
import type { BeadMesh, SlicedPrint } from "../src/print";

// The old viewer's RIGS (lekv2-photoreal-ref/web/index.html:426-452), Blender
// frame, metres, every light aimed at C = (0, 0, 0.09). Written out here as the
// independent reference the transcribed looks are held to. render.py's studio()
// agrees for light, dark and raking; gradient and rim are web-only.
type Original =
  | { kind: "area"; size: [number, number]; pos: [number, number, number]; watts: number; spread?: number }
  | { kind: "scrim"; size: [number, number]; pos: [number, number, number]; top: number; bottom: number };
const area = (size: [number, number], pos: [number, number, number], watts: number, spread?: number): Original => ({ kind: "area", size, pos, watts, spread });
const scrim = (size: [number, number], pos: [number, number, number], top: number, bottom: number): Original => ({ kind: "scrim", size, pos, top, bottom });

const RIGS: Record<(typeof LOOK_IDS)[number], {
  backdrop: [number, number]; world: [number, number]; floor?: [number, number, number]; partOnly?: number[]; lights: Original[];
}> = {
  studio: { backdrop: [0.55, 0.55], world: [0.25, 30], lights: [
    area([1.2, 0.9], [0, -0.1, 1.0], 500), scrim([1.4, 1.8], [0.85, 0.32, 0.45], 3.0, 0.15),
    area([0.3, 1.2], [-0.75, -0.25, 0.4], 160), area([0.1, 1.2], [-0.45, 0.6, 0.45], 160),
    area([2.0, 0.8], [0, -2.2, 0.55], 120)] },
  dark: { backdrop: [0.012, 0.32], world: [0.02, 30], partOnly: [1, 2, 3, 4], lights: [
    area([1.0, 0.6], [0, 0.35, 1.0], 120, 60), area([0.08, 1.0], [-0.3, 0.85, 0.35], 220, 40),
    area([0.08, 1.0], [0.3, 0.85, 0.35], 220, 40), scrim([1.4, 1.8], [0.85, 0.32, 0.4], 3.5, 0.03),
    scrim([1.2, 1.6], [-0.85, 0.6, 0.45], 2.0, 0.0)] },
  raking: { backdrop: [0.35, 0.6], world: [0.12, 120], lights: [
    area([0.15, 1.2], [-0.9, 0.05, 0.12], 260, 40), area([1.0, 0.8], [0, -0.2, 1.1], 200),
    area([0.12, 1.2], [0.6, 0.45, 0.4], 120)] },
  gradient: { backdrop: [0.35, 0.6], world: [0.03, 30], floor: [3.5, 0.05, -90], lights: [
    area([1.4, 1.4], [0, 0, 1.1], 400), scrim([2.0, 1.6], [-1.0, 0, 0.35], 6.0, 0.6),
    scrim([2.0, 1.6], [0, -1.0, 0.35], 2.0, 0.2), scrim([2.0, 1.6], [1.0, 0, 0.35], 0.35, 0.03),
    scrim([2.0, 1.6], [0, 1.0, 0.35], 3.0, 0.3)] },
  rim: { backdrop: [0.02, 0.35], world: [0.01, 30], floor: [0.8, 0, -90], lights: [
    area([1.4, 0.3], [0, 0.45, 1.0], 500), area([0.1, 1.4], [-0.55, 0.75, 0.45], 270),
    area([0.1, 1.4], [0.55, 0.75, 0.45], 270), scrim([0.8, 1.6], [-1.0, 0, 0.35], 1.8, 0.15),
    scrim([0.8, 1.6], [1.0, 0, 0.35], 0.9, 0.08)] },
};

const AIM = [m(0), m(0), m(0.09)] as const;

describe.each(LOOK_IDS)("the %s look", (id) => {
  const rig = RIGS[id];
  const { studio } = LOOK_PRESETS[id];
  const emitters = studio.lights.map((l) => solveLight(l, AIM));

  test("has the old rig's lights, each centred within 1 mm of where the rig put it", () => {
    expect(emitters).toHaveLength(rig.lights.length);
    rig.lights.forEach((o, i) => {
      expect(emitters[i].kind).toBe(o.kind);
      const miss = Math.hypot(...emitters[i].centre.map((c, k) => c - o.pos[k]));
      expect(miss, `light ${i} is ${(miss * 1000).toFixed(3)} mm off`).toBeLessThan(1e-3);
    });
  });

  test("gives each light the old size, in true watts (the old watts over 40) or the old scrim radiance", () => {
    rig.lights.forEach((o, i) => {
      const e = emitters[i];
      expect([...e.sizeM]).toEqual(o.size);
      if (o.kind === "area" && e.kind === "area") {
        expect(e.powerW).toBeCloseTo(o.watts / 40, 12);
        expect(e.spreadRad).toBeCloseTo(((o.spread ?? 180) * Math.PI) / 180, 12);
      } else if (o.kind === "scrim" && e.kind === "scrim") {
        expect([e.topRadiance, e.bottomRadiance]).toEqual([o.top, o.bottom]);
      } else {
        throw new Error(`light ${i} changed kind`);
      }
    });
  });

  test("links to the part only the lights render.py links", () => {
    expect(emitters.flatMap((e, i) => (e.partOnly ? [i] : []))).toEqual(rig.partOnly ?? []);
  });

  test("keeps the old backdrop, world and floor cards", () => {
    expect([studio.backdrop.color[0], studio.backdrop.roughness]).toEqual(rig.backdrop);
    expect(studio.backdrop.color[1]).toBe(studio.backdrop.color[0]);
    expect([studio.world.strength, studio.world.rotationDeg]).toEqual(rig.world);
    if (rig.floor) expect(studio.floorCards).toEqual({ keySide: rig.floor[0], farSide: rig.floor[1], azimuth: rig.floor[2] });
    else expect(studio.floorCards).toBeNull();
  });

  test("lights every card at the part, none behind the floor", () => {
    for (const e of emitters) {
      const toAim = [AIM[0] - e.centre[0], AIM[1] - e.centre[1], AIM[2] - e.centre[2]];
      const len = Math.hypot(...toAim);
      expect(e.normal.map((v, k) => v - toAim[k] / len).every((d) => Math.abs(d) < 1e-9)).toBe(true);
      expect(e.centre[2]).toBeGreaterThan(0);
    }
  });
});

describe("filament presets", () => {
  const mesh: BeadMesh = {
    position: new Float32Array(3), normal: new Int16Array(3), tangent: new Int16Array(3), word: new Float32Array(1),
    index: new Uint32Array(3), tris: 0, layerCount: 3, layerHeightM: 2e-4, vRefMmS: 100, bboxM: { min: [0, 0, 0], max: [0.01, 0.01, 0.01] },
  };
  const sliced: SlicedPrint = {
    settings: defaultDocument().slicing, settingsSource: "booth", layerHeightMm: defaultDocument().slicing.layerHeight,
    layerTimeS: new Float32Array(0), layerFan: new Float32Array(0), filamentName: null, bedFromFile: null, note: null,
  };
  const albedoOf = (id: (typeof FILAMENT_PRESET_IDS)[number]) =>
    resolveMaterial({ ...defaultDocument().filament, recipe: FILAMENT_PRESETS[id].recipe }, mesh, sliced).baseColor[0];

  test("PETG Basic carries the calibrated glossy finish and anisotropy from render.py", () => {
    const r = FILAMENT_PRESETS["petg-basic"].recipe;
    expect(r).toMatchObject({ ior: 1.57, anisotropy: 0.25, vary: 1.0, peiRough: 0.42, peiFarRough: 0.55 });
    expect(r.roughness).toEqual({ 0: 0.21, 1: 0.24, 2: 0.36, 3: 0.5 });
    expect(albedoOf("petg-basic")).toBeCloseTo(0.012, 3);
  });

  test("PLA Matte carries the calibrated matte finish and anisotropy from render.py", () => {
    const r = FILAMENT_PRESETS["pla-matte"].recipe;
    expect(r).toMatchObject({ ior: 1.46, anisotropy: 0.1, vary: 0.5, peiRough: 0.66, peiFarRough: 0.74 });
    expect(r.roughness).toEqual({ 0: 0.74, 1: 0.62, 2: 0.8, 3: 0.85 });
    expect(albedoOf("pla-matte")).toBeCloseTo(0.022, 3);
  });

  test("every preset id has an entry, with every roughness a valid 0..1 value", () => {
    for (const id of FILAMENT_PRESET_IDS) {
      expect(FILAMENT_PRESETS[id].label).not.toBe("");
      for (const v of Object.values(FILAMENT_PRESETS[id].recipe.roughness)) expect(v).toBeGreaterThan(0), expect(v).toBeLessThan(1);
    }
  });

  test("the lists panels draw from are not empty", () => {
    expect(FOCAL_PRESETS_MM).toContain(85);
    expect(ASPECT_PRESETS.map((a) => a.label)).toContain("4:5");
  });
});
