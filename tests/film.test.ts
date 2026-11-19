import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { AGX_LOOKS, type AgxLook } from "../src/document";
import { agx, downscaleFrame, loadAgx, parseAgx, parseManifest, toneMapFrame, type AgxData, type RadianceFrame } from "../src/film";

const LUT_DIR = new URL("../public/lut/", import.meta.url);
const FIXTURES = new URL("./fixtures/", import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL("manifest.json", LUT_DIR), "utf8")));

const loaded = new Map<AgxLook, AgxData>();
function lut(look: AgxLook): AgxData {
  let data = loaded.get(look);
  if (!data) {
    const entry = manifest.looks[look];
    data = parseAgx(manifest, look, readFileSync(new URL(manifest.base.file, LUT_DIR)), entry === null ? null : readFileSync(new URL(entry.file, LUT_DIR)));
    loaded.set(look, data);
  }
  return data;
}

// Linear Rec.709 probes through Blender 5.2.3's AgX view with every look, as 16-bit display sRGB.
// Written by tools/blender/agx_truth.py: Image.save_render with the scene's view settings, dither off.
interface ProbeFixture {
  fixed: number; // the first `fixed` probes are the hand-picked set, the rest are seeded random
  probes: [number, number, number][];
  looks: Record<AgxLook, [number, number, number][]>;
}
const fixture: ProbeFixture = JSON.parse(readFileSync(new URL("agx-probes.json", FIXTURES), "utf8"));

const grey = (v: number): [number, number, number] => [v, v, v];

/** Worst channel difference to Blender over probes [from, to), in 8-bit levels, no rounding. */
function worstDifference(look: AgxLook, from: number, to: number, keep: (rgb: [number, number, number]) => boolean = () => true): number {
  const data = lut(look);
  let worst = 0;
  for (let i = from; i < to; i++) {
    if (!keep(fixture.probes[i])) continue;
    const got = agx(fixture.probes[i], data);
    fixture.looks[look][i].forEach((v, k) => {
      worst = Math.max(worst, Math.abs(got[k] * 255 - (v / 65535) * 255));
    });
  }
  return worst;
}

describe("the shipped LUT files", () => {
  test("every look is listed, and only 'none' has no warp file", () => {
    expect(Object.keys(manifest.looks).sort()).toEqual([...AGX_LOOKS].sort());
    for (const look of AGX_LOOKS) expect(manifest.looks[look] === null).toBe(look === "none");
  });

  test("each file decodes to the size the manifest promises, within 0..1 for the cube", () => {
    for (const look of AGX_LOOKS) {
      const data = lut(look);
      expect(data.base).toHaveLength(manifest.base.size ** 3 * 3);
      expect(data.pre?.values.length ?? 0).toBe((manifest.looks[look]?.size ?? 0) ** 3 * 3);
    }
    const cube = lut("none").base;
    expect(cube.reduce((lo, v) => Math.min(lo, v), Infinity)).toBeGreaterThanOrEqual(0);
    expect(cube.reduce((hi, v) => Math.max(hi, v), -Infinity)).toBeLessThanOrEqual(1.0005);
  });

  test("half floats decode exactly, including negatives, subnormals and the largest value", () => {
    const tiny = { ...manifest, base: { file: "", size: 2 }, looks: { ...manifest.looks, none: null } };
    const halves = [0x3c00, 0xc000, 0x3800, 0x7bff, 0x0001, 0x0000, 0xb400, 0x3555];
    const bytes = new Uint8Array(2 * 2 * 2 * 3 * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < 24; i++) view.setUint16(i * 2, halves[i % halves.length], true);
    const data = parseAgx(tiny, "none", bytes, null);
    expect([...data.base.slice(0, 8)]).toEqual([1, -2, 0.5, 65504, 2 ** -24, 0, -0.25, Math.fround(0.333251953125)]);
  });

  test("a file of the wrong size, or a look file the manifest does not expect, is refused", () => {
    expect(() => parseAgx(manifest, "none", new Uint8Array(10), null)).toThrow(/bytes, expected/);
    const base = readFileSync(new URL(manifest.base.file, LUT_DIR));
    expect(() => parseAgx(manifest, "none", base, base)).toThrow(/does not match the manifest/);
    expect(() => parseAgx(manifest, "punchy", base, null)).toThrow(/does not match the manifest/);
  });

  test("the manifest is checked at the boundary", () => {
    expect(() => parseManifest({ format: "agx-lut-1" })).toThrow(/unknown format/);
    expect(() => parseManifest({ ...manifest, toWorking: [1, 2, 3] })).toThrow(/toWorking/);
    expect(() => parseManifest({ ...manifest, looks: { ...manifest.looks, punchy: 3 } })).toThrow(/look punchy/);
    expect(() => parseManifest({ ...manifest, tFloor: "low" })).toThrow(/tFloor/);
  });
});

