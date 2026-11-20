/**
 * The parts of the denoiser that need no GPU. tools/denoise/run.ts checks the network itself
 * against Intel's oidnDenoise.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ALIGN, autoexposure, OVERLAP, parseTza, planTiles, type Tile } from "../src/photo/denoise";

describe("the weights", () => {
  const weights = parseTza(new Uint8Array(readFileSync(new URL("../public/oidn/rt_hdr_alb_nrm.tza", import.meta.url))));

  test("are OIDN's UNet for colour, albedo and normal", () => {
    expect(weights.size).toBe(32);
    expect(weights.get("enc_conv0.weight")?.dims).toEqual([32, 9, 3, 3]);
    expect(weights.get("dec_conv1a.weight")?.dims).toEqual([64, 73, 3, 3]);
    expect(weights.get("dec_conv0.weight")?.dims).toEqual([3, 32, 3, 3]);
    const params = [...weights.values()].reduce((sum, t) => sum + t.data.length, 0);
    expect(params).toBe(919811);
  });

  test("decode to finite values", () => {
    for (const t of weights.values()) expect(t.data.every(Number.isFinite)).toBe(true);
  });

  test("a file that is not TZA is refused", () => {
    expect(() => parseTza(new Uint8Array(16))).toThrow("not a TZA file");
  });
});

describe("tiles", () => {
  /** Every output pixel is written by exactly one tile. */
  function coverage(tiles: readonly Tile[], width: number, height: number): Uint8Array {
    const seen = new Uint8Array(width * height);
    for (const t of tiles) for (let y = t.oy; y < t.oy + t.oh; y++) for (let x = t.ox; x < t.ox + t.ow; x++) seen[y * width + x]++;
    return seen;
  }

  test("one tile when it fits, padded to the alignment", () => {
    expect(planTiles(1600, 2000, 4e6)).toEqual([{ x: 0, y: 0, w: 1600, h: 2000, tw: 1600, th: 2000, ox: 0, oy: 0, ow: 1600, oh: 2000 }]);
    const [odd] = planTiles(1001, 777, 4e6);
    expect([odd.tw, odd.th]).toEqual([1008, 784]);
  });

  test.each([[1600, 2000, 600_000], [1001, 777, 120_000], [640, 400, 100_000], [4096, 3277, 1_000_000]])(
    "%i x %i in tiles of at most %i pixels: covered once, aligned, overlapped", (width, height, maxPixels) => {
      const tiles = planTiles(width, height, maxPixels);
      expect(tiles.length).toBeGreaterThan(1);
      expect(coverage(tiles, width, height).every((n) => n === 1)).toBe(true);
      for (const t of tiles) {
        expect(t.tw * t.th).toBeLessThanOrEqual(maxPixels);
        expect(t.x % ALIGN).toBe(0);
        expect(t.y % ALIGN).toBe(0);
        expect([t.tw % ALIGN, t.th % ALIGN]).toEqual([0, 0]);
        // The network reads OVERLAP pixels past what the tile writes, or up to the image edge.
        expect(t.ox - t.x).toBe(Math.min(t.ox, OVERLAP));
        expect(t.x + t.w - (t.ox + t.ow)).toBe(Math.min(width - (t.ox + t.ow), OVERLAP));
        expect(t.oy - t.y).toBe(Math.min(t.oy, OVERLAP));
        expect(t.y + t.h - (t.oy + t.oh)).toBe(Math.min(height - (t.oy + t.oh), OVERLAP));
      }
    });
});

describe("autoexposure", () => {
  const flat = (width: number, height: number, v: number) => new Float32Array(width * height * 4).fill(v);

  test("scales mid grey to 0.18", () => {
    expect(autoexposure(flat(40, 30, 0.5), 40, 30)).toBeCloseTo(0.36, 6);
  });

  test("is 1 for a black frame", () => {
    expect(autoexposure(flat(40, 30, 0), 40, 30)).toBe(1);
  });

  test("reads NaN and negative samples as black", () => {
    const rgba = flat(32, 16, 0.5);
    rgba.fill(Number.NaN, 0, 16 * 4);
    rgba.fill(-1, 16 * 4, 32 * 4);
    // The first row of the left bin is now black, so that bin averages 15/16 of 0.5.
    const left = Math.log2(0.5 * (15 / 16));
    const right = Math.log2(0.5 * (15 / 16));
    expect(autoexposure(rgba, 32, 16)).toBeCloseTo(0.18 / 2 ** ((left + right) / 2), 6);
  });
});
