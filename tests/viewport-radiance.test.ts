import { describe, expect, test } from "vitest";
import { defaultDocument, m, type Vec3 } from "../src/document";
import { applyLook } from "../src/edits";
import { compileScene, type AreaEmitter, type Emitter } from "../src/scene";
import { areaRadiance, emitterArea, keyEmitter, keyIrradiance, meanRadiance, rectStandIn } from "../src/viewport/radiance";

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

  test("on axis its irradiance is P / (pi d^2), falling with the cosine at the card", () => {
    const v = (x: number, y: number, z: number): Vec3 => [m(x), m(y), m(z)];
    const base: AreaEmitter = {
      kind: "area", id: "k", centre: v(0, 0, 2), xAxis: v(1, 0, 0), yAxis: v(0, 1, 0),
      normal: v(0, 0, -1), sizeM: [1, 1], shape: "rect", color: [1, 1, 1], partOnly: false, powerW: 10, spreadRad: Math.PI,
    };
    expect(keyIrradiance(base, [0, 0, 0])).toBeCloseTo(10 / (Math.PI * 4), 12);
    const tilted = { ...base, normal: v(0, Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3)) };
    expect(keyIrradiance(tilted, [0, 0, 0])).toBeCloseTo(10 / (Math.PI * 4) / 2, 12);
  });
});
