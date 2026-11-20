import { describe, expect, test } from "vitest";
import { centreline, layerJitter, thin } from "../src/print/centreline";
import type { Centreline } from "../src/print";
import { COVER_BOTTOM, COVER_END, COVER_LEFT, COVER_RIGHT, COVER_TOP, coverFaces } from "../src/print/cover";
import type { Run } from "../src/print/gcode";
import { sweep } from "../src/print/sweep";

const H = 0.2;
const W = 0.42;
const FLATS = COVER_TOP | COVER_BOTTOM;

/** A run along the given points (mm) at height z (mm). */
function run(z: number, pts: readonly number[], feat = "Outer wall", w: number | readonly number[] = W, h = H): Run {
  const n = pts.length / 2;
  return { feat, layer: Math.round(z / h) - 1, z, pts: [...pts], w: typeof w === "number" ? new Array(n).fill(w) : [...w], v: new Array(n).fill(60) };
}

/** Cover bits of the centreline of `shown`, tested against everything in `all`. */
function cover(shown: Run[], all: Run[], h = H, jitter = 0): number[] {
  const cl = centreline(shown, h, jitter);
  return [...coverFaces(cl, all, h, layerJitter(shown, jitter))];
}

const stack = (zs: readonly number[], pts: readonly number[], feat = "Outer wall") => zs.map((z) => run(z, pts, feat));

describe("flats", () => {
  const wall = (z: number, dy = 0) => run(z, [0, dy, 10, dy]);

  test("a wall between two layers is covered above and below", () => {
    expect(cover([wall(0.6)], [wall(0.4), wall(0.6), wall(0.8)])[0] & FLATS).toBe(FLATS);
  });

  test("the top layer's top and the lowest layer's bottom stay", () => {
    expect(cover([wall(0.6)], [wall(0.4), wall(0.6)])[0] & COVER_TOP).toBe(0);
    expect(cover([wall(0.4)], [wall(0.4), wall(0.6)])[0] & COVER_BOTTOM).toBe(0);
  });

  test("a layer leaning 4 um keeps the flat below covered, 7 um shows its edge", () => {
    expect(cover([wall(0.4)], [wall(0.4), wall(0.6, 0.004)])[0] & COVER_TOP).toBe(COVER_TOP);
    expect(cover([wall(0.4)], [wall(0.4), wall(0.6, 0.007)])[0] & COVER_TOP).toBe(0);
  });

  test("aligned walls stay covered under the per-layer wobble, which the test leaves out", () => {
    const walls = stack([0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8], [0, 0, 10, 0]);
    const bits = cover(walls, walls, H, 0.004);
    // Points 2k and 2k + 1 are layer k's run: every layer but the outer two has both flats covered.
    for (let k = 1; k + 1 < walls.length; k++) expect(bits[2 * k] & FLATS).toBe(FLATS);
  });

  test("a bridge over a 0.15 mm gap keeps its underside", () => {
    // Two walls below, 0.15 mm of air between their surfaces, and a bridge across them above.
    const below = [run(0.4, [0, 0, 10, 0]), run(0.4, [0, 0.57, 10, 0.57])];
    const bridge = run(0.6, [5, -0.3, 5, 0.9], "Bridge");
    expect(cover([bridge], [...below, bridge])[0] & COVER_BOTTOM).toBe(0);
  });

  test("support, raft and purge lines do not cover", () => {
    const overhang = run(0.6, [0, 0, 10, 0], "Overhang wall");
    for (const feat of ["Support", "Support interface", "Raft", "Brim", "Custom"]) {
      expect(cover([overhang], [run(0.4, [0, 0, 10, 0], feat), overhang])[0] & COVER_BOTTOM).toBe(0);
    }
  });

  test("layers 0.125 mm apart find each other", () => {
    const h = 0.125;
    const walls = [0.375, 0.5, 0.625].map((z) => run(z, [0, 0, 10, 0], "Outer wall", W, h));
    expect(cover([walls[1]], walls, h)[0] & FLATS).toBe(FLATS);
  });
});

describe("sides", () => {
  const layers = [0.4, 0.6, 0.8];
  /** A wall with a neighbour `gap` mm of air to its left (+y) on every layer. */
  const pair = (gap: number) => layers.flatMap((z) => [run(z, [0, 0, 10, 0]), run(z, [0, W + gap, 10, W + gap], "Inner wall")]);

  test("the side pressed against a neighbour is covered, the open one is not", () => {
    const all = pair(-0.04);
    const bits = cover([all[2]], all)[0];
    expect(bits & COVER_LEFT).toBe(COVER_LEFT);
    expect(bits & COVER_RIGHT).toBe(0);
  });

  test("walls with 0.03 mm of air between them keep their sides", () => {
    const all = pair(0.03);
    expect(cover([all[2]], all)[0] & (COVER_LEFT | COVER_RIGHT)).toBe(0);
  });

  test("a bead widening along its segment keeps the side where the neighbour stops touching", () => {
    // The neighbour hugs the wide end only: at the narrow end there is 0.1 mm of air.
    const all = layers.flatMap((z) => [run(z, [0, 0, 10, 0], "Outer wall", [0.42, 0.62]), run(z, [0, 0.52, 10, 0.52], "Inner wall")]);
    expect(cover([all[2]], all)[0] & COVER_LEFT).toBe(0);
  });

  test("a lone line round a bend does not hide its own sides", () => {
    const bends = stack(layers, [0, 0, 5, 0, 5, 5]);
    for (const b of cover([bends[1]], bends)) expect(b & (COVER_LEFT | COVER_RIGHT)).toBe(0);
  });

  test("a short segment across the back of a narrow slot keeps its outer side", () => {
    // A wall runs into a 0.13 mm slot and back out; the 0.2 mm segment at its far end faces open air.
    const pts = [0, 0, 5, 0, 5, 0.55, 5.2, 0.55, 5.2, 0, 10, 0];
    const walls = stack(layers, pts);
    const bits = cover([walls[1]], walls);
    expect(bits[2] & (COVER_LEFT | COVER_RIGHT)).not.toBe(COVER_LEFT | COVER_RIGHT);
  });
});

