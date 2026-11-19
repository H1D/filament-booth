import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { AGX_LOOKS, type AgxLook } from "../src/document";
import { AGX, agx, downscaleFrame, toneMapFrame, type RadianceFrame } from "../src/film";

// Linear Rec.709 probes through Blender 5.2.3's AgX view with each look, as
// 8-bit sRGB values. Printed by tools/blender/agx_truth.py (Image.save_render
// with the scene's view settings, 16-bit PNG, dither off). Greys are one value
// because Blender returns equal channels for a grey; colours are r, g, b in
// then R, G, B out.
interface BlenderProbes {
  greys: [number, number][];
  colours: [number, number, number, number, number, number][];
}
const BLENDER: Record<AgxLook, BlenderProbes> = {
  "none": {
    greys: [[0.0, 0.0], [0.002, 2.6], [0.01, 18.5], [0.03, 42.0], [0.05, 57.9], [0.1, 86.8], [0.18, 117.6], [0.25, 135.7], [0.35, 153.0], [0.5, 169.6], [0.7, 183.5], [1.0, 196.6], [1.5, 209.3], [2.0, 217.2], [4.0, 233.0], [8.0, 245.2], [16.0, 254.6], [0.55, 173.9]],
    colours: [
      [0.18, 0.02, 0.02, 113.9, 33.1, 29.1],
      [0.02, 0.18, 0.02, 33.5, 111.6, 27.0],
      [0.02, 0.02, 0.18, 26.6, 46.7, 117.1],
      [0.8, 0.3, 0.1, 196.1, 142.0, 102.6],
      [0.4, 0.25, 0.2, 160.1, 135.3, 124.8],
      [1.0, 0.0, 0.0, 218.8, 57.1, 32.9],
      [0.0, 1.0, 0.0, 110.3, 197.0, 81.2],
      [0.0, 0.0, 1.0, 20.2, 86.1, 209.5],
      [0.9, 0.8, 0.1, 195.5, 184.7, 122.4],
      [0.1, 0.6, 0.7, 124.4, 177.7, 184.9],
      [0.0116, 0.0116, 0.0116, 21.1, 21.1, 21.1],
    ],
  },
  "punchy": {
    greys: [[0.0, 0.3], [0.002, 0.5], [0.01, 2.6], [0.03, 19.6], [0.05, 34.7], [0.1, 61.1], [0.18, 88.3], [0.25, 105.3], [0.35, 124.1], [0.5, 143.6], [0.7, 160.5], [1.0, 176.5], [1.5, 192.5], [2.0, 202.4], [4.0, 222.3], [8.0, 237.5], [16.0, 249.1], [0.55, 148.5]],
    colours: [
      [0.18, 0.02, 0.02, 83.7, 4.2, 0.9],
      [0.02, 0.18, 0.02, 12.4, 82.5, 1.3],
      [0.02, 0.02, 0.18, 0.1, 24.8, 86.0],
      [0.8, 0.3, 0.1, 171.9, 112.8, 67.6],
      [0.4, 0.25, 0.2, 131.0, 104.8, 93.7],
      [1.0, 0.0, 0.0, 186.3, 29.4, 0.0],
      [0.0, 1.0, 0.0, 70.3, 175.1, 29.4],
      [0.0, 0.0, 1.0, 4.6, 66.6, 180.5],
      [0.9, 0.8, 0.1, 174.3, 162.1, 83.9],
      [0.1, 0.6, 0.7, 85.9, 153.0, 161.7],
      [0.0116, 0.0116, 0.0116, 3.3, 3.3, 3.3],
    ],
  },
  "low-contrast": {
    greys: [[0.0, 0.4], [0.002, 8.7], [0.01, 29.3], [0.03, 52.7], [0.05, 67.4], [0.1, 92.4], [0.18, 117.6], [0.25, 132.2], [0.35, 146.4], [0.5, 160.5], [0.7, 172.5], [1.0, 184.1], [1.5, 195.9], [2.0, 203.4], [4.0, 219.0], [8.0, 231.7], [16.0, 242.0], [0.55, 163.9]],
    colours: [
      [0.18, 0.02, 0.02, 122.4, 44.8, 40.7],
      [0.02, 0.18, 0.02, 50.1, 114.6, 40.1],
      [0.02, 0.02, 0.18, 38.3, 57.1, 125.4],
      [0.8, 0.3, 0.1, 185.5, 136.9, 100.9],
      [0.4, 0.25, 0.2, 153.8, 131.5, 121.9],
      [1.0, 0.0, 0.0, 209.1, 69.4, 49.9],
      [0.0, 1.0, 0.0, 106.5, 185.5, 79.2],
      [0.0, 0.0, 1.0, 54.5, 93.5, 201.7],
      [0.9, 0.8, 0.1, 183.7, 173.9, 114.6],
      [0.1, 0.6, 0.7, 118.4, 168.1, 174.9],
      [0.0116, 0.0116, 0.0116, 32.0, 32.0, 32.0],
    ],
  },
  "medium-low-contrast": {
    greys: [[0.0, 0.1], [0.002, 4.8], [0.01, 23.5], [0.03, 47.1], [0.05, 62.6], [0.1, 89.6], [0.18, 117.6], [0.25, 133.9], [0.35, 149.7], [0.5, 165.0], [0.7, 178.1], [1.0, 190.5], [1.5, 202.8], [2.0, 210.6], [4.0, 226.4], [8.0, 238.9], [16.0, 248.8], [0.55, 168.9]],
    colours: [
      [0.18, 0.02, 0.02, 118.3, 38.6, 34.7],
      [0.02, 0.18, 0.02, 41.3, 113.2, 33.1],
      [0.02, 0.02, 0.18, 31.8, 51.6, 121.6],
      [0.8, 0.3, 0.1, 191.0, 139.5, 101.4],
      [0.4, 0.25, 0.2, 157.1, 133.4, 123.3],
      [1.0, 0.0, 0.0, 214.4, 63.3, 41.2],
      [0.0, 1.0, 0.0, 108.0, 191.5, 79.6],
      [0.0, 0.0, 1.0, 45.7, 91.3, 205.2],
      [0.9, 0.8, 0.1, 189.7, 179.3, 118.2],
      [0.1, 0.6, 0.7, 121.2, 173.1, 180.1],
      [0.0116, 0.0116, 0.0116, 26.2, 26.2, 26.2],
    ],
  },
  "medium-high-contrast": {
    greys: [[0.0, 0.0], [0.002, 0.6], [0.01, 10.2], [0.03, 33.0], [0.05, 49.5], [0.1, 81.1], [0.18, 117.6], [0.25, 139.2], [0.35, 159.6], [0.5, 178.2], [0.7, 193.5], [1.0, 207.5], [1.5, 220.6], [2.0, 228.6], [4.0, 244.1], [8.0, 255.0], [16.0, 255.0], [0.55, 182.8]],
    colours: [
      [0.18, 0.02, 0.02, 109.8, 17.3, 14.2],
      [0.02, 0.18, 0.02, 15.8, 109.6, 4.7],
      [0.02, 0.02, 0.18, 2.8, 37.8, 114.0],
      [0.8, 0.3, 0.1, 208.3, 145.3, 99.7],
      [0.4, 0.25, 0.2, 167.8, 138.4, 126.1],
      [1.0, 0.0, 0.0, 230.8, 48.2, 23.5],
      [0.0, 1.0, 0.0, 104.1, 208.8, 72.0],
      [0.0, 0.0, 1.0, 36.6, 89.4, 218.8],
      [0.9, 0.8, 0.1, 206.8, 194.5, 124.4],
      [0.1, 0.6, 0.7, 126.8, 186.8, 195.3],
      [0.0116, 0.0116, 0.0116, 12.6, 12.6, 12.6],
    ],
  },
  "high-contrast": {
    greys: [[0.0, 0.0], [0.002, 0.0], [0.01, 4.9], [0.03, 25.4], [0.05, 42.0], [0.1, 75.9], [0.18, 117.6], [0.25, 142.7], [0.35, 165.6], [0.5, 186.4], [0.7, 202.6], [1.0, 217.0], [1.5, 230.4], [2.0, 238.1], [4.0, 252.8], [8.0, 255.0], [16.0, 255.0], [0.55, 191.2]],
    colours: [
      [0.18, 0.02, 0.02, 101.3, 2.7, 1.1],
      [0.02, 0.18, 0.02, 11.1, 106.0, 3.8],
      [0.02, 0.02, 0.18, 0.1, 30.5, 105.5],
      [0.8, 0.3, 0.1, 217.3, 150.0, 100.9],
      [0.4, 0.25, 0.2, 174.0, 142.2, 128.6],
      [1.0, 0.0, 0.0, 236.8, 52.1, 40.1],
      [0.0, 1.0, 0.0, 106.0, 218.2, 72.9],
      [0.0, 0.0, 1.0, 55.0, 94.9, 222.1],
      [0.9, 0.8, 0.1, 216.1, 203.2, 131.8],
      [0.1, 0.6, 0.7, 133.1, 194.8, 203.9],
      [0.0116, 0.0116, 0.0116, 6.4, 6.4, 6.4],
    ],
  },
};

