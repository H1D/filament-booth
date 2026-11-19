import { describe, expect, test } from "vitest";
import { DEFAULT_SLICE, defaultDocument, mm, parseDocument } from "../src/document";
import type { SliceSettings } from "../src/document";
import { fromBin } from "../src/print/centreline";
import { bedFromOrca, orcaOverrides, settingsFromOrca, TOP_PATTERNS, TOP_SURFACE_PATTERNS } from "../src/print/orca";
import { binaryStl, placeOnBed, triangleSoup } from "../src/print/stl";
import { centrelineOfGcode } from "../src/print/toolpath";

const CUBE_FACES: number[][][] = [
  [[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 1], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [1, 0, 0]],
  [[1, 0, 0], [1, 0, 1], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [1, 1, 1], [0, 1, 1]], [[1, 1, 0], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 1, 1], [0, 0, 1]], [[0, 1, 0], [0, 0, 1], [0, 0, 0]],
];
const asciiStl = (scale = 1, offset = 0): string =>
  `solid cube\n${CUBE_FACES.map((f) => `facet normal 0 0 0\nouter loop\n${f.map((v) => `vertex ${v.map((c) => c * scale + offset).join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n")}\nendsolid cube\n`;
const toBuffer = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

describe("STL input", () => {
  test("rewrites an ASCII STL as the binary the engine reads", () => {
    const bin = binaryStl(toBuffer(asciiStl()));
    expect(bin.byteLength).toBe(84 + 50 * 12);
    expect(new DataView(bin).getUint32(80, true)).toBe(12);
  });

  test("passes a binary STL through untouched, even when its header says solid", () => {
    const bin = new ArrayBuffer(84 + 50);
    new Uint8Array(bin).set(new TextEncoder().encode("solid but binary"));
    new DataView(bin).setUint32(80, 1, true);
    expect(binaryStl(bin)).toBe(bin);
  });

  test("rejects a file with no triangles", () => {
    expect(() => binaryStl(toBuffer("solid empty\nendsolid empty\n"))).toThrow(/no triangles/);
  });

  test("reads nine floats per triangle", () => {
    const soup = triangleSoup(toBuffer(asciiStl(10)));
    expect(soup).toHaveLength(12 * 9);
    expect(Math.max(...soup)).toBe(10);
  });

  test("centres the part on the bed centre and rests it on z = 0", () => {
    const placed = placeOnBed(triangleSoup(toBuffer(asciiStl(20, 100))), 90, 90);
    const axis = (a: number): number[] => Array.from(placed).filter((_, i) => i % 3 === a);
    expect([Math.min(...axis(0)), Math.max(...axis(0))]).toEqual([80, 100]);
    expect([Math.min(...axis(1)), Math.max(...axis(1))]).toEqual([80, 100]);
    expect([Math.min(...axis(2)), Math.max(...axis(2))]).toEqual([0, 20]);
  });
});

describe("slicing vocabulary", () => {
  const settings: SliceSettings = {
    layerHeight: mm(0.12), outerLineWidth: mm(0.4), innerLineWidth: mm(0.46), wallCount: 4, topShellLayers: 7,
    topSurfacePattern: "monotonic-line", seamPosition: "back",
  };

  test("names the Orca keys the engine takes, and gives the first layer the layer height", () => {
    expect(orcaOverrides(settings)).toEqual({
      layer_height: "0.12", initial_layer_print_height: "0.12", wall_loops: "4", top_shell_layers: "7",
      top_surface_pattern: "monotonicline", seam_position: "back", outer_wall_line_width: "0.4", inner_wall_line_width: "0.46",
      enable_arc_fitting: "1",
    });
  });

  test.each(TOP_SURFACE_PATTERNS)("reads back what it wrote, for the %s top pattern", (topSurfacePattern) => {
    for (const seamPosition of ["aligned", "nearest", "back", "random"] as const) {
      const s = { ...settings, topSurfacePattern, seamPosition };
      const keys = orcaOverrides(s);
      const read = settingsFromOrca((k) => keys[k], DEFAULT_SLICE);
      expect(read.settings).toEqual(s);
      expect(read.unmodelled).toEqual([]);
    }
  });

  test("names each pattern once, in the document's vocabulary and in Orca's", () => {
    expect(new Set(TOP_PATTERNS.map(([booth]) => booth)).size).toBe(TOP_PATTERNS.length);
    expect(new Set(TOP_PATTERNS.map(([, orca]) => orca)).size).toBe(TOP_PATTERNS.length);
    expect(parseDocument(JSON.parse(JSON.stringify({ ...defaultDocument(), slicing: { ...DEFAULT_SLICE, topSurfacePattern: "hilbert-curve" } }))).slicing.topSurfacePattern).toBe("hilbert-curve");
    expect(() => parseDocument({ ...defaultDocument(), slicing: { ...DEFAULT_SLICE, topSurfacePattern: "hilbertcurve" } })).toThrow(/topSurfacePattern/);
  });

  test("keeps the default for a key the file lacks, and names a value it cannot express", () => {
    const read = settingsFromOrca((k) => ({ top_surface_pattern: "adaptive-cubic", seam_position: "aligned_back" })[k], DEFAULT_SLICE);
    expect(read.settings).toEqual(DEFAULT_SLICE);
    expect(read.unmodelled).toEqual(["top_surface_pattern = adaptive-cubic", "seam_position = aligned_back"]);
  });

  test.each([
    ["Textured PEI Plate", "textured-pei"], ["Cool Plate", "smooth"], ["Engineering Plate", "smooth"],
    ["Smooth PEI Plate / High Temp Plate", "smooth"], ["Mystery Plate", null], [undefined, null],
  ] as const)("reads the bed %s as %s", (name, bed) => {
    expect(bedFromOrca(name)).toBe(bed);
  });
});

describe("a prebuilt .bin", () => {
  function bin(points: { x: number; y: number; z: number; w: number; fl: number; v: number }[], time: number[], fan: number[]): ArrayBuffer {
    const n = points.length, o = 4 + 13 * n + (-(4 + 13 * n) & 3), L = time.length;
    const buf = new ArrayBuffer(o + 4 + 5 * L), dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint32(0, n, true);
    points.forEach((p, i) => {
      dv.setFloat32(4 + 8 * i, p.x, true); dv.setFloat32(8 + 8 * i, p.y, true);
      dv.setUint16(4 + 8 * n + 2 * i, p.z, true);
      u8[4 + 10 * n + i] = p.w; u8[4 + 11 * n + i] = p.fl; u8[4 + 12 * n + i] = p.v;
    });
    dv.setUint32(o, L, true);
    time.forEach((t, i) => dv.setFloat32(o + 4 + 4 * i, t, true));
    fan.forEach((f, i) => { u8[o + 4 + 4 * L + i] = f; });
    return buf;
  }

  test("reads the centreline and the layer tables in the layout gcode_mesh.py writes", () => {
    const read = fromBin(bin(
      [{ x: 0, y: 0, z: 20, w: 84, fl: 1, v: 50 }, { x: 0.01, y: 0, z: 20, w: 84, fl: 0, v: 50 }, { x: 0.01, y: 0.01, z: 40, w: 90, fl: 3, v: 25 }],
      [0, 1.5, 2.5], [0, 255, 51],
    ));
    expect(read.centreline.n).toBe(3);
    expect(Array.from(read.centreline.zq)).toEqual([20, 20, 40]);
    expect(Array.from(read.centreline.wq)).toEqual([84, 84, 90]);
    expect(Array.from(read.centreline.fl)).toEqual([1, 0, 3]);
    expect(Array.from(read.centreline.vq)).toEqual([50, 50, 25]);
    expect(read.centreline.p[2]).toBeCloseTo(0.01, 6);
    expect(read.centreline.h).toBe(0.2);
    expect(Array.from(read.layerTime)).toEqual([0, 1.5, 2.5]);
    expect(Array.from(read.layerFan).map((f) => +f.toFixed(2))).toEqual([0, 1, 0.2]);
  });

  test("rejects a truncated file", () => {
    const whole = bin([{ x: 0, y: 0, z: 20, w: 84, fl: 1, v: 50 }, { x: 1, y: 0, z: 20, w: 84, fl: 0, v: 50 }], [0, 1], [0, 0]);
    expect(() => fromBin(whole.slice(0, whole.byteLength - 1))).toThrow(/not a bead centreline/);
    expect(() => fromBin(new ArrayBuffer(2))).toThrow(/not a bead centreline/);
  });
});

describe("G-code without width tags", () => {
  const H = 0.2;
  // Two square loops per layer, both tagged "Outer wall": 0.42 wide on the outside, 0.45 wide inset by 1 mm.
  // E is what a slicer would extrude for that width, so the width must be recovered from it.
  const eFor = (w: number, len: number): number => (w - H * (1 - Math.PI / 4)) * len * H / (Math.PI * 0.875 ** 2);
  function loop(inset: number, w: number, tag: boolean): string {
    const a = 10 + inset, b = 30 - inset, len = b - a;
    const e = eFor(w, len).toFixed(5);
    return [`; FEATURE: Outer wall`, tag ? `; LINE_WIDTH: ${w}` : "", `G1 X${a} Y${a} F12000`, `G1 X${b} Y${a} E${e} F6000`, `G1 X${b} Y${b} E${e}`, `G1 X${a} Y${b} E${e}`, `G1 X${a} Y${a} E${e}`].filter(Boolean).join("\n");
  }
  const print = (tag: boolean): string => [1, 2, 3].map((k) => `; CHANGE_LAYER\nG1 Z${(k * H).toFixed(1)} F600\n${loop(0, 0.42, tag)}\n${loop(1, 0.45, tag)}`).join("\n");
  const runs = (text: string): number => Array.from(centrelineOfGcode(text, H, 0).centreline.fl).filter((f) => f & 1).length;

  test("recovers each bead's width from the extruded length", () => {
    const { wq } = centrelineOfGcode(print(false), H, 0).centreline;
    expect(new Set(wq)).toEqual(new Set([84, 90]));
  });

  test("tells the wider loop is an inner wall, so the covered middle layer of it drops out", () => {
    expect(runs(print(false))).toBe(3 + 2);
  });

  test("keeps every loop once the slicer tags the widths itself", () => {
    expect(runs(print(true))).toBe(3 + 3);
  });
});
