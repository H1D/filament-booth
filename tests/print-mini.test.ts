import { describe, expect, test, vi } from "vitest";
import { BEAD_WORD, PLATE_EPS, unpackBeadWord } from "../src/print";
import type { BeadMesh, Centreline } from "../src/print";
import { centrelineOfGcode } from "../src/print/toolpath";
import { PrintSession } from "../src/print/session";
import { sweep } from "../src/print/sweep";
import { thin } from "../src/print/centreline";
import { DEFAULT_SLICE, mm } from "../src/document";
import { MINI_GCODE, gcodeSource, recordingJob, zip } from "./support/print";
import type { Job } from "../src/print/session";

const H = 0.2;
const field = (mesh: BeadMesh, f: keyof typeof BEAD_WORD, v: number): number => unpackBeadWord(mesh.word[v], BEAD_WORD[f]);
const vertices = (mesh: BeadMesh): number => mesh.word.length;

// The fixture has three 0.2 mm layers. Each has an outer wall with an arc corner and an inner wall.
// The inner wall of layer 2 is covered above and below, so only layers 1 and 3 keep theirs.
// Layer 3 also has two top-surface lines.
describe("the synthetic print", () => {
  const { centreline, tables } = centrelineOfGcode(MINI_GCODE, H, 0);
  const starts = Array.from(centreline.fl).filter((f) => f & 1);

  test("keeps seven runs: three outer walls, the two exposed inner walls and two top lines", () => {
    expect(starts).toHaveLength(7);
    const codes = starts.map((f) => f >> 1);
    expect(codes.filter((c) => c === 0)).toHaveLength(5);
    expect(codes.filter((c) => c === 1)).toHaveLength(2);
    expect(new Set(codes)).toEqual(new Set([0, 1]));
  });

  test("drops the inner wall of the middle layer, which both neighbours cover", () => {
    const layersOfInnerWalls = new Set<number>();
    for (let i = 0; i < centreline.n; i++) if (centreline.wq[i] === 90) layersOfInnerWalls.add(Math.round(centreline.zq[i] / 20));
    expect([...layersOfInnerWalls].sort()).toEqual([1, 3]);
  });

  test("tessellates the arc into more points than the straight moves alone", () => {
    const outerWallPoints = Array.from(centreline.wq).filter((w) => w === 84).length;
    expect(outerWallPoints).toBeGreaterThan(3 * 6);
  });

  test("tabulates time per layer, scaled to the slicer's total, and fan duty", () => {
    const fan = Array.from(tables.layerFan);
    expect(fan).toHaveLength(4);
    [0, 0, 1, 128 / 255].forEach((duty, k) => expect(fan[k]).toBeCloseTo(duty, 5));
    expect(tables.layerTimeS[0]).toBe(0);
    expect(tables.layerTimeS[1]).toBeGreaterThan(0);
    expect(Array.from(tables.layerTimeS).reduce((a, b) => a + b, 0)).toBeCloseTo(60, 3);
  });

  const mesh = sweep(centreline);

  test("counts the layers and reports the layer height in metres", () => {
    expect(mesh.layerCount).toBe(3);
    expect(mesh.layerHeightM).toBeCloseTo(0.2e-3, 12);
  });

  test("rests on the bed and stands centred, in metres", () => {
    const { min, max } = mesh.bboxM;
    expect(min[2]).toBeLessThanOrEqual(PLATE_EPS);
    expect(max[2]).toBeCloseTo(0.6e-3, 9);
    expect(min[0] + max[0]).toBeCloseTo(0, 9);
    expect(min[1] + max[1]).toBeCloseTo(0, 9);
    expect(max[0] - min[0]).toBeGreaterThan(25e-3);
    expect(max[0] - min[0]).toBeLessThan(26e-3);
  });

  test("puts the plate face at z = 0 and only on first-layer vertices", () => {
    let plate = 0;
    for (let v = 0; v < vertices(mesh); v++) {
      const z = mesh.position[3 * v + 2];
      if (z <= PLATE_EPS) {
        plate++;
        expect(field(mesh, "layer", v)).toBe(1);
        expect(z).toBeCloseTo(0, 12);
      }
    }
    expect(plate).toBeGreaterThan(0);
  });

  test("tags every vertex with the feature, layer and speed the fixture defines", () => {
    const seen = new Set<string>();
    for (let v = 0; v < vertices(mesh); v++) {
      const feature = field(mesh, "feature", v), layer = field(mesh, "layer", v), speed = field(mesh, "speed", v);
      seen.add(`${feature}:${layer}`);
      expect(speed).toBe(feature === 0 ? 50 : 25); // 100 mm/s walls, 50 mm/s top lines, in 2 mm/s steps
      const zBottom = (layer - 1) * 0.2e-3, zTop = layer * 0.2e-3;
      expect(mesh.position[3 * v + 2]).toBeGreaterThanOrEqual(zBottom - 1e-9);
      expect(mesh.position[3 * v + 2]).toBeLessThanOrEqual(zTop + 1e-9);
    }
    expect(seen).toEqual(new Set(["0:1", "0:2", "0:3", "1:3"]));
  });

  test("reports the wall speed as the speed gloss reference", () => {
    expect(mesh.vRefMmS).toBe(100);
  });

  test("indexes real triangles inside the vertex buffer", () => {
    expect(mesh.tris).toBe(mesh.index.length / 3);
    expect(mesh.tris).toBeGreaterThan(100);
    expect(Math.max(...mesh.index)).toBeLessThan(vertices(mesh));
    expect(mesh.position.length).toBe(3 * vertices(mesh));
    expect(mesh.normal.length).toBe(3 * vertices(mesh));
    expect(mesh.tangent.length).toBe(3 * vertices(mesh));
  });

  test("the lite mesh is the same print with fewer triangles", () => {
    const lite = sweep(thin(centreline), true);
    expect(lite.layerCount).toBe(3);
    expect(lite.tris).toBeLessThan(mesh.tris);
    expect(lite.bboxM.max[2]).toBeCloseTo(mesh.bboxM.max[2], 9);
  });
});