const to8 = (v: number) => v * 255;
const grey = (v: number): [number, number, number] => [v, v, v];

describe("AGX data", () => {
  // three.js's own AgX (Filament's), the one the old viewer's agxMHC was built on.
  const chunk = readFileSync(
    new URL("../node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js", import.meta.url),
    "utf8",
  );
  const numbersIn = (name: string): number[] => {
    const start = chunk.indexOf(name);
    const block = chunk.slice(start, chunk.indexOf(");", start));
    return Array.from(block.matchAll(/-?\s*\d+\.\d+/g), ([n]) => Number(n.replace(/\s+/g, "")));
  };

  test("the matrices are three.js's AgX matrices, column for column", () => {
    expect([...AGX.inset]).toEqual(numbersIn("AgXInsetMatrix = mat3"));
    expect([...AGX.outset]).toEqual(numbersIn("AgXOutsetMatrix = mat3"));
    expect([...AGX.toRec2020]).toEqual(numbersIn("LINEAR_SRGB_TO_LINEAR_REC2020 = mat3"));
    expect([...AGX.toSrgb]).toEqual(numbersIn("LINEAR_REC2020_TO_LINEAR_SRGB = mat3"));
  });

  test("the log range and the contrast polynomial are three.js's", () => {
    expect(chunk).toContain(`AgxMinEv = - ${Math.abs(AGX.logMin)}`);
    expect(chunk).toContain(`AgxMaxEv = ${AGX.logMax}`);
    // The GLSL lists + 15.5 * x4 * x2, - 40.14 * x4 * x ... with the signs outside the numbers.
    const terms = Array.from(chunk.slice(chunk.indexOf("return + 15.5")).matchAll(/([+-])\s*(\d+\.\d+)/g)).slice(0, 7);
    expect(terms.map(([, sign, v]) => Number(`${sign}${v}`))).toEqual([...AGX.curve]);
  });

  test("Medium High Contrast is contrast 1.2 about scene grey 0.18, and every look is listed", () => {
    expect(AGX.looks["medium-high-contrast"]).toMatchObject({ contrast: 1.2, pivot: 0.606 });
    expect((Math.log2(0.18) - AGX.logMin) / (AGX.logMax - AGX.logMin)).toBeCloseTo(0.606, 3);
    expect(Object.keys(AGX.looks).sort()).toEqual([...AGX_LOOKS].sort());
  });

  test("the contrast looks are ordered low to high", () => {
    const c = (l: AgxLook) => AGX.looks[l].contrast;
    expect([c("low-contrast"), c("medium-low-contrast"), c("none"), c("medium-high-contrast"), c("high-contrast")])
      .toEqual([0.8, 0.9, 1, 1.2, 1.4]);
  });
});

