/**
 * The Cycles module itself, under Node's worker threads: a few tiny renders that check what the
 * scene means (light linking, the floor ring, progressive passes) and the session lifecycle.
 */
import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { decodeRgbe, loadCycles, readPasses, RenderState, uploadAgain, uploadScene, type CyclesModule, type Passes, type WorldImage } from "../src/photo/cycles-upload";
import type { Scene } from "../src/scene";
import { beadMesh, fixture } from "../tools/parity/fixtures";

let M: CyclesModule;
let world: WorldImage;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  M = await loadCycles(new URL("../public/cycles/cycles_booth.mjs", import.meta.url).href, 20);
  world = decodeRgbe(new Uint8Array(readFileSync(new URL("../public/hdr/studio_small_09_1k.hdr", import.meta.url))));
}, 60_000);

async function render(scene: Scene, during?: () => void): Promise<{ passes: Passes; state: number; snapshots: number }> {
  const result = await renderIn(scene, false, during);
  M._cb_session_free();
  return result;
}

/** Renders in a new session, or `again` in the last one, and leaves the session open. */
async function renderIn(scene: Scene, again: boolean, during?: () => void): Promise<{ passes: Passes; state: number; snapshots: number }> {
  if (again) uploadAgain(M, scene);
  else uploadScene(M, scene, world);
  let snapshots = 0;
  let version = M._cb_passes_version(); // it counts on across a session's renders
  expect(M._cb_render_start()).toBe(0);
  while (M._cb_render_state() === RenderState.running) {
    await wait(5);
    if (M._cb_passes_version() !== version) {
      version = M._cb_passes_version();
      snapshots++;
      during?.();
    }
  }
  const state = M._cb_render_state();
  const passes = readPasses(M, scene.film.width, scene.film.height);
  if (!passes) throw new Error("no passes");
  return { passes, state, snapshots };
}

/** Mean of rgba over pixels whose albedo pass is grey (the backdrop) or not (the part). */
function meanWhere(p: Passes, backdrop: boolean): number {
  if (!p.albedo) throw new Error("no albedo pass");
  let sum = 0;
  let n = 0;
  for (let i = 0; i < p.rgba.length; i += 4) {
    const grey = Math.abs(p.albedo[i] - p.albedo[i + 2]) < 0.01 && p.albedo[i] > 0.2;
    if (grey === backdrop) {
      sum += p.rgba[i] + p.rgba[i + 1] + p.rgba[i + 2];
      n++;
    }
  }
  return sum / n / 3;
}

const small = { width: 96, height: 60, samples: 16 };

test("the bead fixture renders progressively with albedo and normal guides", async () => {
  const { passes, state, snapshots } = await render(fixture("a", small));
  expect(state).toBe(RenderState.done);
  expect(passes.samples).toBe(16);
  expect(snapshots).toBeGreaterThanOrEqual(1);
  expect(passes.rgba.every(Number.isFinite)).toBe(true);
  expect(meanWhere(passes, false)).toBeGreaterThan(0.01);
  const normal = passes.normal;
  if (!normal) throw new Error("no normal pass");
  const floor = (58 * 96 + 2) * 4;
  expect(Math.hypot(normal[floor], normal[floor + 1], normal[floor + 2])).toBeCloseTo(1, 2);
}, 60_000);

test("a part-only light reaches the part and not the backdrop", async () => {
  const base = fixture("b", small);
  const only = (partOnly: boolean): Scene => ({
    ...base,
    world: { ...base.world, strength: 0 },
    lights: { ...base.lights, emitters: base.lights.emitters.filter((e) => e.id === "key").map((e) => ({ ...e, partOnly })) },
  });
  const linked = (await render(only(true))).passes;
  const open = (await render(only(false))).passes;
  expect(meanWhere(linked, true)).toBeLessThan(0.1 * meanWhere(open, true));
  expect(meanWhere(linked, false)).toBeGreaterThan(0.5 * meanWhere(open, false));
}, 60_000);

