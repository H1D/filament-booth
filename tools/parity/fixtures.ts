/**
 * Parity fixtures built by hand as Scene values, each isolating one renderer feature. compiled.ts has
 * the ones that go through compileScene. Pure and deterministic: the dev page builds them in the
 * browser and run.ts builds the same values for native Blender.
 */
import { CLEAN_FILM_OPTICS, deg, m, type Rgb, type Vec3 } from "../../src/document";
import { packBeadWord, type BeadMesh } from "../../src/print";
import {
  FILM_DEFAULTS, primitiveGeometry, propMatrix, type AreaEmitter, type BackdropSection, type BeadMaterial, type CameraSection,
  type FilmSection, type FloorCardRing, type LayerTable, type Mat4, type PropItem, type Scene, type ScrimEmitter,
} from "../../src/scene";

// ---- the part: stacked swept tubes ------------------------------------------------------

export interface BeadPartShape {
  readonly layers: number;
  readonly perimeters: number;
  readonly segments: number; // path segments per loop
  readonly ringVerts: number; // cross-section vertices
  readonly halfSizeM: readonly [number, number];
  readonly layerHeightM: number;
  readonly beadWidthM: number;
}

const SPEED_Q_OUTER = 15; // 30 mm/s
const SPEED_Q_INNER = 60; // 120 mm/s
const V_REF_MMS = 60;

/** Concentric rounded-box loops per layer, each an elliptic tube. Layer 0 is flattened onto the
 *  bed so it has a plate face; the top layer is a top skin; two layers mid-height are bridges. */
export function beadMesh(s: BeadPartShape): BeadMesh {
  const loops = s.layers * s.perimeters;
  const nverts = loops * s.segments * s.ringVerts;
  const position = new Float32Array(nverts * 3);
  const normal = new Int16Array(nverts * 3);
  const tangent = new Int16Array(nverts * 3);
  const word = new Float32Array(nverts);
  const index = new Uint32Array(loops * s.segments * s.ringVerts * 6);
  const bridge = Math.floor(s.layers / 2);
  let v = 0;
  let t = 0;
  for (let layer = 0; layer < s.layers; layer++) {
    const feature = layer === 0 ? 3 : layer === s.layers - 1 ? 1 : layer === bridge || layer === bridge + 1 ? 2 : 0;
    const zc = (layer + 0.5) * s.layerHeightM;
    for (let p = 0; p < s.perimeters; p++) {
      const a = s.halfSizeM[0] - p * s.beadWidthM;
      const b = s.halfSizeM[1] - p * s.beadWidthM;
      const w = packBeadWord(feature, layer, p === 0 ? SPEED_Q_OUTER : SPEED_Q_INNER);
      const first = v;
      for (let seg = 0; seg < s.segments; seg++) {
        const [x, y, tx, ty] = loopPoint(a, b, (2 * Math.PI * seg) / s.segments);
        for (let k = 0; k < s.ringVerts; k++) {
          const th = (2 * Math.PI * k) / s.ringVerts;
          const c = Math.cos(th);
          const sn = Math.sin(th);
          // Outward in XY is the path tangent turned clockwise.
          const px = x + c * (s.beadWidthM / 2) * ty;
          const py = y - c * (s.beadWidthM / 2) * tx;
          let pz = zc + sn * (s.layerHeightM / 2);
          let nx = (c / s.beadWidthM) * ty;
          let ny = -(c / s.beadWidthM) * tx;
          let nz = sn / s.layerHeightM;
          if (layer === 0 && sn < -0.7) {
            pz = 0;
            nx = 0;
            ny = 0;
            nz = -1;
          }
          const nl = Math.hypot(nx, ny, nz);
          position.set([px, py, pz], v * 3);
          normal.set([Math.round((nx / nl) * 32767), Math.round((ny / nl) * 32767), Math.round((nz / nl) * 32767)], v * 3);
          tangent.set([Math.round(tx * 32767), Math.round(ty * 32767), 0], v * 3);
          word[v] = w;
          v++;
        }
      }
      for (let seg = 0; seg < s.segments; seg++) {
        const r0 = first + seg * s.ringVerts;
        const r1 = first + ((seg + 1) % s.segments) * s.ringVerts;
        for (let k = 0; k < s.ringVerts; k++) {
          const k1 = (k + 1) % s.ringVerts;
          index.set([r0 + k, r1 + k, r1 + k1, r0 + k, r1 + k1, r0 + k1], t);
          t += 6;
        }
      }
    }
  }
  const top = s.layers * s.layerHeightM;
  const half = s.beadWidthM / 2;
  return {
    position, normal, tangent, word, index,
    tris: index.length / 3,
    layerCount: s.layers,
    layerHeightM: s.layerHeightM,
    vRefMmS: V_REF_MMS,
    bboxM: { min: [-s.halfSizeM[0] - half, -s.halfSizeM[1] - half, 0], max: [s.halfSizeM[0] + half, s.halfSizeM[1] + half, top] },
  };
}