describe("agx", () => {
  test("black stays black and a huge value stays inside 0..1", () => {
    expect(agx([0, 0, 0], "medium-high-contrast")).toEqual([0, 0, 0]);
    for (const v of agx([1e6, 1e6, 1e6], "medium-high-contrast")) expect(v).toBeLessThanOrEqual(1);
    for (const v of agx([-1, -2, -3], "medium-high-contrast")) expect(v).toBeGreaterThanOrEqual(0);
  });

  test("greys stay grey and brightness only ever rises with the input", () => {
    for (const look of AGX_LOOKS) {
      let last = -1;
      for (const v of [0.001, 0.01, 0.05, 0.18, 0.5, 1, 2, 4, 8]) {
        const [r, g, b] = agx(grey(v), look);
        expect(Math.abs(r - g)).toBeLessThan(0.003);
        expect(Math.abs(g - b)).toBeLessThan(0.003);
        expect(g, `${look} at ${v}`).toBeGreaterThanOrEqual(last);
        last = g;
      }
    }
  });

  test("more contrast darkens shadows and brightens highlights, and leaves scene grey 0.18 alone", () => {
    const at = (v: number, look: AgxLook) => agx(grey(v), look)[1];
    expect(at(0.18, "high-contrast")).toBeCloseTo(at(0.18, "low-contrast"), 2);
    expect(at(0.02, "high-contrast")).toBeLessThan(at(0.02, "low-contrast"));
    expect(at(2, "high-contrast")).toBeGreaterThan(at(2, "low-contrast"));
  });
});

