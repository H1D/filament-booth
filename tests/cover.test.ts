import { describe, expect, test } from "vitest";
import { centreline } from "../src/print/centreline";
import { COVER_BOTTOM, COVER_END, COVER_LEFT, COVER_RIGHT, COVER_TOP, coverFlats } from "../src/print/cover";
import type { Run } from "../src/print/gcode";
import { sweep } from "../src/print/sweep";

const H = 0.2;
const W = 0.45;

/** A run along the given points (mm) at height z (mm). */
function run(z: number, pts: readonly number[], feat = "Outer wall"): Run {
  const n = pts.length / 2;
  return { feat, layer: Math.round(z / H) - 1, z, pts: [...pts], w: new Array(n).fill(W), v: new Array(n).fill(60) };
}

/** Cover bits of the first segment of the first run of `shown`, against everything in `all`. */
function bits(shown: Run[], all: Run[]): number[] {
  const cl = centreline(shown, H, 0);
  return [...coverFlats(cl, all, H)];
}

describe("flats", () => {
  const wall = (z: number, dy = 0) => run(z, [0, dy, 10, dy]);

  test("a wall between two layers is covered above and below", () => {
    const [first] = bits([wall(0.6)], [wall(0.4), wall(0.6), wall(0.8)]);
    expect(first & (COVER_TOP | COVER_BOTTOM)).toBe(COVER_TOP | COVER_BOTTOM);
  });

  test("the top layer's top and the lowest layer's bottom stay", () => {
    expect(bits([wall(0.6)], [wall(0.4), wall(0.6)])[0] & COVER_TOP).toBe(0);
    expect(bits([wall(0.4)], [wall(0.4), wall(0.6)])[0] & COVER_BOTTOM).toBe(0);
  });

  test("a layer stepped sideways by 0.1 mm leaves the flat below showing", () => {
    expect(bits([wall(0.4)], [wall(0.4), wall(0.6, 0.1)])[0] & COVER_TOP).toBe(0);
  });
});

describe("sides", () => {
  test("the side pressed against a neighbouring line is covered, the open one is not", () => {
    // Travelling +x, the right side faces -y. The neighbour lies 0.4 mm to the left (+y).
    const line = run(0.4, [0, 0, 10, 0]);
    const neighbour = run(0.4, [0, 0.4, 10, 0.4], "Inner wall");
    const [first] = bits([line], [line, neighbour]);
    expect(first & COVER_LEFT).toBe(COVER_LEFT);
    expect(first & COVER_RIGHT).toBe(0);
  });

  test("a lone line round a sharp bend does not hide its own sides", () => {
    const bend = run(0.4, [0, 0, 5, 0, 5, 5]);
    const cover = bits([bend], [bend]);
    for (const c of cover) expect(c & (COVER_LEFT | COVER_RIGHT)).toBe(0);
  });
});

describe("round ends", () => {
  test("an end buried in the wall it was cut from is covered, a free end is not", () => {
    // A piece of inner wall between an outer wall and the next inner wall, the rest of it unmeshed.
    const piece = run(0.4, [0, 0, 5, 0], "Inner wall");
    const rest = run(0.4, [5, 0, 10, 0], "Inner wall");
    const beside = [run(0.4, [-1, 0.4, 11, 0.4]), run(0.4, [-1, -0.4, 11, -0.4], "Inner wall")];
    const cover = bits([piece], [piece, rest, ...beside]);
    expect(cover[1] & COVER_END).toBe(COVER_END);
    expect(cover[0] & COVER_END).toBe(0);
  });
});

describe("the sweep", () => {
  test("leaves out covered faces and keeps every vertex", () => {
    const layers = [0.4, 0.6, 0.8].flatMap((z) => [run(z, [0, 0, 10, 0]), run(z, [0, 0.4, 10, 0.4], "Inner wall")]);
    const shown = layers.filter((r) => r.feat === "Outer wall");
    const cl = centreline(shown, H, 0);
    const plain = sweep(cl);
    const culled = sweep({ ...cl, cover: coverFlats(cl, layers, H) });
    expect(culled.position).toEqual(plain.position);
    expect(culled.tris).toBeLessThan(plain.tris);
    // The middle layer loses its top, bottom and inner side; the outer side always shows.
    expect(culled.tris).toBeGreaterThan(plain.tris / 2);
  });
});