describe("a straight path", () => {
  const straight = (dx: number, dy: number): Centreline => ({
    n: 3, p: Float32Array.from([0, 0, 5e-3 * dx, 5e-3 * dy, 10e-3 * dx, 10e-3 * dy]), zq: Uint16Array.from([40, 40, 40]),
    wq: Uint8Array.from([84, 84, 84]), fl: Uint8Array.from([1, 0, 0]), vq: Uint8Array.from([50, 50, 50]), h: mm(0.2),
  });

  test.each([[1, 0], [0, 1], [-1, 0]])("has its tangent along the path direction (%i, %i)", (dx, dy) => {
    const m = sweep(straight(dx, dy));
    // the first and last rings are round caps, so only the middle ring runs along the path
    const mid = 3 * Math.floor(m.word.length / 2);
    const t = [m.tangent[mid] / 32767, m.tangent[mid + 1] / 32767, m.tangent[mid + 2] / 32767];
    expect(t[0]).toBeCloseTo(dx, 3);
    expect(t[1]).toBeCloseTo(dy, 3);
    expect(t[2]).toBe(0);
  });
});

describe("opening the fixture as a file", () => {
  test("reports the settings, bed and filament the header records, as file settings", async () => {
    const { sliced } = await new PrintSession().open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
    expect(sliced.settingsSource).toBe("file");
    expect(sliced.settings).toMatchObject({
      layerHeight: 0.2, outerLineWidth: 0.42, innerLineWidth: 0.45, wallCount: 2, topShellLayers: 3,
      topSurfacePattern: "monotonic-line", seamPosition: "back",
    });
    expect(sliced.layerHeightMm).toBe(0.2);
    expect(sliced.bedFromFile).toBe("textured-pei");
    expect(sliced.filamentName).toBe("Fixture PETG");
    expect(sliced.layerFan).toHaveLength(4);
    expect(sliced.note).toBeNull();
  });

  test("goes through the stages in order", async () => {
    const stages: string[] = [];
    await new PrintSession().open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob(stages));
    expect(stages).toEqual(["reading", "parsing", "walls", "sweeping"]);
  });

  test("opens a Bambu .gcode.3mf, stored or deflated, to the same mesh as the bare G-code", async () => {
    const bare = await new PrintSession().open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
    for (const deflate of [false, true]) {
      const file = zip([{ name: "Metadata/plate_1.gcode", text: MINI_GCODE, deflate }]);
      const src = { kind: "gcode" as const, file: new File([file], "part.gcode.3mf"), fileHash: `3mf-${deflate}` };
      const opened = await new PrintSession().open(src, DEFAULT_SLICE, recordingJob());
      expect(opened.mesh.tris).toBe(bare.mesh.tris);
      expect(opened.sliced.filamentName).toBe("Fixture PETG");
    }
  });

  test("says which plate a multi-plate .gcode.3mf shows", async () => {
    const file = zip([
      { name: "Metadata/plate_2.gcode", text: MINI_GCODE, deflate: true },
      { name: "Metadata/plate_1.gcode", text: MINI_GCODE, deflate: false },
    ]);
    const src = { kind: "gcode" as const, file: new File([file], "two.gcode.3mf"), fileHash: "two" };
    const { sliced } = await new PrintSession().open(src, DEFAULT_SLICE, recordingJob());
    expect(sliced.note).toBe("showing plate_1.gcode, 1 of 2 plates");
  });

  test("keeps the first plate of a numeric-sorted list, so plate_2 comes before plate_10", async () => {
    const file = zip([
      { name: "Metadata/plate_10.gcode", text: "; nothing here\n", deflate: false },
      { name: "Metadata/plate_2.gcode", text: MINI_GCODE, deflate: false },
    ]);
    const src = { kind: "gcode" as const, file: new File([file], "ten.gcode.3mf"), fileHash: "ten" };
    const { sliced } = await new PrintSession().open(src, DEFAULT_SLICE, recordingJob());
    expect(sliced.note).toBe("showing plate_2.gcode, 1 of 2 plates");
  });

  test("rejects G-code with no extrusions it can model", async () => {
    await expect(new PrintSession().open(gcodeSource("G28\nG1 X10 Y10\n"), DEFAULT_SLICE, recordingJob())).rejects.toThrow(/no Bambu \/ Orca extrusions/);
  });

  test("rejects uneven layers and spiral vase mode, which the bead model cannot place", async () => {
    const uneven = MINI_GCODE.replace("initial_layer_print_height = 0.2", "initial_layer_print_height = 0.3");
    await expect(new PrintSession().open(gcodeSource(uneven), DEFAULT_SLICE, recordingJob())).rejects.toThrow(/only even layers/);
    const spiral = MINI_GCODE.replace("; CONFIG_BLOCK_END", "; spiral_mode = 1\n; CONFIG_BLOCK_END");
    await expect(new PrintSession().open(gcodeSource(spiral), DEFAULT_SLICE, recordingJob())).rejects.toThrow(/spiral vase/);
  });

  test("names the header values it cannot express instead of hiding them", async () => {
    const odd = MINI_GCODE.replace("monotonicline", "adaptive-cubic");
    const { sliced } = await new PrintSession().open(gcodeSource(odd), DEFAULT_SLICE, recordingJob());
    expect(sliced.note).toBe("file also sets top_surface_pattern = adaptive-cubic");
  });

  test("works out the hidden faces once, keeps them for a re-open, and survives an abort on the way", async () => {
    const session = new PrintSession(), src = gcodeSource(MINI_GCODE);
    const opened = await session.open(src, DEFAULT_SLICE, recordingJob());
    // Aborted at the first checkpoint, then at the second, after the cover test: neither loses it.
    for (const at of [1, 2]) {
      const aborted = new AbortController();
      let checkpoints = 0;
      const job: Job = { signal: aborted.signal, stage: () => {}, checkpoint: async () => {
        if (++checkpoints === at) aborted.abort();
        aborted.signal.throwIfAborted();
      } };
      await expect(session.hidden(job)).rejects.toThrow();
    }
    const hidden = await session.hidden(recordingJob());
    expect(hidden).toHaveLength(opened.mesh.tris);
    expect(hidden?.includes(1)).toBe(true);
    await session.open(src, DEFAULT_SLICE, recordingJob());
    expect(await session.hidden(recordingJob())).toBe(hidden);
  });

  test("an open superseded while it fetches leaves the newer print to its lite mesh and faces", async () => {
    // Two points of one run on layer 1, one layer of times: the smallest valid centreline .bin.
    const N = 2, o = 4 + 13 * N + (-(4 + 13 * N) & 3), bin = new ArrayBuffer(o + 4 + 5);
    new Uint32Array(bin, 0, 1)[0] = N;
    new Float32Array(bin, 4, 2 * N).set([0, 0, 10, 0]);
    new Uint16Array(bin, 4 + 8 * N, N).set([20, 20]);
    new Uint8Array(bin, 4 + 10 * N, N).set([84, 84]);
    new Uint8Array(bin, 4 + 11 * N, N).set([1, 0]);
    new Uint32Array(bin, o, 1)[0] = 1;
    let deliver = () => {};
    // A fetch that answers after its request was aborted.
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => { deliver = () => resolve(new Response(bin)); }));
    try {
      const session = new PrintSession(), slow = new AbortController();
      const first = session.open({ kind: "bin", url: "slow.bin" }, DEFAULT_SLICE,
        { signal: slow.signal, stage: () => {}, checkpoint: async () => slow.signal.throwIfAborted() });
      slow.abort();
      const opened = await session.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
      deliver();
      await expect(first).rejects.toThrow();
      expect((await session.lite(recordingJob())).layerCount).toBe(opened.mesh.layerCount);
      expect(await session.hidden(recordingJob())).toHaveLength(opened.mesh.tris);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("builds the lite mesh from the cached centreline without parsing again", async () => {
    const session = new PrintSession();
    const opened = await session.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
    const stages: string[] = [];
    const lite = await session.lite(recordingJob(stages));
    expect(stages).toEqual([]); // no reading, parsing or walls; it follows the open unasked, so no stage either
    expect(lite.tris).toBeLessThan(opened.mesh.tris);
    expect(lite.layerCount).toBe(opened.mesh.layerCount);
  });

  test("sweeps again without parsing when the same file is opened again", async () => {
    const session = new PrintSession(), src = gcodeSource(MINI_GCODE);
    await session.open(src, DEFAULT_SLICE, recordingJob());
    const stages: string[] = [];
    await session.open(src, DEFAULT_SLICE, recordingJob(stages));
    expect(stages).toEqual(["sweeping"]);
  });

  test("cannot make a lite mesh before anything is open", async () => {
    await expect(new PrintSession().lite(recordingJob())).rejects.toThrow(/no print is loaded/);
  });

  test("cannot re-slice a G-code", async () => {
    const session = new PrintSession();
    await session.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
    await expect(session.reslice({ ...DEFAULT_SLICE, layerHeight: mm(0.12) }, recordingJob())).rejects.toThrow(/only an opened STL/);
  });
});