describe("round ends", () => {
  const layers = [0.4, 0.6, 0.8];
  /** A cut inner wall piece between an outer wall and the next inner wall, the rest of it unmeshed. */
  const buried = (pieceEnd = 5, aboveEnd = 10) => layers.flatMap((z) => [
    run(z, [0, 0, pieceEnd, 0], "Inner wall"),
    run(z, [pieceEnd, 0, z === 0.8 ? aboveEnd : 10, 0], "Inner wall"),
    run(z, [-1, 0.4, 11, 0.4]),
    run(z, [-1, -0.4, 11, -0.4], "Inner wall"),
  ]);

  test("an end buried in the wall it was cut from is covered, a free end is not", () => {
    const all = buried();
    const bits = cover([all[4]], all);
    expect(bits[1] & COVER_END).toBe(COVER_END);
    expect(bits[0] & COVER_END).toBe(0);
  });

  test("an end reaching past the layer above keeps its end", () => {
    // Above, the wall stops 0.1 mm after the piece's end point, short of its 0.21 mm round end.
    const all = buried(5, 5.1).filter((r) => !(r.z === 0.8 && r.pts[0] === 0));
    expect(cover([all[4]], all)[1] & COVER_END).toBe(0);
  });
});

describe("the sweep", () => {
  const layers = [0.4, 0.6, 0.8];
  const all = layers.flatMap((z) => [run(z, [0, 0, 10, 0]), run(z, [0, 0.38, 10, 0.38], "Inner wall")]);
  const shown = all.filter((r) => r.feat === "Outer wall");
  const cl = centreline(shown, H, 0);
  const culled = { ...cl, cover: coverFaces(cl, all, H, layerJitter(shown, 0)) };

  test("leaves out covered faces and the vertices only they used", () => {
    const plain = sweep(cl), mesh = sweep(culled);
    expect(mesh.word.length).toBeLessThan(plain.word.length);
    expect(Math.max(...mesh.index)).toBe(mesh.word.length - 1);
    expect(mesh.bboxM).toEqual(plain.bboxM);
    expect(mesh.tris).toBeLessThan(plain.tris);
    // The middle layer loses its top, bottom and inner side; the outer side always shows.
    expect(mesh.tris).toBeGreaterThan(plain.tris / 2);
  });

  test("the lite mesh keeps the cover of the segments it keeps whole", () => {
    expect(thin(culled).cover).toBeDefined();
    expect(sweep(thin(culled), true).tris).toBeLessThan(sweep(thin(cl), true).tris);
  });
});

describe("exact faces left out", () => {
  const layers = [0.4, 0.6, 0.8];
  const tris = (c: Centreline) => sweep(c).tris;

  test.each([["forwards", [0, 0, 10, 0]], ["backwards", [10, 0, 0, 0]]] as const)(
    "a wall with an inner neighbour, %s: the middle layer loses its flats and inner side, the outer layers one flat each", (_, pts) => {
      const all = layers.flatMap((z) => [run(z, pts), run(z, [0, 0.38, 10, 0.38], "Inner wall")]);
      const shown = all.filter((r) => r.feat === "Outer wall");
      const cl = centreline(shown, H, 0);
      const culled = { ...cl, cover: coverFaces(cl, all, H, layerJitter(shown, 0)) };
      // 2 triangles a quad: middle top, bottom and four inner side quads; the top layer's bottom; the lowest layer's top.
      expect(tris(culled)).toBe(tris(cl) - 2 * (6 + 1 + 1));
    });

  test("a buried round end goes the same at a run's start as at its end", () => {
    const piece = (pts: readonly number[]) => layers.flatMap((z) => [
      run(z, pts, "Inner wall"),
      run(z, [5, 0, 10, 0], "Inner wall"),
      run(z, [-1, 0.4, 11, 0.4]),
      run(z, [-1, -0.4, 11, -0.4], "Inner wall"),
    ]);
    const removed = (pts: readonly number[]) => {
      const all = piece(pts);
      const shown = [all[4]];
      const cl = centreline(shown, H, 0);
      const c = coverFaces(cl, all, H, layerJitter(shown, 0));
      const end = c.findIndex((b) => (b & COVER_END) !== 0);
      expect(end).toBeGreaterThanOrEqual(0);
      const kept = Uint8Array.from(c, (b) => b & ~COVER_END);
      return tris({ ...cl, cover: kept }) - tris({ ...cl, cover: c });
    };
    const atEnd = removed([0, 0, 5, 0]), atStart = removed([5, 0, 0, 0]);
    expect(atEnd).toBeGreaterThan(0);
    expect(atStart).toBe(atEnd);
  });
});
