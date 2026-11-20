import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { packBeadWord, PLATE_EPS, type BeadMesh } from "../src/print";
import { decodeRgbe, estimateHeapBytes, HEAP_LIMIT_BYTES, heapFloats, partNormals, partRoughness, plateMask, wallTriangles } from "../src/photo/cycles-upload";
import type { BeadMaterial } from "../src/scene";

function mesh(words: number[], normals: number[], z: number[]): BeadMesh {
  return {
    position: Float32Array.from(z.flatMap((v) => [0, 0, v])),
    normal: Int16Array.from(normals.map((n) => Math.round(n * 32767))),
    tangent: new Int16Array(words.length * 3),
    word: Float32Array.from(words),
    index: new Uint32Array(0),
    tris: 0, layerCount: 3, layerHeightM: 0.0002, vRefMmS: 60,
    bboxM: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

function material(rough: number[], flatten: number[]): BeadMaterial {
  return {
    baseColor: [0.5, 0.5, 0.5], ior: 1.5, anisotropy: 0.2,
    layers: { count: flatten.length, rough: Float32Array.from(rough), flatten: Float32Array.from(flatten), heat: new Float32Array(flatten.length) },
    speedGain: 0.1, mottleScale: 300, mottleAmp: 0.06,
    plate: { textured: true, rough: 0.4, roughUnresolved: 0.5, grainPerM: 6000, bumpDistanceM: 5e-5 },
    overlay: "print",
  };
}

const TABLE = [0.2, 0.3, 0.4, 0.5, 0.21, 0.31, 0.41, 0.51, 0.22, 0.32, 0.42, 0.52];

test("roughness is the table entry for the vertex's layer and feature plus its relative speed", () => {
  // speed codes are 2 mm/s steps against a 60 mm/s reference: 30 (= ref), 15 (half), 90 (clamped to +1)
  const m = mesh([packBeadWord(0, 1, 30), packBeadWord(2, 2, 15), packBeadWord(1, 0, 90)], new Array(9).fill(0), [1, 1, 1]);
  const rough = partRoughness(m, material(TABLE, [1, 1, 1]));
  expect(rough[0]).toBeCloseTo(0.21, 6);
  expect(rough[1]).toBeCloseTo(0.42 - 0.5 * 0.1, 6);
  expect(rough[2]).toBeCloseTo(0.3 + 1 * 0.1, 6);
});

test("a layer past the table reads its last row", () => {
  const rough = partRoughness(mesh([packBeadWord(3, 7, 30)], [0, 0, 1], [1]), material(TABLE, [1, 1, 1]));
  expect(rough[0]).toBeCloseTo(0.52, 6);
});

test("wall normals tilt less by their layer's flatten factor and skins keep theirs", () => {
  const s = Math.SQRT1_2;
  const m = mesh([packBeadWord(0, 1, 30), packBeadWord(1, 1, 30)], [s, 0, s, s, 0, s], [1, 1]);
  const n = partNormals(m, material(TABLE, [1, 0.5, 1]));
  const wall = Math.hypot(1, 0.5);
  expect(n[0]).toBeCloseTo(1 / wall, 4);
  expect(n[2]).toBeCloseTo(0.5 / wall, 4);
  expect(n[3]).toBeCloseTo(s, 4);
  expect(n[5]).toBeCloseTo(s, 4);
});

test("the plate mask marks vertices on the bed", () => {
  const mask = plateMask(mesh([0, 0, 0], new Array(9).fill(0), [0, PLATE_EPS, PLATE_EPS * 2]));
  expect([...mask]).toEqual([1, 1, 0]);
});

test("only triangles with no vertex on the bed skip the plate's bump", () => {
  // Vertices 0 and 1 are on the bed. Triangles: all off it, one corner on it, all on it.
  const m = { ...mesh([0, 0, 0, 0, 0], new Array(15).fill(0), [0, PLATE_EPS, 1e-3, 2e-3, 3e-3]), index: Uint32Array.of(2, 3, 4, 1, 2, 3, 0, 1, 0) };
  expect([...wallTriangles(m)]).toEqual([1, 0, 0]);
});

test("the studio HDR decodes to the values Blender reads from it", () => {
  const hdr = decodeRgbe(new Uint8Array(readFileSync(new URL("../public/hdr/studio_small_09_1k.hdr", import.meta.url))));
  expect([hdr.width, hdr.height]).toEqual([1024, 512]);
  // Blender's image.pixels are bottom row first; these are its rows 0 and 256.
  const at = (row: number, col: number) => [...hdr.rgb.subarray((row * 1024 + col) * 3, (row * 1024 + col) * 3 + 3)];
  expect(at(511, 0)).toEqual([0.80859375, 0.78515625, 0.78125]);
  expect(at(255, 512)).toEqual([0.294921875, 0.287109375, 0.279296875]);
});

test("a 10-million-triangle part fits the 4 GB heap and a 25-million one does not", () => {
  expect(estimateHeapBytes(10e6, 1920 * 1080)).toBeLessThan(HEAP_LIMIT_BYTES);
  expect(estimateHeapBytes(25e6, 1920 * 1080)).toBeGreaterThan(HEAP_LIMIT_BYTES);
});

test("a heap pointer above 2 GiB, which arrives from wasm as a negative number, reads the floats at its unsigned offset", () => {
  const memory = new WebAssembly.Memory({ initial: 32769, maximum: 65536 });
  const offset = 2 ** 31 + 1024;
  new Float32Array(memory.buffer, offset, 3).set([1, 2, 3]);
  expect([...heapFloats(memory, offset | 0, 3)]).toEqual([1, 2, 3]);
});
