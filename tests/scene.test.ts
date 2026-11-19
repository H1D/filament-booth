import { describe, expect, test } from "vitest";
import {
  DEFAULT_GLOSS, defaultDocument, deg, kelvin, m, mm, watts, type AreaLight, type BoothDocument, type CameraSetup, type Imperfections,
  type ScrimLight, type StudioLight,
} from "../src/document";
import { LOOK_PRESETS } from "../src/presets";
import type { BeadMesh, LoadedPrint, SlicedPrint } from "../src/print";
import {
  compileScene, filmSize, framePart, glossRoughness, kelvinToRgb, layerHeatCurve, refocal, resolveMaterial,
  exportScene, solveCamera, solveLight, solvePose, studioAim, sweepMesh, transformPoint, type Scene,
} from "../src/scene";

// ---- fixtures ----------------------------------------------------------------

function fakeMesh(layerCount = 100): BeadMesh {
  return {
    position: new Float32Array(300), normal: new Int16Array(300), tangent: new Int16Array(300),
    word: new Float32Array(100), index: new Uint32Array(60), tris: 20, layerCount, layerHeightM: 2e-4, vRefMmS: 100,
    bboxM: { min: [-0.03, -0.02, 0], max: [0.03, 0.02, 0.1] },
  };
}

function fakeSliced(over: Partial<SlicedPrint> = {}): SlicedPrint {
  const layers = 101;
  return {
    settings: defaultDocument().slicing, settingsSource: "booth", layerHeightMm: mm(0.2),
    layerTimeS: Float32Array.from({ length: layers }, (_, k) => (k === 0 ? 0 : 5 + k)),
    layerFan: new Float32Array(layers).fill(0.5),
    filamentName: null, bedFromFile: null, note: null, ...over,
  };
}

function loaded(mesh = fakeMesh(), sliced = fakeSliced()): LoadedPrint {
  return { source: { kind: "bin", url: "test.bin" }, sliced, mesh, liteMesh: async () => mesh };
}

const edited = (mutate: (d: BoothDocument) => void): BoothDocument => {
  const d = defaultDocument();
  mutate(d);
  return d;
};

const close = (actual: readonly number[], expected: readonly number[], tol: number) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((e, i) => expect(Math.abs(actual[i] - e), `component ${i}: ${actual[i]} vs ${e}`).toBeLessThanOrEqual(tol));
};

// ---- ground truth from native Blender 5.2.3 ------------------------------------
// Printed by tools/blender/camera_and_lights_truth.py (render.py's camera and
// area/scrim construction, run with `blender -b --factory-startup -P`). fovY and
// fovX are measured from Camera.view_frame for the scene resolution, because
// Camera.angle_y ignores it. Blender stores float32, hence the 1e-6 tolerances.

const BLENDER_CAMERAS = [
  { name: "hero_light", azimuth: 0, elevation: 22, distance: 0.8, aim: [0.0, 0.0, 0.088], focalMm: 85.0, fStop: 11, res: [1600, 2000],
    position: [0.0, -0.74174708, 0.38768527], forward: [0.0, 0.92718393, -0.3746064], up: [0.0, 0.3746064, 0.92718393],
    fovY: 0.417363516, fovX: 0.335636775, apertureRadiusM: 0.003863636 },
  { name: "macro_landscape", azimuth: -15, elevation: 35, distance: 0.25, aim: [0.012, -0.02, 0.075], focalMm: 100.0, fStop: 4, res: [2000, 1600],
    position: [-0.04100304, -0.21781002, 0.21839412], forward: [0.21201225, 0.79124016, -0.57357633], up: [0.14845257, 0.55403221, 0.81915212],
    fovY: 0.286033765, fovX: 0.35618589, apertureRadiusM: 0.0125 },
  { name: "side_az", azimuth: 40, elevation: 10, distance: 0.5, aim: [0.0, 0.0, 0.05], focalMm: 50.0, fStop: 8, res: [1000, 1000],
    position: [0.31651112, -0.37720326, 0.13682409], forward: [-0.63302225, 0.75440651, -0.1736481], up: [-0.11161882, 0.13302219, 0.98480779],
    fovY: 0.691111185, fovX: 0.691111185, apertureRadiusM: 0.003125 },
];