test("the floor cards show in the part's reflections only", async () => {
  const withRing = fixture("c", small);
  const without: Scene = { ...withRing, lights: { ...withRing.lights, floorCards: null } };
  const lit = (await render(withRing)).passes;
  const dark = (await render(without)).passes;
  expect(meanWhere(lit, false)).toBeGreaterThan(2 * meanWhere(dark, false));
  expect(meanWhere(lit, true)).toBeCloseTo(meanWhere(dark, true), 2);
}, 60_000);

test("the floor card is a disc that fades from its inner to its outer radius, not an annulus", async () => {
  const base = fixture("c", small);
  const ring = base.lights.floorCards;
  if (!ring) throw new Error("fixture c has no floor cards");
  const withRing = (innerRadiusM: number, outerRadiusM: number): Scene =>
    ({ ...base, lights: { ...base.lights, floorCards: { ...ring, innerRadiusM, outerRadiusM } } });
  const none = meanWhere((await render({ ...base, lights: { ...base.lights, floorCards: null } })).passes, false);
  const fading = meanWhere((await render(withRing(0.03, 0.3))).passes, false);
  const nearlyFlat = meanWhere((await render(withRing(0.29, 0.3))).passes, false);
  const vanishing = meanWhere((await render(withRing(0.001, 0.002))).passes, false);
  // The same radiance everywhere inside 0.29 m lights the part at least as much as one that fades from 0.03 m.
  expect(nearlyFlat).toBeGreaterThan(fading);
  expect(fading).toBeGreaterThan(none + 0.1 * (nearlyFlat - none));
  // A disc 2 mm across, fading from 1 mm, adds almost nothing.
  expect(vanishing - none).toBeLessThan(0.05 * (nearlyFlat - none));
}, 120_000);

test("finish keeps the samples rendered so far, with the denoiser's guides", async () => {
  const scene = fixture("a", { ...small, samples: 100_000 });
  const { passes, state } = await render(scene, () => M._cb_finish());
  expect(state).toBe(RenderState.done);
  expect(passes.samples).toBeGreaterThan(0);
  expect(passes.samples).toBeLessThan(100_000);
  expect(passes.albedo).not.toBeNull();
  expect(passes.normal).not.toBeNull();
}, 60_000);

test("progress carries the colour only, and the final frame the guides too", async () => {
  const scene = fixture("a", { ...small, samples: 64 });
  const progress: Passes[] = [];
  const { passes } = await render(scene, () => {
    if (M._cb_render_state() !== RenderState.running) return;
    const p = readPasses(M, small.width, small.height);
    if (p && p.samples < 64) progress.push(p);
  });
  expect(progress.length).toBeGreaterThan(0);
  for (const p of progress) expect([p.albedo, p.normal]).toEqual([null, null]);
  expect(passes.albedo).not.toBeNull();
  expect(passes.normal).not.toBeNull();
}, 60_000);

test("cancel returns within a second while sampling and while building the BVH", async () => {
  for (const phase of ["sampling", "bvh"] as const) {
    const base = fixture("a", { ...small, samples: 100_000 });
    const scene: Scene = phase === "bvh" && base.part
      ? { ...base, part: { ...base.part, mesh: beadMesh({ layers: 120, perimeters: 2, segments: 600, ringVerts: 12, halfSizeM: [0.016, 0.011], layerHeightM: 0.0002, beadWidthM: 0.00045 }) } }
      : base;
    uploadScene(M, scene, world);
    M._cb_render_start();
    if (phase === "sampling") while (M._cb_render_sample() < 1) await wait(5);
    else await wait(300);
    expect(M._cb_render_sample() > 0).toBe(phase === "sampling");
    const t0 = performance.now();
    M._cb_cancel();
    expect(performance.now() - t0).toBeLessThan(1000);
    while (M._cb_render_state() === RenderState.running) await wait(1);
    expect(M._cb_render_state()).toBe(RenderState.cancelled);
    M._cb_session_free();
  }
}, 120_000);

test("repeated sessions in one module reuse the heap", async () => {
  const heaps: number[] = [];
  for (let i = 0; i < 3; i++) {
    await render(fixture("a", small));
    heaps.push(M._cb_heap_bytes());
  }
  expect(heaps[2]).toBe(heaps[1]);
}, 120_000);