describe("agx against Blender 5.2.3", () => {
  // MEASURED GAP, not a tolerance chosen to pass. agx() is the Filament AgX of
  // the old viewer. Blender 5.2.3 ships a different AgX (EaryChow's rework, a
  // 3D LUT in E-Gamut), so the base curve differs: scene grey 0.18 comes out
  // 127.6/255 here and 117.6/255 in Blender. Each bound is the measured worst
  // case rounded up, so the gap can narrow but not widen unnoticed.
  const BOUND_8BIT: Record<AgxLook, { greys: number; colours: number }> = {
    "none": { greys: 14, colours: 41 },
    "punchy": { greys: 25, colours: 57 },
    "low-contrast": { greys: 14, colours: 31 },
    "medium-low-contrast": { greys: 14, colours: 36 },
    "medium-high-contrast": { greys: 14, colours: 39 },
    "high-contrast": { greys: 14, colours: 56 },
  };

  const greyError = (look: AgxLook, lo = 0, hi = Infinity) =>
    Math.max(...BLENDER[look].greys.filter(([v]) => v >= lo && v <= hi).map(([v, out]) => Math.abs(to8(agx(grey(v), look)[1]) - out)));
  const colourError = (look: AgxLook) =>
    Math.max(...BLENDER[look].colours.flatMap(([r, g, b, ...out]) => agx([r, g, b], look).map((v, k) => Math.abs(to8(v) - out[k]))));

  for (const look of AGX_LOOKS) {
    test(`${look}: the gap stays within the measured bound`, () => {
      expect(greyError(look)).toBeLessThanOrEqual(BOUND_8BIT[look].greys);
      expect(colourError(look)).toBeLessThanOrEqual(BOUND_8BIT[look].colours);
    });
  }

  // The target. It does not hold today: Medium High Contrast mid-greys (0.1 to
  // 0.5) are off by 13.8/255 at worst. test.fails turns red the day agx()
  // meets it, which is the cue to delete the bounds above.
  test.fails("Medium High Contrast mid-greys are within 2/255 of Blender", () => {
    expect(greyError("medium-high-contrast", 0.1, 0.5)).toBeLessThanOrEqual(2);
  });

  test("what a contrast look does to a grey, relative to the base look, matches Blender within 7/255", () => {
    for (const look of ["low-contrast", "medium-low-contrast", "medium-high-contrast", "high-contrast"] as const) {
      for (const [v, out] of BLENDER[look].greys) {
        const base = BLENDER.none.greys.find(([bv]) => bv === v);
        if (!base) throw new Error(`no base probe for ${v}`);
        const blenderShift = out - base[1];
        const ourShift = to8(agx(grey(v), look)[1] - agx(grey(v), "none")[1]);
        expect(Math.abs(ourShift - blenderShift), `${look} at ${v}`).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("toneMapFrame", () => {
  const frame = (rgba: number[], width = rgba.length / 4): RadianceFrame => ({ width, height: rgba.length / 4 / width, samples: 1, rgba: Float32Array.from(rgba) });

  test("maps each pixel as agx() does and writes 8-bit RGBA", () => {
    const out = toneMapFrame(frame([0.18, 0.18, 0.18, 1, 0.8, 0.3, 0.1, 1]), "medium-high-contrast");
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out).toHaveLength(8);
    const expected = [...agx([0.18, 0.18, 0.18], "medium-high-contrast"), ...agx([0.8, 0.3, 0.1], "medium-high-contrast")];
    [0, 1, 2, 4, 5, 6].forEach((o, k) => expect(out[o]).toBe(Math.round(expected[k] * 255)));
    expect([out[3], out[7]]).toEqual([255, 255]);
  });

  test("un-premultiplies so a half-covered pixel shows the colour it would have at full cover", () => {
    const covered = toneMapFrame(frame([0.4, 0.4, 0.4, 1]), "none");
    const half = toneMapFrame(frame([0.2, 0.2, 0.2, 0.5]), "none");
    expect([half[0], half[1], half[2]]).toEqual([covered[0], covered[1], covered[2]]);
    expect(half[3]).toBe(128);
  });

  test("an empty pixel is transparent black and bad samples read as zero", () => {
    expect([...toneMapFrame(frame([0.5, 0.5, 0.5, 0]), "none")]).toEqual([0, 0, 0, 0]);
    const out = toneMapFrame(frame([NaN, Infinity, -Infinity, 1]), "none");
    expect([...out]).toEqual([0, 0, 0, 255]);
  });

  test("keeps the frame's size and handles a whole image quickly", () => {
    const w = 400, h = 500;
    const big = { width: w, height: h, samples: 1, rgba: new Float32Array(w * h * 4).fill(0.25) };
    const started = performance.now();
    const out = toneMapFrame(big, "medium-high-contrast");
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