// Light frames are the matrix_world columns. area: track -Z up Y, so the card
// normal is -colZ. scrim: track Z up Y, so the card normal is +colZ.
interface BlenderLight {
  name: string; kind: "area" | "scrim"; loc: number[]; size: number[];
  colX: number[]; colY: number[]; colZ: number[];
}
const BLENDER_LIGHTS: BlenderLight[] = [
  { name: "top", kind: "area", loc: [0.0, -0.1, 1.0], size: [1.2, 0.9],
    colX: [1.0, 0.0, 0.0], colY: [0.0, 0.99401623, 0.10923248], colZ: [0.0, -0.10923248, 0.99401623] },
  { name: "left", kind: "area", loc: [-0.75, -0.25, 0.4], size: [0.3, 1.2],
    colX: [0.31622791, -0.94868326, 0.0], colY: [0.34632608, 0.11544209, 0.93098408], colZ: [-0.88320899, -0.29440317, 0.36505976] },
  { name: "rim_l", kind: "area", loc: [-0.3, 0.85, 0.35], size: [0.08, 1.0],
    colX: [-0.9429903, -0.33282018, 5e-08], colY: [0.09223952, -0.26134512, 0.96082807], colZ: [-0.31978297, 0.90605158, 0.27714509] },
  { name: "front", kind: "area", loc: [0.0, -2.2, 0.55], size: [2.0, 0.8],
    colX: [1.0, 0.0, 0.0], colY: [0.0, 0.20466495, 0.97883207], colZ: [0.0, -0.97883207, 0.20466495] },
  { name: "scrim_right", kind: "scrim", loc: [0.85, 0.32, 0.45], size: [1.4, 1.8],
    colX: [0.35232976, -0.93587589, 8e-08], colY: [-0.34485206, -0.12982658, 0.92963547], colZ: [-0.87002343, -0.32753828, -0.3684805] },
  { name: "scrim_left", kind: "scrim", loc: [-0.85, 0.6, 0.45], size: [1.2, 1.6],
    colX: [0.5766831, 0.8169679, -1e-07], colY: [0.26713973, -0.18856905, 0.94502807], colZ: [0.77205759, -0.54498178, -0.32698917] },
  { name: "overhead", kind: "area", loc: [0.0, 0.0, 1.1], size: [1.4, 0.3],
    colX: [1.0, 0.0, 0.0], colY: [0.0, 1.0, 0.0], colZ: [0.0, 0.0, 1.0] },
  { name: "overhead_scrim", kind: "scrim", loc: [0.0, 0.0, 1.1], size: [1.4, 0.3],
    colX: [-1.0, 9e-08, 9e-08], colY: [9e-08, 1.0, -9e-08], colZ: [-9e-08, -9e-08, -1.0] },
  { name: "below", kind: "area", loc: [0.3, -0.2, -0.5], size: [1.0, 0.5],
    colX: [0.5547002, 0.83205032, 6e-08], colY: [0.70997363, -0.47331578, 0.52144957], colZ: [0.43387228, -0.28924811, -0.85328209] },
  { name: "straight_up", kind: "area", loc: [0.0, 0.0, -1.0], size: [1.0, 0.5],
    colX: [-1.0, 9e-08, 9e-08], colY: [9e-08, 1.0, -9e-08], colZ: [-9e-08, -9e-08, -1.0] },
  { name: "near_vertical_1e-3", kind: "area", loc: [0.001, 0.0, 1.09], size: [1.0, 0.5],
    colX: [-4e-08, 1.0, 2.344e-05], colY: [-0.99999952, -7e-08, 0.001], colZ: [0.001, -2.344e-05, 0.99999952] },
];

const AIM: readonly [number, number, number] = [0, 0, 0.09];

/** Inverse of the placement convention: where a Cartesian point sits about the aim. */
function spherical(loc: readonly number[]) {
  const o = [loc[0] - AIM[0], loc[1] - AIM[1], loc[2] - AIM[2]];
  const distance = Math.hypot(o[0], o[1], o[2]);
  const horizontal = Math.hypot(o[0], o[1]);
  return {
    azimuth: horizontal < 1e-12 ? 0 : (Math.atan2(o[0], -o[1]) * 180) / Math.PI,
    elevation: (Math.asin(o[2] / distance) * 180) / Math.PI,
    distance,
  };
}

function lightAt(kind: "area" | "scrim", loc: readonly number[], size: readonly number[]): StudioLight {
  const s = spherical(loc);
  const base = {
    id: "l", name: "l", on: true, azimuth: deg(s.azimuth), elevation: deg(s.elevation), distance: m(s.distance),
    shape: "rect" as const, width: m(size[0]), height: m(size[1]), color: { kind: "rgb" as const, rgb: [1, 1, 1] as const }, partOnly: false,
  };
  return kind === "area"
    ? ({ ...base, kind, powerW: watts(12), spreadDeg: deg(180) } satisfies AreaLight)
    : ({ ...base, kind, topRadiance: 3, bottomRadiance: 0.1 } satisfies ScrimLight);
}