/** A superellipse (exponent 6, a rounded box) and its unit tangent, counter-clockwise. */
function loopPoint(a: number, b: number, th: number): [number, number, number, number] {
  const e = 2 / 6;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const x = a * Math.sign(c) * Math.abs(c) ** e;
  const y = b * Math.sign(s) * Math.abs(s) ** e;
  // d/dth of |c|^e sign(c) is -e |c|^(e-1) s; clamp keeps the corners finite.
  const dx = -a * e * Math.max(Math.abs(c), 1e-4) ** (e - 1) * s;
  const dy = b * e * Math.max(Math.abs(s), 1e-4) ** (e - 1) * c;
  const l = Math.hypot(dx, dy);
  return [x, y, dx / l, dy / l];
}

/** A varied table: per-feature base, per-layer sheen from a fixed hash, warmth as a slow wave. */
export function layerTable(layers: number, base: readonly [number, number, number, number]): LayerTable {
  const rough = new Float32Array(layers * 4);
  const flatten = new Float32Array(layers);
  const heat = new Float32Array(layers);
  for (let l = 0; l < layers; l++) {
    const sheen = (hash01(l) - 0.5) * 0.05;
    heat[l] = Math.sin(l * 0.37);
    const gloss = -0.0625 * 0.6 * heat[l];
    for (let f = 0; f < 4; f++) rough[l * 4 + f] = base[f] + sheen + gloss;
    flatten[l] = 1 - 0.5 * 0.21 * Math.min(1, Math.max(0, heat[l]));
  }
  return { count: layers, rough, flatten, heat };
}

function hash01(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function beadMaterial(layers: number, baseColor: Rgb, finish: "gloss" | "dark"): BeadMaterial {
  const base: readonly [number, number, number, number] = finish === "gloss" ? [0.21, 0.24, 0.36, 0.5] : [0.12, 0.15, 0.3, 0.45];
  return {
    baseColor, ior: 1.57, anisotropy: 0.25,
    layers: layerTable(layers, base),
    speedGain: 0.0875 * 0.5,
    mottleScale: 300,
    mottleAmp: 0.06,
    surfaceWear: 0,
    dust: 0,
    subsurface: 0,
    plate: { textured: true, rough: 0.42, roughUnresolved: 0.55, grainPerM: 6000, bumpDistanceM: 5e-5 },
    overlay: "print",
  };
}

/** Lift off the floor and turn about Z, column-major. */
function turntable(turnRad: number): Mat4 {
  const c = Math.cos(turnRad);
  const s = Math.sin(turnRad);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 2e-5, 1];
}

// ---- studio ------------------------------------------------------------------------------

/** render.py's sweep: floor y -4..0.45, a 0.6 m cove in 16 steps, wall at y 1.05 to z 4, 8 m wide. */
export function sweep(albedo: number, roughness: number, shadowCatcher: boolean): BackdropSection {
  const prof: [number, number][] = [[-4, 0], [0.45, 0]];
  const R = 0.6;
  for (let k = 1; k <= 16; k++) {
    const a = (Math.PI / 2) * (k / 16);
    prof.push([0.45 + R * Math.sin(a), R - R * Math.cos(a)]);
  }
  prof.push([0.45 + R, 4]);
  const n = prof.length;
  const faceNormal = (i: number): [number, number] => {
    const dy = prof[i + 1][0] - prof[i][0];
    const dz = prof[i + 1][1] - prof[i][1];
    const l = Math.hypot(dy, dz);
    return [-dz / l, dy / l];
  };
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? faceNormal(i - 1) : faceNormal(0);
      const b = i < n - 1 ? faceNormal(i) : faceNormal(n - 2);
      const l = Math.hypot(a[0] + b[0], a[1] + b[1]);
      const o = (side * n + i) * 3;
      positions.set([side ? 4 : -4, prof[i][0], prof[i][1]], o);
      normals.set([0, (a[0] + b[0]) / l, (a[1] + b[1]) / l], o);
    }
  }
  const index = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) index.set([i, n + i, n + i + 1, i, n + i + 1, i + 1], i * 6);
  return { positions, normals, index, albedo: [albedo, albedo, albedo], roughness, texture: 0, shadowCatcher };
}

