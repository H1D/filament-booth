import { describe, expect, test } from "vitest";
import { defaultDocument } from "../src/document";
import { applyLook } from "../src/edits";
import { compileScene, type AreaEmitter, type Emitter } from "../src/scene";
import { areaRadiance, emitterArea, keyConeRad, keyEmitter, keyIntensity, meanRadiance, rectStandIn } from "../src/viewport/radiance";

function emitters(look: Parameters<typeof applyLook>[0]): readonly Emitter[] {
  const doc = defaultDocument();
  applyLook(look)(doc);
  return compileScene(doc, null, 0).lights.emitters;
}
const byId = (list: readonly Emitter[], id: string): Emitter => {
  const e = list.find((x) => x.id === id);
  if (!e) throw new Error(`no ${id}`);
  return e;
};
const area = (e: Emitter): AreaEmitter => {
  if (e.kind !== "area") throw new Error(`${e.id} is a scrim`);
  return e;
};

describe("baked radiance", () => {
  test("studio top softbox: 500 room watts / 40 over 1.2 x 0.9 m, full spread", () => {
    // 12.5 W / (pi * 1.08 m^2) = 3.68414 W / m^2 / sr.
    expect(areaRadiance(area(byId(emitters("studio"), "top")))).toBeCloseTo(3.68414, 5);
  });

  test("dark top softbox: 120 room watts over 1.0 x 0.6 m at 60 degrees spread is boosted by 1 / sin^2(30 deg) = 4", () => {
    // 3 W / (pi * 0.6) = 1.59155; / 0.25 = 6.36620.
    expect(areaRadiance(area(byId(emitters("dark"), "top")))).toBeCloseTo(6.3662, 4);
  });

  test("an ellipse has the area of the ellipse inscribed in its box, and its rectangle stand-in keeps that area", () => {
    const e = { sizeM: [0.4, 0.2] as const, shape: "ellipse" as const };
    expect(emitterArea(e)).toBeCloseTo((Math.PI * 0.4 * 0.2) / 4, 12);
    const [w, h] = rectStandIn(e);
    expect(w * h).toBeCloseTo(emitterArea(e), 12);
    expect(w / h).toBeCloseTo(2, 12);
  });

  test("a scrim lights the sweep at its gradient's midpoint", () => {
    expect(meanRadiance(byId(emitters("studio"), "right"))).toBeCloseTo((3.0 + 0.15) / 2, 12);
  });
});

describe("the live key", () => {
  test("is the most powerful area light that reaches the backdrop", () => {
    expect(keyEmitter(emitters("studio"))?.id).toBe("top");
    // The dark look's rims carry more power but are partOnly.
    expect(keyEmitter(emitters("dark"))?.id).toBe("top");
    expect(keyEmitter(emitters("raking"))?.id).toBe("rake");
    expect(keyEmitter(emitters("gradient").filter((e) => e.kind === "scrim"))).toBeNull();
  });

  test("as a spot light its intensity is L A: P / pi at full spread, so irradiance on axis is P / (pi d^2)", () => {
    const top = area(byId(emitters("studio"), "top"));
    expect(keyIntensity(top)).toBeCloseTo(12.5 / Math.PI, 12);
    expect(keyConeRad(top)).toBeCloseTo(Math.PI / 2, 12);
    // 3 W at 60 degrees spread: P / (pi sin^2(30 deg)) = 3.81972 W/sr, inside a 30 degree half-angle cone.
    const dark = area(byId(emitters("dark"), "top"));
    expect(keyIntensity(dark)).toBeCloseTo(3.81972, 5);
    expect(keyConeRad(dark)).toBeCloseTo(Math.PI / 6, 12);
  });
});