describe("solveCamera against Blender", () => {
  for (const c of BLENDER_CAMERAS) {
    test(`${c.name}: position, view axes, field of view and aperture`, () => {
      const setup: CameraSetup = {
        azimuth: deg(c.azimuth), elevation: deg(c.elevation), distance: m(c.distance),
        target: [m(c.aim[0]), m(c.aim[1]), m(c.aim[2])], focalMm: mm(c.focalMm), fStop: c.fStop, focusPartPoint: null,
      };
      const cam = solveCamera(setup, null, c.res[0], c.res[1]);
      close(cam.position, c.position, 1e-6);
      const toTarget = cam.target.map((t, i) => t - cam.position[i]);
      const len = Math.hypot(...toTarget);
      close(toTarget.map((v) => v / len), c.forward, 1e-6);
      close(cam.up, c.up, 1e-6);
      expect(cam.fovYRad).toBeCloseTo(c.fovY, 7);
      expect(cam.apertureRadiusM).toBeCloseTo(c.apertureRadiusM, 8);
      expect(cam.focusDistanceM).toBeCloseTo(c.distance, 12);
      // The horizontal angle follows from the same sensor fit.
      expect(2 * Math.atan(Math.tan(cam.fovYRad / 2) * (c.res[0] / c.res[1]))).toBeCloseTo(c.fovX, 6);
    });
  }

  test("a clicked focus point sets the depth along the view axis, not the straight-line distance", () => {
    const setup: CameraSetup = {
      azimuth: deg(0), elevation: deg(0), distance: m(1), target: [m(0), m(0), m(0)],
      focalMm: mm(85), fStop: 4, focusPartPoint: [m(0.3), m(0.5), m(0)],
    };
    const cam = solveCamera(setup, solvePose({ turntableDeg: deg(0), restFace: "plate" }, fakeMesh().bboxM), 1000, 1000);
    // The camera sits at y = -1 looking along +Y. The point is 0.5 m past the target, 0.3 m to the side.
    expect(cam.focusDistanceM).toBeCloseTo(1.5, 5);
  });

  test("a camera straight above still has a finite up vector, turned with the azimuth", () => {
    const setup: CameraSetup = {
      azimuth: deg(90), elevation: deg(90), distance: m(1), target: [m(0), m(0), m(0)],
      focalMm: mm(50), fStop: 8, focusPartPoint: null,
    };
    close(solveCamera(setup, null, 1000, 1000).up, [-1, 0, 0], 1e-9);
  });
});

describe("solveLight against Blender", () => {
  for (const l of BLENDER_LIGHTS) {
    test(`${l.name} (${l.kind}): the card frame matches the tracked light`, () => {
      const e = solveLight(lightAt(l.kind, l.loc, l.size), [m(0), m(0), m(0.09)]);
      // Blender's own quaternion loses about 2e-5 when the aim is a hair off vertical.
      const tol = l.name.startsWith("near_vertical") ? 1e-4 : 1e-6;
      close(e.centre, l.loc, 1e-6);
      const sign = l.kind === "area" ? -1 : 1;
      close(e.normal, l.colZ.map((v) => sign * v), tol);
      close(e.yAxis, l.colY, tol);
      close(e.xAxis, l.colX.map((v) => sign * v), tol);
      expect(e.sizeM).toEqual(l.size);
    });
  }

  test("the frame is right-handed and the normal faces the aim", () => {
    const e = solveLight(lightAt("area", [0.4, -0.7, 0.5], [1, 1]), [m(0), m(0), m(0.09)]);
    const cross = [
      e.xAxis[1] * e.yAxis[2] - e.xAxis[2] * e.yAxis[1],
      e.xAxis[2] * e.yAxis[0] - e.xAxis[0] * e.yAxis[2],
      e.xAxis[0] * e.yAxis[1] - e.xAxis[1] * e.yAxis[0],
    ];
    close(cross, e.normal, 1e-9);
    const toAim = [-e.centre[0], -e.centre[1], 0.09 - e.centre[2]];
    const len = Math.hypot(...toAim);
    close(toAim.map((v) => v / len), e.normal, 1e-9);
  });

  test("colour is normalised to luminance 1 so power alone sets brightness", () => {
    const base = lightAt("area", [0, -1, 0.5], [1, 1]);
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const warm = solveLight({ ...base, color: { kind: "rgb", rgb: [2, 1, 0.5] } }, [m(0), m(0), m(0.09)]);
    expect(lum(warm.color)).toBeCloseTo(1, 9);
    expect(warm.color[0] / warm.color[1]).toBeCloseTo(2, 9);
    const warmer = solveLight({ ...base, color: { kind: "kelvin", kelvin: kelvin(3200) } }, [m(0), m(0), m(0.09)]);
    expect(lum(warmer.color)).toBeCloseTo(1, 9);
  });
});

