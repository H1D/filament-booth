import { describe, expect, test } from "vitest";
import { buildBvhSync, intersectBvhCpu } from "../src/photo/webgpu-bvh";
import { primitiveGeometry } from "../src/scene";
import { beadMesh } from "../tools/parity/fixtures";

function bruteForceHit(
  positions: Float32Array,
  indices: Uint32Array,
  o: readonly [number, number, number],
  d: readonly [number, number, number],
): { readonly t: number; readonly tri: number } | null {
  let bestT = 1e30;
  let bestTri = -1;
  const ntris = indices.length / 3;
  for (let tri = 0; tri < ntris; tri++) {
    const i0 = indices[tri * 3 + 0] * 3;
    const i1 = indices[tri * 3 + 1] * 3;
    const i2 = indices[tri * 3 + 2] * 3;
    const v0x = positions[i0], v0y = positions[i0 + 1], v0z = positions[i0 + 2];
    const e1x = positions[i1] - v0x, e1y = positions[i1 + 1] - v0y, e1z = positions[i1 + 2] - v0z;
    const e2x = positions[i2] - v0x, e2y = positions[i2 + 1] - v0y, e2z = positions[i2 + 2] - v0z;
    const px = d[1] * e2z - d[2] * e2y;
    const py = d[2] * e2x - d[0] * e2z;
    const pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const invDet = 1 / det;
    const tx = o[0] - v0x, ty = o[1] - v0y, tz = o[2] - v0z;
    const u = (tx * px + ty * py + tz * pz) * invDet;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * invDet;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (t > 0 && t < bestT) { bestT = t; bestTri = tri; }
  }
  return bestTri >= 0 ? { t: bestT, tri: bestTri } : null;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function verifyRays(positions: Float32Array, indices: Uint32Array, radius: number, center: readonly [number, number, number], count = 500) {
  const bvh = buildBvhSync(positions, indices);
  const rand = lcg(42 + indices.length);
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * rand();
    const z = 2 * rand() - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const dx = r * Math.cos(theta), dy = r * Math.sin(theta), dz = z;
    // Shoot either from outside toward center-perturbed target, or from inside outward.
    const fromOutside = i % 2 === 0;
    const ox = fromOutside ? center[0] - dx * radius * 2.5 + (rand() - 0.5) * radius * 0.6 : center[0] + (rand() - 0.5) * radius * 0.4;
    const oy = fromOutside ? center[1] - dy * radius * 2.5 + (rand() - 0.5) * radius * 0.6 : center[1] + (rand() - 0.5) * radius * 0.4;
    const oz = fromOutside ? center[2] - dz * radius * 2.5 + (rand() - 0.5) * radius * 0.6 : center[2] + (rand() - 0.5) * radius * 0.4;
    const got = intersectBvhCpu(bvh, positions, [ox, oy, oz], [dx, dy, dz]);
    const ref = bruteForceHit(positions, indices, [ox, oy, oz], [dx, dy, dz]);
    if (ref === null) {
      expect(got).toBeNull();
    } else {
      expect(got).not.toBeNull();
      expect(got!.t).toBeCloseTo(ref.t, 6);
      hits++;
    }
  }
  expect(hits).toBeGreaterThan(20);
}

describe("webgpu-bvh", () => {
  test("matches brute-force ray intersection on cube and sphere primitives", () => {
    const cube = primitiveGeometry("cube", 1);
    verifyRays(cube.positions, cube.index, 0.9, [0, 0, 0]);
    const sphere = primitiveGeometry("sphere", 16);
    verifyRays(sphere.positions, sphere.index, 0.6, [0, 0, 0]);
  });

  test("matches brute-force ray intersection on a swept bead mesh", () => {
    const mesh = beadMesh({
      layers: 6, perimeters: 2, segments: 48, ringVerts: 8,
      halfSizeM: [0.012, 0.008], layerHeightM: 0.0002, beadWidthM: 0.00045,
    });
    verifyRays(mesh.position, mesh.index, 0.016, [0, 0, 0.0006], 500);
  });

  test("handles empty, single-triangle and degenerate coincident meshes", () => {
    const empty = buildBvhSync(new Float32Array(0), new Uint32Array(0));
    expect(empty.nodeCount).toBe(1);
    expect(intersectBvhCpu(empty, new Float32Array(0), [0, 0, 1], [0, 0, -1])).toBeNull();

    const singlePos = Float32Array.of(-1, -1, 0, 1, -1, 0, 0, 1, 0);
    const singleIdx = Uint32Array.of(0, 1, 2);
    const single = buildBvhSync(singlePos, singleIdx);
    const hit = intersectBvhCpu(single, singlePos, [0, 0, 2], [0, 0, -1]);
    expect(hit).toEqual({ t: 2, tri: 0 });
    expect(intersectBvhCpu(single, singlePos, [5, 0, 2], [0, 0, -1])).toBeNull();

    // Coincident triangles force median split without exceeding depth or capacity.
    const dupPos = new Float32Array(12 * 9);
    const dupIdx = new Uint32Array(12 * 3);
    for (let t = 0; t < 12; t++) {
      dupPos.set([-1, -1, 0, 1, -1, 0, 0, 1, 0], t * 9);
      dupIdx.set([t * 3, t * 3 + 1, t * 3 + 2], t * 3);
    }
    const dup = buildBvhSync(dupPos, dupIdx);
    const dupHit = intersectBvhCpu(dup, dupPos, [0, 0, 3], [0, 0, -1]);
    expect(dupHit?.t).toBeCloseTo(3, 6);
  });
});