const v3 = (x: number, y: number, z: number): Vec3 => [m(x), m(y), m(z)];
const WHITE: Rgb = [1, 1, 1];

/** A card at `loc` facing `aim`, y axis the world up projected onto it (Blender track-to, up Y). */
function frame(loc: readonly [number, number, number], aim: readonly [number, number, number]) {
  const n = normalize([aim[0] - loc[0], aim[1] - loc[1], aim[2] - loc[2]]);
  const y = normalize([-n[2] * n[0], -n[2] * n[1], 1 - n[2] * n[2]]);
  const x = cross(y, n);
  return { centre: v3(...loc), xAxis: v3(...x), yAxis: v3(...y), normal: v3(...n) };
}

function normalize(a: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const AIM: [number, number, number] = [0, 0, 0.09];
const POWER = 1 / 40;

function area(id: string, size: [number, number], loc: [number, number, number], watts: number,
  o: { spreadDeg?: number; shape?: "rect" | "ellipse"; partOnly?: boolean; color?: Rgb } = {}): AreaEmitter {
  return {
    kind: "area", id, ...frame(loc, AIM), sizeM: size, shape: o.shape ?? "rect", color: o.color ?? WHITE,
    partOnly: o.partOnly ?? false, powerW: watts * POWER, spreadRad: ((o.spreadDeg ?? 180) * Math.PI) / 180,
  };
}

function scrim(id: string, size: [number, number], loc: [number, number, number], top: number, bottom: number,
  partOnly: boolean): ScrimEmitter {
  return {
    kind: "scrim", id, ...frame(loc, AIM), sizeM: size, shape: "rect", color: WHITE, partOnly,
    topRadiance: top, bottomRadiance: bottom,
  };
}

/** render.py's camera: orbit about `target`, azimuth 0 looks along +Y. */
function camera(target: [number, number, number], azDeg: number, elDeg: number, dist: number, focalMm: number,
  fStop: number, width: number, height: number, focusDistanceM = dist): CameraSection {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const d = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
  return {
    position: v3(target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist),
    target: v3(...target), up: v3(0, 0, 1), focalMm, sensorMm: 36,
    fovYRad: 2 * Math.atan((18 / focalMm) * Math.min(1, height / width)),
    fStop, apertureRadiusM: focalMm / fStop / 2 / 1000, focusDistanceM: focusDistanceM, clipStartM: 0.01,
  };
}

function film(width: number, height: number, samples: number, transparent = false): FilmSection {
  return { width, height, samples, timeLimitS: 0, ...FILM_DEFAULTS, transparent, denoise: false, look: "medium-high-contrast", optics: CLEAN_FILM_OPTICS };
}

// ---- the fixtures ------------------------------------------------------------------------

export const FIXTURES = ["a", "b", "c", "d", "p", "scale"] as const;
export type FixtureName = (typeof FIXTURES)[number];

/** Props of the fixture p: a wall behind the part, a squashed turned cube and a smooth sphere beside it. */
function props(): PropItem[] {
  const item = (id: string, shape: "cube" | "sphere" | "plane", segments: number, albedo: Rgb, roughness: number,
    location: Vec3, rotationDeg: [number, number, number], size: [number, number, number]): PropItem => ({
    id, geometry: primitiveGeometry(shape, segments), albedo, roughness,
    toWorld: propMatrix({ location, rotationDeg: [deg(rotationDeg[0]), deg(rotationDeg[1]), deg(rotationDeg[2])], scale: [1, 1, 1], size: v3(...size) }),
  });
  return [
    item("wall", "plane", 1, [0.7, 0.7, 0.75], 0.6, v3(0, 0.07, 0.04), [90, 0, 0], [0.3, 0.2, 1]),
    item("cube", "cube", 1, [0.8, 0.05, 0.05], 0.4, v3(0.026, -0.016, 0.008), [0, 0, 30], [0.016, 0.012, 0.024]),
    item("ball", "sphere", 32, [0.05, 0.3, 0.8], 0.15, v3(-0.026, -0.012, 0.009), [0, 0, 0], [0.018, 0.018, 0.018]),
  ];
}

const PART: BeadPartShape = {
  layers: 50, perimeters: 2, segments: 480, ringVerts: 12,
  halfSizeM: [0.016, 0.011], layerHeightM: 0.0002, beadWidthM: 0.00045,
};
const SCALE_PART: BeadPartShape = { ...PART, layers: 200, perimeters: 3, segments: 700 };

export interface FixtureOptions {
  readonly samples?: number;
  readonly width?: number;
  readonly height?: number;
}

export function fixture(name: FixtureName, o: FixtureOptions = {}): Scene {
  const width = o.width ?? 640;
  const height = o.height ?? 400;
  const samples = o.samples ?? 256;
  const shape = name === "scale" ? SCALE_PART : PART;
  const mesh = beadMesh(shape);
  const dark = name === "c";
  const material = beadMaterial(shape.layers, dark ? [0.012, 0.012, 0.012] : [0.3, 0.08, 0.04], dark ? "dark" : "gloss");
  const part = {
    mesh, material, toWorld: turntable((25 * Math.PI) / 180),
    worldBounds: { min: v3(-0.02, -0.02, 0), max: v3(0.02, 0.02, shape.layers * shape.layerHeightM) },
  };
  const target: [number, number, number] = [0, 0, (shape.layers * shape.layerHeightM) / 2];
  const world = { hdrId: "studio_small_09_1k", strength: 0.25, rotationRad: (30 * Math.PI) / 180 };
  const base = { docRev: 1, part, world, props: [] };
  const top = area("top", [1.2, 0.9], [0, -0.1, 1.0], 500);
  switch (name) {
    case "a":
    case "scale":
      return {
        ...base,
        lights: { emitters: [top], floorCards: null, aim: v3(...AIM) },
        backdrop: sweep(0.55, 0.55, false),
        camera: camera(target, 20, 25, 0.16, 85, 8, width, height),
        film: film(width, height, samples),
      };
    case "b":
      return {
        ...base,
        lights: {
          emitters: [
            area("key", [0.6, 0.4], [0.5, -0.6, 0.6], 60, { spreadDeg: 60, shape: "ellipse", color: [1.05, 0.98, 0.9] }),
            area("rim_l", [0.08, 1.0], [-0.3, 0.85, 0.35], 220, { spreadDeg: 40, partOnly: true }),
            scrim("grad_r", [1.4, 1.8], [0.85, 0.32, 0.4], 3.5, 0.03, true),
          ],
          floorCards: null, aim: v3(...AIM),
        },
        backdrop: sweep(0.35, 0.6, false),
        camera: camera(target, -30, 20, 0.16, 85, 8, width, height),
        film: film(width, height, samples),
      };
    case "c": {
      const ring: FloorCardRing = {
        centre: v3(0, 0, 0), innerRadiusM: 0.03, outerRadiusM: 0.3,
        keyRadiance: 3.5, farRadiance: 0.05, keyAzimuthRad: (-90 * Math.PI) / 180,
      };
      return {
        ...base,
        world: { ...world, strength: 0.03 },
        lights: { emitters: [area("top", [1.4, 1.4], [0, -0.05, 1.1], 120)], floorCards: ring, aim: v3(...AIM) },
        backdrop: sweep(0.35, 0.6, false),
        camera: camera(target, 10, 12, 0.16, 85, 8, width, height),
        film: film(width, height, samples),
      };
    }
    case "p": {
      // A part-only rim light that props must not receive, beside the open top light.
      const rim = area("rim", [0.08, 1.0], [-0.3, 0.85, 0.35], 220, { spreadDeg: 40, partOnly: true });
      return {
        ...base,
        props: props(),
        lights: { emitters: [top, rim], floorCards: null, aim: v3(...AIM) },
        backdrop: sweep(0.55, 0.55, false),
        camera: camera(target, 20, 25, 0.16, 85, 8, width, height),
        film: film(width, height, samples),
      };
    }
    case "d": {
      const cam = camera(target, 35, 18, 0.12, 85, 2.8, width, height);
      const front: [number, number, number] = [0.012, -0.012, target[2]];
      const focus = Math.hypot(cam.position[0] - front[0], cam.position[1] - front[1], cam.position[2] - front[2]);
      return {
        ...base,
        lights: { emitters: [top, area("left", [0.3, 1.2], [-0.75, -0.25, 0.4], 160)], floorCards: null, aim: v3(...AIM) },
        backdrop: sweep(0.55, 0.55, true),
        camera: { ...cam, focusDistanceM: focus },
        film: film(width, height, samples, true),
      };
    }
  }
}

export function isFixtureName(name: string): name is FixtureName {
  return FIXTURES.some((f) => f === name);
}

/** Realism parity scene exercising PR #17 surfaceWear, dust, Burley subsurface, and backdrop texture. */
export function realismFixture(o: FixtureOptions = {}): Scene {
  const base = fixture("p", o);
  const part = base.part
    ? {
        ...base.part,
        material: {
          ...base.part.material,
          surfaceWear: 0.35,
          dust: 0.3,
          subsurface: 0.25,
        },
      }
    : null;
  return {
    ...base,
    part,
    backdrop: { ...base.backdrop, texture: 0.45 },
  };
}