describe("solvePose", () => {
  const bbox = fakeMesh().bboxM; // 60 x 40 x 100 mm, bed at z = 0
  const corners = (b: BeadMesh["bboxM"]) => {
    const out: [number, number, number][] = [];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
    return out;
  };
  const posedBounds = (restFace: "plate" | "top" | "front" | "back" | "left" | "right", turntableDeg = 0) => {
    const mat = solvePose({ restFace, turntableDeg: deg(turntableDeg) }, bbox);
    const world = corners(bbox).map((c) => transformPoint(mat, c));
    const lo = [0, 1, 2].map((i) => Math.min(...world.map((p) => p[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...world.map((p) => p[i])));
    return { mat, lo, hi };
  };

  test("as printed, the part stands 20 um above the floor, centred on the axis", () => {
    const { lo, hi } = posedBounds("plate");
    close(lo, [-0.03, -0.02, 2e-5], 1e-9);
    close(hi, [0.03, 0.02, 0.1 + 2e-5], 1e-9);
  });

  const faces = {
    top: (c: number[]) => c[2] === bbox.max[2],
    front: (c: number[]) => c[1] === bbox.min[1],
    back: (c: number[]) => c[1] === bbox.max[1],
    left: (c: number[]) => c[0] === bbox.min[0],
    right: (c: number[]) => c[0] === bbox.max[0],
  } as const;
  for (const [face, onFace] of Object.entries(faces)) {
    test(`resting on ${face}: that printed face lies on the floor and the part is centred`, () => {
      const restFace = face as keyof typeof faces;
      const { mat, lo, hi } = posedBounds(restFace);
      for (const c of corners(bbox).filter(onFace)) expect(transformPoint(mat, c)[2]).toBeCloseTo(2e-5, 9);
      expect((lo[0] + hi[0]) / 2).toBeCloseTo(0, 9);
      expect((lo[1] + hi[1]) / 2).toBeCloseTo(0, 9);
      expect(lo[2]).toBeCloseTo(2e-5, 9);
    });
  }

  test("a face placed down keeps the part's size, with the axes swapped for a side face", () => {
    const { lo, hi } = posedBounds("right");
    close([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], [0.1, 0.04, 0.06], 1e-9);
  });

  test("the turntable spins the part about its own centre and never lifts it", () => {
    const { mat } = posedBounds("plate", 90);
    close(transformPoint(mat, [0.03, 0, 0.05]), [0, 0.03, 0.05 + 2e-5], 1e-9);
    const { lo, hi } = posedBounds("plate", 90);
    close([hi[0] - lo[0], hi[1] - lo[1]], [0.04, 0.06], 1e-9);
    expect(lo[2]).toBeCloseTo(2e-5, 9);
  });
});

describe("studio aim", () => {
  test("with no part the lights aim at the old rig's point, 90 mm up", () => {
    expect([...studioAim(null)]).toEqual([0, 0, 0.09]);
  });

  test("with a part it is half the posed height, whatever the turntable", () => {
    const upright = compileScene(defaultDocument(), loaded(), 1).part;
    expect(studioAim(upright)[2]).toBeCloseTo(0.05, 9);
    const onSide = compileScene(edited((d) => { d.pose.restFace = "right"; d.pose.turntableDeg = deg(37); }), loaded(), 1).part;
    expect(studioAim(onSide)[2]).toBeCloseTo(0.03, 9);
  });
});

describe("camera helpers", () => {
  const cam = defaultDocument().camera;

  test("refocal keeps the framing: the subject's size on the sensor does not change", () => {
    const longer = refocal(cam, 135);
    expect(longer.focalMm).toBe(135);
    expect(longer.distance / longer.focalMm).toBeCloseTo(cam.distance / cam.focalMm, 12);
  });

  test("film size follows the aspect from the long edge", () => {
    expect(filmSize({ w: 4, h: 5 }, 2000)).toEqual({ width: 1600, height: 2000 });
    expect(filmSize({ w: 16, h: 9 }, 1920)).toEqual({ width: 1920, height: 1080 });
    expect(filmSize({ w: 1, h: 1 }, 800)).toEqual({ width: 800, height: 800 });
    expect(filmSize({ w: 3, h: 2 }, 1000)).toEqual({ width: 1000, height: 667 });
  });

  test("framePart puts the part's bounding sphere inside the narrower half angle and fills most of it", () => {
    const mesh = fakeMesh();
    for (const aspect of [{ w: 4, h: 5 }, { w: 16, h: 9 }]) {
      const framed = { ...cam, ...framePart(mesh, cam, aspect) };
      const radius = Math.hypot(0.06, 0.04, 0.1) / 2;
      const subtended = Math.asin(radius / framed.distance);
      const half = Math.atan((18 / cam.focalMm) * Math.min(1, aspect.w / aspect.h, aspect.h / aspect.w));
      expect(subtended).toBeLessThan(half);
      expect(subtended / half).toBeGreaterThan(0.85);
      expect(framed.target[2]).toBeCloseTo(0.05, 9);
    }
  });
});

describe("kelvinToRgb", () => {
  const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  test("luminance is 1 across the range", () => {
    for (const k of [1900, 2700, 4000, 5600, 6500, 9000, 12000]) expect(lum(kelvinToRgb(k))).toBeCloseTo(1, 9);
  });

  test("6500 K is close to white", () => {
    close(kelvinToRgb(6500), [1, 1, 1], 0.06);
  });

  test("warm light is red-heavy, cool light blue-heavy, steadily", () => {
    const ratio = (k: number) => kelvinToRgb(k)[0] / kelvinToRgb(k)[2];
    const ks = [2000, 2700, 3500, 4500, 5600, 6500, 8000, 10000];
    for (let i = 1; i < ks.length; i++) expect(ratio(ks[i])).toBeLessThan(ratio(ks[i - 1]));
    expect(kelvinToRgb(2700)[0]).toBeGreaterThan(kelvinToRgb(2700)[2]);
    expect(kelvinToRgb(10000)[2]).toBeGreaterThan(kelvinToRgb(10000)[0]);
  });

  // Blender 5.2.3 Light.temperature_color, printed by tools/blender/kelvin_truth.py.
  const BLENDER_KELVIN: [number, [number, number, number]][] = [
    [2700, [1.935077, 0.803531, 0.191721]],
    [3200, [1.679368, 0.865955, 0.325887]],
    [4000, [1.414116, 0.923642, 0.533674]],
    [5000, [1.213111, 0.960782, 0.762214]],
    [5600, [1.131895, 0.972989, 0.881303]],
    [6500, [1.042552, 0.984053, 1.035272]],
    [8000, [0.947345, 0.991601, 1.237143]],
    [10000, [0.871384, 0.994925, 1.430509]],
  ];
  test("agrees with Blender's light temperature to within 0.01 per channel", () => {
    for (const [k, expected] of BLENDER_KELVIN) close(kelvinToRgb(k), expected, 0.01);
  });
});

describe("resolveMaterial", () => {
  const plain: Imperfections = { heatGloss: 0, softLines: 0, speedGloss: 0, tauS: 10, fanCooling: 1, overlay: "print" };
  const petg = (over: (d: BoothDocument) => void = () => {}) => {
    const d = edited((doc) => { doc.filament.imperfections = { ...plain }; doc.filament.recipe.vary = 0; over(doc); });
    return resolveMaterial(d.filament, fakeMesh(), fakeSliced());
  };

  test("PETG Basic at its defaults is 0.21, 0.24, 0.36, 0.50 for wall, top, bridge, bottom, before per-layer terms", () => {
    const { layers } = petg();
    for (const layer of [1, 40, 100]) {
      close([0, 1, 2, 3].map((f) => layers.rough[layer * 4 + f]), [0.21, 0.24, 0.36, 0.5], 1e-6);
    }
  });

  test("per-layer sheen is a fixed small spread that is identical on every run and every part size", () => {
    const withSheen = (layerCount: number) => {
      const d = defaultDocument();
      d.filament.imperfections = { ...plain };
      return resolveMaterial(d.filament, fakeMesh(layerCount), fakeSliced({ layerTimeS: new Float32Array(0), layerFan: new Float32Array(0) }));
    };
    const a = withSheen(60).layers.rough, b = withSheen(100).layers.rough, again = withSheen(60).layers.rough;
    expect([...a]).toEqual([...again]);
    expect([...a.slice(0, 61 * 4)]).toEqual([...b.slice(0, 61 * 4)]);
    const offsets = Array.from({ length: 61 }, (_, l) => a[l * 4] - 0.21);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(0.025 + 1e-6);
    expect(new Set(offsets.map((o) => o.toFixed(5))).size).toBeGreaterThan(30);
    expect(Math.abs(offsets.reduce((s, o) => s + o, 0) / offsets.length)).toBeLessThan(0.01);
  });

  test("base colour is the linear value of the picked sRGB colour", () => {
    const [r, g, b] = petg().baseColor;
    expect(r).toBeCloseTo(0.012, 3); // the old twin's albedo for #1c1c1c
    expect(g).toBeCloseTo(r, 12);
    expect(b).toBeCloseTo(r, 12);
  });

  test("gloss: the default leaves the recipe alone, more gloss is smoother, less is rougher, at every feature", () => {
    const roughOf = (gloss: number) => petg((d) => { d.filament.gloss = gloss; }).layers.rough.slice(4, 8);
    const [dull, neutral, shiny] = [roughOf(0), roughOf(DEFAULT_GLOSS), roughOf(1)];
    for (let f = 0; f < 4; f++) {
      expect(dull[f]).toBeGreaterThan(neutral[f]);
      expect(neutral[f]).toBeGreaterThan(shiny[f]);
    }
    for (const rough of [dull, neutral, shiny]) for (let f = 1; f < 4; f++) expect(rough[f]).toBeGreaterThan(rough[f - 1]);
    let last = Infinity;
    for (let g = 0; g <= 1.0001; g += 0.05) {
      const r = glossRoughness(0.36, g);
      expect(r).toBeLessThan(last);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
      last = r;
    }
  });

  test("a matte filament made fully glossy is still rougher than glossy PETG at its default", () => {
    expect(glossRoughness(0.74, 1)).toBeGreaterThan(0.21);
  });

  test("heat gloss makes warm layers glossier, speed gloss is a gain for the renderer", () => {
    const d = edited((doc) => { doc.filament.recipe.vary = 0; doc.filament.imperfections = { ...plain, heatGloss: 1, speedGloss: 1 }; });
    const mat = resolveMaterial(d.filament, fakeMesh(), fakeSliced());
    // Short layers (small index here) are warmer.
    expect(mat.layers.heat[2]).toBeGreaterThan(mat.layers.heat[99]);
    expect(mat.layers.rough[2 * 4]).toBeLessThan(mat.layers.rough[99 * 4]);
    expect(mat.speedGain).toBeCloseTo(0.0875, 9);
  });

  test("soft lines flatten warm layers only", () => {
    const d = edited((doc) => { doc.filament.imperfections = { ...plain, softLines: 1 }; });
    const { layers } = resolveMaterial(d.filament, fakeMesh(), fakeSliced());
    expect(layers.flatten[2]).toBeLessThan(1);
    expect(layers.flatten[99]).toBe(1);
    expect(Math.min(...layers.flatten)).toBeGreaterThanOrEqual(1 - 0.21);
  });

  test("the plate face follows the bed: auto trusts the file, else textured", () => {
    const d = defaultDocument();
    const plate = (sliced: SlicedPrint, bed: "auto" | "smooth" | "textured-pei") =>
      resolveMaterial({ ...d.filament, bed }, fakeMesh(), sliced).plate;
    expect(plate(fakeSliced(), "auto").textured).toBe(true);
    expect(plate(fakeSliced({ bedFromFile: "smooth" }), "auto").textured).toBe(false);
    expect(plate(fakeSliced({ bedFromFile: "smooth" }), "textured-pei").textured).toBe(true);
    expect(plate(fakeSliced(), "smooth").rough).toBeCloseTo(0.21, 6);
    expect(plate(fakeSliced(), "textured-pei").rough).toBe(0.42);
  });

  test("the layer table covers every layer the bead word can name", () => {
    const { layers } = resolveMaterial(defaultDocument().filament, fakeMesh(5000), fakeSliced());
    expect(layers.count).toBe(2048);
    expect(layers.rough).toHaveLength(2048 * 4);
  });
});

describe("layerHeatCurve", () => {
  const imp = defaultDocument().filament.imperfections;
  const times = Float32Array.from({ length: 201 }, (_, k) => (k === 0 ? 0 : 3 + k));
  const heat = layerHeatCurve(fakeSliced({ layerTimeS: times, layerFan: new Float32Array(201) }), imp);

  test("is median 0 and +-1 at the 90th and 10th percentiles", () => {
    const sorted = Array.from(heat.slice(1)).sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))];
    expect(at(0.5)).toBeCloseTo(0, 6);
    expect(at(0.9)).toBeCloseTo(1, 5);
    expect(at(0.1)).toBeCloseTo(-1, 5);
  });

  test("shorter layers are warmer, and a layer with no timing stays at 0", () => {
    expect(heat[5]).toBeGreaterThan(heat[150]);
    expect(heat[0]).toBe(0);
  });

  test("a print with no timing has no heat", () => {
    const none = layerHeatCurve(fakeSliced({ layerTimeS: new Float32Array(0), layerFan: new Float32Array(0) }), imp);
    expect(none).toHaveLength(0);
  });
});

