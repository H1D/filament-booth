import { describe, expect, test } from "vitest";
import { BEAD_WORD, packBeadWord, type WordField } from "../src/print";
import { PIXEL_SIGMA, jitterSample } from "../src/viewport/accumulate";
import { BUDGET_MS, LEVELS, QualityState, looksSlow } from "../src/viewport/quality";

/** The bead shader's decode, step for step in float32: floor(word / scale) mod size. */
const shaderField = (word: number, f: WordField): number => {
  const w = Math.fround(word);
  return Math.fround(Math.floor(Math.fround(w / f.scale)) % f.size);
};

describe("BEAD_WORD in the shader", () => {
  test("every packable word is an exact float32, so the shader's float arithmetic is exact", () => {
    const max = packBeadWord(3, BEAD_WORD.layer.size - 1, BEAD_WORD.speed.size - 1);
    expect(max).toBeLessThan(2 ** 24);
    expect(Math.fround(max)).toBe(max);
  });

  test("the shader's field constants recover feature, layer and speed from packed words", () => {
    let seed = 7;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let i = 0; i < 5000; i++) {
      const f = rand(4), l = rand(BEAD_WORD.layer.size), s = rand(BEAD_WORD.speed.size);
      const w = packBeadWord(f, l, s);
      expect([shaderField(w, BEAD_WORD.feature), shaderField(w, BEAD_WORD.layer), shaderField(w, BEAD_WORD.speed)]).toEqual([f, l, s]);
    }
  });

  test("an interpolated word one ulp short of its integer decodes to the wrong feature: why the shader reads it flat", () => {
    const w = packBeadWord(0, 400, 60);
    const ulpShort = w - 2 ** (Math.floor(Math.log2(w)) - 23);
    expect(shaderField(ulpShort, BEAD_WORD.feature)).toBe(3);
  });
});

describe("jitter", () => {
  const n = 4096, samples = Array.from({ length: n }, (_, i) => jitterSample(i));

  test("pixel offsets follow the Gaussian pixel filter", () => {
    const xs = samples.flatMap((s) => [s.pixel[0], s.pixel[1]]);
    const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(sd).toBeCloseTo(PIXEL_SIGMA, 2);
  });

  test("lens points cover the unit disc uniformly and key points the centred unit square", () => {
    const r2 = samples.map((s) => s.lens[0] ** 2 + s.lens[1] ** 2);
    expect(Math.max(...r2)).toBeLessThanOrEqual(1);
    expect(r2.reduce((a, x) => a + x, 0) / n).toBeCloseTo(0.5, 2);
    for (const s of samples) for (const k of s.key) expect(Math.abs(k)).toBeLessThanOrEqual(0.5);
  });
});

describe("quality ladder", () => {
  test("a slow frame drops as many levels as its overrun needs, at 0.7x a level", () => {
    const q = new QualityState(false);
    for (let i = 0; i < 4; i++) q.adapt(BUDGET_MS * 2);
    expect(q.level).toBe(Math.ceil(Math.log(2) / Math.log(1 / 0.7)));
  });

  test("a hitch is not a trend: the slowest eighth is left out", () => {
    const q = new QualityState(false);
    for (let i = 0; i < 7; i++) q.adapt(BUDGET_MS * 0.8);
    q.adapt(BUDGET_MS * 20);
    expect(q.level).toBe(0);
  });

  test("thirty frames under half the budget climb one level, and the lowest level still too slow latches the lite mesh", () => {
    const q = new QualityState(false);
    q.level = 3;
    for (let i = 0; i < 30; i++) q.adapt(BUDGET_MS * 0.3);
    expect(q.level).toBe(2);
    q.level = LEVELS.length - 1;
    for (let i = 0; i < 4; i++) q.adapt(BUDGET_MS * 1.5);
    expect(q.lite).toBe(true);
    expect(q.setting(true)).toEqual({ renderScale: 0.3, aoScale: 0.5, lite: true });
    expect(q.setting(false)).toEqual({ renderScale: 1, aoScale: 1, lite: false });
  });

  test("integrated GPUs and coarse pointers start at half scale on the lite mesh", () => {
    expect(looksSlow("ANGLE (Intel, Mesa Intel(R) UHD 620)", false)).toBe(true);
    expect(looksSlow("nvidia ampere", false)).toBe(false);
    expect(new QualityState(true).setting(true).renderScale).toBe(0.5);
  });
});