/** Fixture a with another camera, film or depth of field: what a render again may change. */
function frames(): Scene[] {
  const a = fixture("a", small), { camera, film } = a;
  const moved = { ...camera, position: [camera.position[0] * 0.9, camera.position[1] * 1.1, camera.position[2]] as typeof camera.position, fovYRad: camera.fovYRad * 0.8 };
  return [
    a,
    { ...a, camera: moved },
    { ...a, film: { ...film, width: 80, height: 50, samples: 8 } },
    { ...a, film: { ...film, width: 60, height: 96, adaptiveThreshold: 0, filterWidthPx: 2.5 } },
    { ...a, film: { ...film, width: 128, height: 80, adaptiveThreshold: 0.01 } },
    { ...a, film: { ...film, transparent: true } },
    { ...a, camera: { ...camera, apertureRadiusM: 0.004 } },
    a,
  ];
}

test("rendering again with a new camera or film matches a fresh session, pixel for pixel", async () => {
  const scenes = frames();
  const fresh = [];
  for (const scene of scenes) fresh.push((await render(scene)).passes);
  try {
    for (const [i, scene] of scenes.entries()) {
      const run = await renderIn(scene, i > 0);
      expect(run.state).toBe(RenderState.done);
      expect(run.passes.samples).toBe(scene.film.samples);
      expect(run.passes.rgba, `render ${i}`).toEqual(fresh[i].rgba);
      expect(run.passes.albedo, `render ${i}`).toEqual(fresh[i].albedo);
      expect(run.passes.normal, `render ${i}`).toEqual(fresh[i].normal);
    }
  } finally {
    M._cb_session_free();
  }
}, 240_000);

test("a render again after Finish renders its full sample count", async () => {
  const a = fixture("a", small);
  const fresh = (await render(a)).passes;
  try {
    const stopped = await renderIn({ ...a, film: { ...a.film, samples: 100_000 } }, false, () => M._cb_finish());
    expect(stopped.passes.samples).toBeLessThan(100_000);
    const again = await renderIn(a, true);
    expect(again.passes.samples).toBe(small.samples);
    expect(again.passes.rgba).toEqual(fresh.rgba);
    expect(again.passes.normal).toEqual(fresh.normal);
  } finally {
    M._cb_session_free();
  }
}, 120_000);

test("only a finished render can render again", async () => {
  const a = fixture("a", { ...small, samples: 100_000 });
  uploadScene(M, a, world);
  expect(M._cb_session_again(small.width, small.height)).toBe(-1);
  M._cb_render_start();
  while (M._cb_render_sample() < 1) await wait(5);
  M._cb_cancel();
  while (M._cb_render_state() === RenderState.running) await wait(1);
  expect(M._cb_session_again(small.width, small.height)).toBe(-1);
  expect(M.UTF8ToString(M._cb_error())).toMatch(/finished render/);
  M._cb_session_free();
}, 60_000);

test("a render again builds no BVH and reuses the heap", async () => {
  const big = beadMesh({ layers: 120, perimeters: 2, segments: 600, ringVerts: 12, halfSizeM: [0.016, 0.011], layerHeightM: 0.0002, beadWidthM: 0.00045 });
  const scenes = frames().map((s) => ({ ...s, film: { ...s.film, samples: 1 }, part: s.part && { ...s.part, mesh: big } }));
  const bvh: number[] = [], heaps: number[] = [];
  try {
    for (const [i, scene] of scenes.entries()) {
      await renderIn(scene, i > 0);
      bvh.push(M._cb_time_ms(2));
      heaps.push(M._cb_heap_bytes());
    }
  } finally {
    M._cb_session_free();
  }
  expect(bvh[0]).toBeGreaterThan(0);
  expect(bvh.slice(1)).toEqual(bvh.slice(1).map(() => 0));
  expect(heaps.at(-1)).toBe(heaps[4]); // after the largest frame
}, 120_000);