describe("section identity", () => {
  const print = loaded();
  const first = compileScene(defaultDocument(), print, 1);
  const recompile = (doc: BoothDocument, p: LoadedPrint | null = print, previous: Scene = first) => compileScene(doc, p, 2, previous);

  test("recompiling an unchanged document returns every section by reference", () => {
    const again = recompile(defaultDocument());
    expect(again).not.toBe(first);
    expect(again.docRev).toBe(2);
    for (const k of ["part", "lights", "backdrop", "world", "camera", "film"] as const) expect(again[k], k).toBe(first[k]);
  });

  test("a light edit changes the lights and leaves camera, part, backdrop, world and film identical", () => {
    const next = recompile(edited((d) => {
      const key = d.studio.lights[0];
      if (key.kind !== "area") throw new Error("expected an area key light");
      key.powerW = watts(40);
    }));
    expect(next.lights).not.toBe(first.lights);
    expect(next.camera).toBe(first.camera);
    expect(next.part).toBe(first.part);
    expect(next.backdrop).toBe(first.backdrop);
    expect(next.world).toBe(first.world);
    expect(next.film).toBe(first.film);
  });

  test("an edited light is the only emitter that is replaced", () => {
    const next = recompile(edited((d) => { d.studio.lights[2].azimuth = deg(-40); }));
    first.lights.emitters.forEach((e, i) => {
      if (i === 2) expect(next.lights.emitters[i]).not.toBe(e);
      else expect(next.lights.emitters[i]).toBe(e);
    });
  });

  test("switching a light off drops its emitter and keeps the others", () => {
    const next = recompile(edited((d) => { d.studio.lights[1].on = false; }));
    expect(next.lights.emitters).toHaveLength(first.lights.emitters.length - 1);
    expect(next.lights.emitters.map((e) => e.id)).not.toContain(first.lights.emitters[1].id);
    expect(next.lights.emitters[0]).toBe(first.lights.emitters[0]);
  });

  test("a camera edit changes only the camera", () => {
    const next = recompile(edited((d) => { d.camera.azimuth = deg(25); }));
    expect(next.camera).not.toBe(first.camera);
    for (const k of ["part", "lights", "backdrop", "world", "film"] as const) expect(next[k], k).toBe(first[k]);
  });

  test("a turntable turn changes the part and its pose but keeps its material and mesh", () => {
    const next = recompile(edited((d) => { d.pose.turntableDeg = deg(30); }));
    expect(next.part).not.toBe(first.part);
    expect(next.part?.mesh).toBe(first.part?.mesh);
    expect(next.part?.material).toBe(first.part?.material);
    expect(next.lights).toBe(first.lights);
  });

  test("a filament edit changes the material and nothing in the studio", () => {
    const next = recompile(edited((d) => { d.filament.gloss = 0.9; }));
    expect(next.part?.material).not.toBe(first.part?.material);
    expect(next.part?.mesh).toBe(first.part?.mesh);
    for (const k of ["lights", "backdrop", "world", "camera", "film"] as const) expect(next[k], k).toBe(first[k]);
  });

  test("an output edit changes the film, and the camera only when the frame's shape changes the view", () => {
    const samples = recompile(edited((d) => { d.output.samples = 512; }));
    expect(samples.film).not.toBe(first.film);
    expect(samples.camera).toBe(first.camera);
    const wide = recompile(edited((d) => { d.output.aspect = { w: 16, h: 9 }; }));
    expect(wide.film).toMatchObject({ width: 2000, height: 1125 });
    expect(wide.camera).not.toBe(first.camera);
    expect(wide.camera.fovYRad).toBeLessThan(first.camera.fovYRad);
  });

  test("the mesh is compared by reference, never by content", () => {
    const copy = loaded(structuredClone(print.mesh), print.sliced);
    const next = recompile(defaultDocument(), copy);
    expect(next.part).not.toBe(first.part);
    expect(next.part?.mesh).toBe(copy.mesh);
    expect(recompile(defaultDocument(), loaded(print.mesh, print.sliced)).part).toBe(first.part);
  });

  test("removing the print drops the part and keeps the studio", () => {
    const next = recompile(defaultDocument(), null);
    expect(next.part).toBeNull();
    expect(next.camera).toBe(first.camera);
    expect(next.lights).not.toBe(first.lights); // the aim fell back to 90 mm
  });

  test("a scene compiles without a print", () => {
    const bare = compileScene(defaultDocument(), null, 7);
    expect(bare.part).toBeNull();
    expect(bare.lights.emitters.length).toBeGreaterThan(0);
    expect([...bare.lights.aim]).toEqual([0, 0, 0.09]);
  });

  test("a scene is frozen, and its parts do not alias the document", () => {
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lights.emitters[0])).toBe(true);
    expect(Object.isFrozen(first.camera.position)).toBe(true);
    const doc = defaultDocument();
    const scene = compileScene(doc, print, 3);
    expect(Object.isFrozen(doc.studio.backdrop.color)).toBe(false);
    expect(Object.isFrozen(doc.camera.target)).toBe(false);
    expect(scene.backdrop.albedo).not.toBe(doc.studio.backdrop.color);
  });

  test("the film carries Blender's factory render settings and the reference overrides", () => {
    expect(first.film).toMatchObject({
      width: 1600, height: 2000, samples: 256, adaptiveThreshold: 0.004, maxBounces: 12, diffuseBounces: 4,
      glossyBounces: 8, transmissionBounces: 12, clampDirect: 0, clampIndirect: 10, filterWidthPx: 1.5,
      transparent: false, denoise: true, look: "medium-high-contrast",
    });
  });

  test("floor cards compile for the looks that have them", () => {
    const gradient = compileScene(edited((d) => { d.studio = structuredClone(LOOK_PRESETS.gradient.studio); }), print, 1);
    expect(gradient.lights.floorCards).toMatchObject({ keyRadiance: 3.5, farRadiance: 0.05 });
    expect(gradient.lights.floorCards?.keyAzimuthRad).toBeCloseTo(-Math.PI / 2, 12);
    expect(first.lights.floorCards).toBeNull();
  });
});

