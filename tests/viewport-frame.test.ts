import { describe, expect, test } from "vitest";
import { deg, defaultDocument, m, type CameraSetup } from "../src/document";
import { compileScene, solveCamera } from "../src/scene";
import {
  BLENDER_TO_VIEWER, canvasFovY, cardMatrix, cropRect, fromViewer, lightMatrix, orbitOf, orbitPosition, sameOrbit, toViewer,
  type V3,
} from "../src/viewport/frame";

const apply = (mat: readonly number[], v: V3): number[] =>
  [0, 1, 2].map((r) => mat[r] * v[0] + mat[4 + r] * v[1] + mat[8 + r] * v[2] + mat[12 + r]);

const cameras: CameraSetup[] = [];
for (const az of [-179, -90, -30, 0, 45, 135, 180]) {
  for (const el of [-60, -5, 0, 22, 58, 89]) {
    cameras.push({ ...defaultDocument().camera, azimuth: deg(az), elevation: deg(el), distance: m(0.25 + Math.abs(az) / 300), target: [m(0.01), m(-0.02), m(0.088)] });
  }
}

describe("axes", () => {
  test("BLENDER_TO_VIEWER sends Blender (x, y, z) to three.js (x, z, -y), as toViewer does", () => {
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -2, 5]] as V3[]) {
      expect(apply(BLENDER_TO_VIEWER, v)).toEqual(toViewer(v).map((x) => x + 0));
      expect(fromViewer(toViewer(v))).toEqual([...v]);
    }
  });

  test("card and light frames are right-handed and face the subject", () => {
    const e = compileScene(defaultDocument(), null, 0).lights.emitters[2];
    const det = (a: readonly number[]) =>
      a[0] * (a[5] * a[10] - a[9] * a[6]) - a[4] * (a[1] * a[10] - a[9] * a[2]) + a[8] * (a[1] * a[6] - a[5] * a[2]);
    const card = cardMatrix(e, 2, 3), light = lightMatrix(e);
    expect(det(card)).toBeCloseTo(6, 12);
    expect(det(light)).toBeCloseTo(1, 12);
    expect(card.slice(8, 11)).toEqual([...e.normal]);
    expect(light.slice(8, 11).map((x) => -x)).toEqual([...e.normal].map((x) => x + 0));
    expect(light.slice(12, 15)).toEqual([...e.centre]);
  });
});

describe("orbit numbers", () => {
  test("orbitOf inverts solveCamera's placement", () => {
    for (const cam of cameras) {
      const s = solveCamera(cam, null, 1600, 2000);
      const o = orbitOf(s.position, s.target);
      expect(o.distance).toBeCloseTo(cam.distance, 12);
      expect(o.elevation).toBeCloseTo(cam.elevation, 9);
      if (Math.abs(cam.elevation) < 89) expect(((o.azimuth - cam.azimuth + 540) % 360) - 180).toBeCloseTo(0, 9);
      expect(o.target).toEqual(cam.target);
    }
  });

  test("an edit reported and shown again lands on the same camera", () => {
    for (const cam of cameras) {
      const shown = solveCamera(cam, null, 1600, 2000);
      const reported = orbitOf(shown.position, shown.target);
      const again = solveCamera({ ...cam, ...reported }, null, 1600, 2000);
      expect(sameOrbit(orbitOf(again.position, again.target), reported)).toBe(true);
      for (let i = 0; i < 3; i++) expect(Math.abs(again.position[i] - shown.position[i])).toBeLessThan(1e-12);
    }
  });

  test("orbitPosition is scene.ts's placement, and sameOrbit treats 180 and -180 degrees as one camera", () => {
    const s = solveCamera(cameras[10], null, 1600, 2000);
    const o = orbitOf(s.position, s.target);
    orbitPosition(o).forEach((x, i) => expect(x).toBeCloseTo(s.position[i], 12));
    const a = { ...o, azimuth: deg(180) }, b = { ...o, azimuth: deg(-180) };
    expect(sameOrbit(a, b)).toBe(true);
    expect(sameOrbit(a, { ...a, distance: m(a.distance + 1e-6) })).toBe(false);
  });
});

describe("crop frame", () => {
  test("the crop keeps the film's aspect, is centred, and fills the canvas's tighter side to 90 %", () => {
    const c = cropRect(1440, 900, 1600, 2000);
    expect(c.width / c.height).toBeCloseTo(0.8, 12);
    expect(c.height).toBeCloseTo(810, 9);
    expect(c.x).toBeCloseTo((1440 - c.width) / 2, 9);
    const wide = cropRect(1000, 1000, 1920, 1080);
    expect(wide.width).toBeCloseTo(900, 9);
  });

  test("the canvas field of view shows exactly the film's field across the crop", () => {
    const film = 2 * Math.atan(18 / 85), c = cropRect(1440, 900, 1600, 2000);
    const fov = canvasFovY(film, 900, c);
    expect(Math.tan(fov / 2) * (c.height / 900)).toBeCloseTo(Math.tan(film / 2), 12);
  });
});