describe("loadAgx", () => {
  const serve = (calls: string[]) =>
    vi.fn(async (url: string) => {
      calls.push(url);
      const path = url.replace("http://lut.test/", "");
      try {
        return new Response(readFileSync(new URL(path, LUT_DIR)));
      } catch {
        return new Response("missing", { status: 404 });
      }
    });

  test("fetches the manifest, the cube and the look once, and matches what Node reads from disk", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", serve(calls));
    try {
      const fetched = await loadAgx("punchy", "http://lut.test/");
      await loadAgx("punchy", "http://lut.test/");
      await loadAgx("high-contrast", "http://lut.test/");
      expect(calls.sort()).toEqual(
        ["agx-base.bin", "agx-high-contrast.bin", "agx-punchy.bin", "manifest.json"].map((f) => `http://lut.test/${f}`),
      );
      expect(agx([0.18, 0.4, 0.05], fetched)).toEqual(agx([0.18, 0.4, 0.05], lut("punchy")));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("a failed fetch rejects and the next call tries again", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", serve(calls));
    try {
      await expect(loadAgx("none", "http://lut.test/missing/")).rejects.toThrow(/404/);
      await expect(loadAgx("none", "http://lut.test/missing/")).rejects.toThrow(/404/);
      expect(calls).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the shader recipe in film.ts", () => {
  // Written from the doc comment alone, the way a fragment shader would do it: texture coordinates for the
  // warp (hardware trilinear, texel centres at (k + 0.5) / N), nearest texelFetch for the cube.
  function shader(rgb: [number, number, number], data: AgxData): [number, number, number] {
    const { toWorking: M, log2Min, log2Max, preLog2Max, tFloor } = data.manifest;
    const texel = (grid: Float32Array, n: number, x: number, y: number, z: number) => {
      const o = ((z * n + y) * n + x) * 3;
      return [grid[o], grid[o + 1], grid[o + 2]];
    };
    const filtered = (grid: Float32Array, n: number, [u, v, w]: number[]) => {
      const axis = (c: number) => {
        const p = c * n - 0.5;
        const i0 = Math.floor(p);
        return { i: [Math.min(Math.max(i0, 0), n - 1), Math.min(Math.max(i0 + 1, 0), n - 1)], f: p - i0 };
      };
      const [ax, ay, az] = [axis(u), axis(v), axis(w)];
      const out = [0, 0, 0];
      for (const [bx, wx] of [[0, 1 - ax.f], [1, ax.f]]) for (const [by, wy] of [[0, 1 - ay.f], [1, ay.f]]) for (const [bz, wz] of [[0, 1 - az.f], [1, az.f]]) {
        texel(grid, n, ax.i[bx], ay.i[by], az.i[bz]).forEach((c, k) => { out[k] += c * wx * wy * wz; });
      }
      return out;
    };
    const e = [0, 1, 2].map((r) => M[r * 3] * rgb[0] + M[r * 3 + 1] * rgb[1] + M[r * 3 + 2] * rgb[2]);
    let t = e.map((v) => Math.max((Math.log2(Math.max(v, 1e-30)) - log2Min) / (log2Max - log2Min), tFloor));
    if (data.pre) {
      const n = data.pre.size;
      const s = rgb.map((v) => Math.min(Math.max((Math.log2(Math.max(v, 1e-30)) - log2Min) / (preLog2Max - log2Min), 0), 1));
      const warp = filtered(data.pre.values, n, s.map((x) => (x * (n - 1) + 0.5) / n));
      t = t.map((x, k) => x + warp[k]);
    }
    const nb = manifest.base.size;
    const u = t.map((x) => Math.min(Math.max(x, 0), 1) * (nb - 1));
    const i = u.map((x) => Math.min(Math.floor(x), nb - 2));
    const f = u.map((x, k) => x - i[k]);
    const order = [0, 1, 2].sort((a, b) => f[b] - f[a]);
    const [a, b] = order;
    const step = (axes: number[]) => i.map((v, k) => v + (axes.includes(k) ? 1 : 0));
    const fetch = (corner: number[]) => texel(data.base, nb, corner[0], corner[1], corner[2]);
    const fa = f[order[0]], fb = f[order[1]], fc = f[order[2]];
    const parts: [number, number[]][] = [[1 - fa, i], [fa - fb, step([a])], [fb - fc, step([a, b])], [fc, step([0, 1, 2])]];
    const encode = (k: number) => {
      const c = Math.max(parts.reduce((sum, [w, corner]) => sum + w * fetch(corner)[k], 0), 0) ** 2.4;
      return Math.min(Math.max(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055, 0), 1);
    };
    return [encode(0), encode(1), encode(2)];
  }

  test("reproduces agx() on every probe, for every look", () => {
    for (const look of AGX_LOOKS) {
      for (const p of fixture.probes) {
        const want = agx(p, lut(look));
        shader(p, lut(look)).forEach((v, k) => expect(Math.abs(v - want[k]) * 255, `${look} ${p}`).toBeLessThan(1e-4));
      }
    }
  });
});

describe("agx", () => {
  test("black stays black and a huge value stays inside 0..1", () => {
    const data = lut("medium-high-contrast");
    for (const v of agx([0, 0, 0], data)) expect(v).toBeLessThan(0.01 / 255);
    for (const v of agx([1e6, 1e6, 1e6], data)) expect(v).toBeLessThanOrEqual(1);
    for (const v of agx([-1, -2, -3], data)) expect(v).toBeGreaterThanOrEqual(0);
  });

  test("greys stay grey and brightness only ever rises with the input", () => {
    for (const look of AGX_LOOKS) {
      let last = -1;
      for (const v of [0.001, 0.01, 0.05, 0.18, 0.5, 1, 2, 4, 8]) {
        const [r, g, b] = agx(grey(v), lut(look));
        expect(Math.abs(r - g)).toBeLessThan(0.003);
        expect(Math.abs(g - b)).toBeLessThan(0.003);
        expect(g, `${look} at ${v}`).toBeGreaterThanOrEqual(last);
        last = g;
      }
    }
  });

  test("more contrast darkens shadows and brightens highlights, and leaves scene grey 0.18 alone", () => {
    const at = (v: number, look: AgxLook) => agx(grey(v), lut(look))[1];
    expect(at(0.18, "high-contrast")).toBeCloseTo(at(0.18, "low-contrast"), 2);
    expect(at(0.02, "high-contrast")).toBeLessThan(at(0.02, "low-contrast"));
    expect(at(2, "high-contrast")).toBeGreaterThan(at(2, "low-contrast"));
  });
});

describe("agx against native Blender 5.2.3", () => {
  // The target is 2/255. The bake is held to 1/255, which is what its grid sizes were chosen for.
  const TARGET = 2;
  const BAKE = 1;

  test("the fixture has the hand-picked set and at least 200 random probes", () => {
    expect(fixture.fixed).toBeGreaterThanOrEqual(29);
    expect(fixture.probes.length - fixture.fixed).toBeGreaterThanOrEqual(200);
    const random = fixture.probes.slice(fixture.fixed);
    expect(Math.min(...random.flat().filter((v) => v > 0))).toBeLessThan(2 ** -9);
    expect(Math.max(...random.flat())).toBeGreaterThan(2 ** 5);
    expect(random.some((p) => p.includes(0))).toBe(true);
  });

  for (const look of AGX_LOOKS) {
    test(`${look}: hand-picked probes are within ${BAKE}/255`, () => {
      const worst = worstDifference(look, 0, fixture.fixed);
      expect(worst).toBeLessThanOrEqual(TARGET);
      expect(worst).toBeLessThanOrEqual(BAKE);
    });

    test(`${look}: random probes from deep shadow to six stops over white are within ${BAKE}/255`, () => {
      const worst = worstDifference(look, fixture.fixed, fixture.probes.length);
      expect(worst).toBeLessThanOrEqual(TARGET);
      expect(worst).toBeLessThanOrEqual(BAKE);
    });
  }

  test("Medium High Contrast mid-greys, 0.1 to 0.5, are within 2/255 of Blender", () => {
    const midGrey = ([r, g, b]: [number, number, number]) => r === g && g === b && r >= 0.1 && r <= 0.5;
    expect(worstDifference("medium-high-contrast", 0, fixture.fixed, midGrey)).toBeLessThanOrEqual(TARGET);
  });
});

describe("a real frame against native Blender 5.2.3", () => {
  // A Cycles render of six spheres on a floor: linear float in, and the 8-bit PNG Blender writes for it with
  // AgX and Medium High Contrast, dither off. 25% of its pixels have a channel over 1.0.
  const info: { width: number; height: number } = JSON.parse(readFileSync(new URL("agx-image.json", FIXTURES), "utf8"));
  const f32 = readFileSync(new URL("agx-image.f32", FIXTURES));
  const blender = readFileSync(new URL("agx-image.u8", FIXTURES));
  const frame: RadianceFrame = {
    width: info.width,
    height: info.height,
    samples: 48,
    rgba: new Float32Array(f32.buffer.slice(f32.byteOffset, f32.byteOffset + f32.byteLength)),
  };

  test("every pixel is within one 8-bit level, and the mean difference is a few hundredths of a level", () => {
    const ours = toneMapFrame(frame, lut("medium-high-contrast"));
    let worst = 0;
    let sum = 0;
    for (let i = 0; i < ours.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(ours[i + c] - blender[i + c]);
        worst = Math.max(worst, d);
        sum += d;
      }
      expect(ours[i + 3]).toBe(blender[i + 3]);
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(sum / (info.width * info.height * 3)).toBeLessThan(0.05);
  });
});

describe("toneMapFrame", () => {
  const frame = (rgba: number[], width = rgba.length / 4): RadianceFrame => ({ width, height: rgba.length / 4 / width, samples: 1, rgba: Float32Array.from(rgba) });

  test("maps each pixel as agx() does and writes 8-bit RGBA", () => {
    const data = lut("medium-high-contrast");
    const out = toneMapFrame(frame([0.18, 0.18, 0.18, 1, 0.8, 0.3, 0.1, 1]), data);
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out).toHaveLength(8);
    const expected = [...agx([0.18, 0.18, 0.18], data), ...agx([0.8, 0.3, 0.1], data)];
    [0, 1, 2, 4, 5, 6].forEach((o, k) => expect(out[o]).toBe(Math.round(expected[k] * 255)));
    expect([out[3], out[7]]).toEqual([255, 255]);
  });

  test("un-premultiplies so a half-covered pixel shows the colour it would have at full cover", () => {
    const covered = toneMapFrame(frame([0.4, 0.4, 0.4, 1]), lut("none"));
    const half = toneMapFrame(frame([0.2, 0.2, 0.2, 0.5]), lut("none"));
    expect([half[0], half[1], half[2]]).toEqual([covered[0], covered[1], covered[2]]);
    expect(half[3]).toBe(128);
  });

  test("an empty pixel is transparent black and bad samples read as zero", () => {
    expect([...toneMapFrame(frame([0.5, 0.5, 0.5, 0]), lut("none"))]).toEqual([0, 0, 0, 0]);
    const out = toneMapFrame(frame([NaN, Infinity, -Infinity, 1]), lut("none"));
    expect([...out]).toEqual([0, 0, 0, 255]);
  });

  test("keeps the frame's size and handles a whole image quickly", () => {
    const w = 400, h = 500;
    const big = { width: w, height: h, samples: 1, rgba: new Float32Array(w * h * 4).fill(0.25) };
    const started = performance.now();
    const out = toneMapFrame(big, lut("medium-high-contrast"));
    expect(out).toHaveLength(w * h * 4);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("downscaleFrame", () => {
  test("returns the same frame when it already fits", () => {
    const f: RadianceFrame = { width: 4, height: 2, samples: 3, rgba: new Float32Array(32) };
    expect(downscaleFrame(f, 8)).toBe(f);
  });

  test("averages in linear light and keeps the aspect", () => {
    const rgba = new Float32Array(4 * 4 * 4);
    // A checkerboard of 1 and 0: every 2x2 block averages 0.5, where averaging encoded values would not.
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rgba.set((x + y) % 2 === 0 ? [1, 1, 1, 1] : [0, 0, 0, 1], (y * 4 + x) * 4);
    const small = downscaleFrame({ width: 4, height: 4, samples: 9, rgba }, 2);
    expect([small.width, small.height, small.samples]).toEqual([2, 2, 9]);
    expect(Array.from(small.rgba)).toEqual([0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1]);
    const wide = downscaleFrame({ width: 8, height: 2, samples: 1, rgba: new Float32Array(64) }, 4);
    expect([wide.width, wide.height]).toEqual([4, 1]);
  });
});