describe("sweepMesh", () => {
  const sweep = sweepMesh();

  test("is the render.py backdrop: 8 m wide, floor from y = -4, wall at y = 1.05 up to z = 4", () => {
    const xs = [], ys = [], zs = [];
    for (let i = 0; i < sweep.positions.length; i += 3) { xs.push(sweep.positions[i]); ys.push(sweep.positions[i + 1]); zs.push(sweep.positions[i + 2]); }
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-4, 4]);
    expect(Math.min(...ys)).toBe(-4);
    expect(Math.max(...ys)).toBeCloseTo(1.05, 6);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBe(4);
  });

  test("every triangle faces up or towards the part, and every normal is a unit vector", () => {
    for (let t = 0; t < sweep.index.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => Array.from(sweep.positions.slice(sweep.index[t + k] * 3, sweep.index[t + k] * 3 + 3)));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const vertexNormal = Array.from(sweep.normals.slice(sweep.index[t] * 3, sweep.index[t] * 3 + 3));
      expect(n[0] * vertexNormal[0] + n[1] * vertexNormal[1] + n[2] * vertexNormal[2]).toBeGreaterThan(0);
    }
    for (let i = 0; i < sweep.normals.length; i += 3) {
      expect(Math.hypot(sweep.normals[i], sweep.normals[i + 1], sweep.normals[i + 2])).toBeCloseTo(1, 5);
    }
    close(Array.from(sweep.normals.slice(0, 3)), [0, 0, 1], 1e-9);
  });
});

describe("exportScene", () => {
  const scene = compileScene(defaultDocument(), loaded(), 5);
  const { json, buffers } = exportScene(scene);

  test("replaces typed arrays with references that carry the element type and keeps everything else", () => {
    expect(JSON.parse(json)).toMatchObject({
      docRev: 5,
      part: { mesh: { position: { buffer: "part.mesh.position", kind: "f32", length: 300 }, normal: { kind: "i16" }, index: { kind: "u32" }, layerCount: 100 },
              material: { layers: { rough: { buffer: "part.material.layers.rough", kind: "f32", length: 404 } } } },
      backdrop: { positions: { buffer: "backdrop.positions" } },
      camera: { focalMm: 85 },
      film: { width: 1600, height: 2000 },
    });
    expect(json.length).toBeLessThan(30000);
    expect(json).not.toContain("Float32Array");
  });

  test("lists every referenced buffer under the name its reference gives, and no other", () => {
    const named = [...json.matchAll(/"buffer": "([^"]+)"/g)].map((match) => match[1]);
    expect([...buffers.keys()].sort()).toEqual(named.sort());
    expect(buffers.get("part.mesh.position")).toBe(scene.part?.mesh.position);
  });

  test("a scene with no part writes null for it", () => {
    expect(JSON.parse(exportScene(compileScene(defaultDocument(), null, 1)).json)).toMatchObject({ part: null });
  });
});
