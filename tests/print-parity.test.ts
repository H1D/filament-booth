import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { BEAD_WORD, unpackBeadWord } from "../src/print";
import type { BeadMesh, Centreline } from "../src/print";
import { fromBin } from "../src/print/centreline";
import { planRings, sweep } from "../src/print/sweep";
import { centrelineOfGcode } from "../src/print/toolpath";
import type { PrintTables } from "../src/print/toolpath";

// The reference folder holds gcode_mesh.py, the Python mesher the Cycles stills were made with.
// Run:  BOOTH_REF=/home/user/.t3/scratch/lekv2-photoreal-ref bun run test
const REF = process.env.BOOTH_REF;
const GCODE = "bsch04/sliced/plate_1.gcode";

const PYTHON = `
import sys
sys.path.insert(0, sys.argv[1])
import gcode_mesh as g
g.JITTER = 0
m = g.build(sys.argv[2])
out = sys.argv[3]
g.write_web(out + '.bin', m)
m['verts'].astype('<f4').tofile(out + '.verts')
m['tangent'].astype('<f4').tofile(out + '.tangent')
m['feat'].astype('<u1').tofile(out + '.feat')
m['nring'].astype('<u2').tofile(out + '.nring')
`;

const f32 = (path: string): Float32Array => { const b = readFileSync(path); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

describe.skipIf(!REF)("mesher parity with gcode_mesh.py (set BOOTH_REF to the lekv2-photoreal-ref folder to run)", () => {
  let dir = "", cl: Centreline, tables: PrintTables, mesh: BeadMesh;
  const out = (ext: string): string => join(dir, `ref.${ext}`);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "print-parity-"));
    const py = spawnSync("python3", ["-c", PYTHON, REF ?? "", join(REF ?? "", GCODE), join(dir, "ref")], { encoding: "utf8", maxBuffer: 1 << 26 });
    if (py.status !== 0) throw new Error(`gcode_mesh.py failed: ${py.stderr}`);
    ({ centreline: cl, tables } = centrelineOfGcode(readFileSync(join(REF ?? "", GCODE), "utf8"), 0.2, 0));
    mesh = sweep(cl);
  }, 600_000);

  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  test("the centreline matches point for point", () => {
    const bin = fromBin(readFileSync(out("bin")).buffer.slice(0));
    const ref = bin.centreline;
    expect(cl.n).toBe(ref.n);
    for (const k of ["zq", "wq", "fl", "vq"] as const) expect(cl[k].findIndex((v, i) => v !== ref[k][i]), `first mismatch in ${k}`).toBe(-1);
    // gcode_mesh.py centres on its vertex bounding box and the TypeScript mesher in sweep(), so compare without the mean
    const mean = (p: Float32Array, o: number): number => p.reduce((s, v, i) => (i % 2 === o ? s + v : s), 0) / (p.length / 2);
    const mc = [mean(cl.p, 0), mean(cl.p, 1)], mr = [mean(ref.p, 0), mean(ref.p, 1)];
    let dmax = 0;
    for (let i = 0; i < 2 * cl.n; i++) dmax = Math.max(dmax, Math.abs(cl.p[i] - mc[i % 2] - (ref.p[i] - mr[i % 2])));
    console.info(`parity: ${cl.n} centreline points, largest position difference ${(dmax * 1e6).toFixed(3)} um`);
    expect(dmax).toBeLessThan(1e-6);
  });

  test("the layer time and fan tables match", () => {
    const ref = fromBin(readFileSync(out("bin")).buffer.slice(0));
    expect(tables.layerTimeS).toHaveLength(ref.layerTime.length);
    const dt = Math.max(...ref.layerTime.map((t, k) => Math.abs(t - tables.layerTimeS[k])));
    const df = Math.max(...ref.layerFan.map((f, k) => Math.abs(f - tables.layerFan[k])));
    console.info(`parity: ${ref.layerTime.length - 1} layers, largest layer time difference ${dt.toFixed(5)} s, fan ${df.toFixed(5)}`);
    expect(dt).toBeLessThan(1e-3);
    expect(df).toBeLessThan(0.003);
  });

  test("every swept vertex, tangent and feature matches", () => {
    const pv = f32(out("verts")), pt = f32(out("tangent"));
    const pf = new Uint8Array(readFileSync(out("feat")));
    const pn = new Uint16Array(readFileSync(out("nring")).buffer.slice(0));
    const mine = planRings(cl).nring;
    expect(mine.length).toBe(pn.length);
    // A turn sitting exactly on a threshold (35 degrees, multiples of 30 degrees) may round differently in float32:
    // those points get another ring count and are skipped, up to 0.01 % of them.
    let vmax = 0, tmax = 0, compared = 0, flips = 0, featureMisses = 0;
    for (let i = 0, jr = 0, pr = 0; i < pn.length; jr += mine[i], pr += pn[i], i++) {
      if (mine[i] !== pn[i]) { flips++; continue; }
      for (let v = jr * 10, u = pr * 10; v < (jr + pn[i]) * 10; v++, u++) {
        compared++;
        for (let a = 0; a < 3; a++) {
          vmax = Math.max(vmax, Math.abs(mesh.position[3 * v + a] - pv[3 * u + a]));
          tmax = Math.max(tmax, Math.abs(mesh.tangent[3 * v + a] / 32767 - pt[3 * u + a]));
        }
        if (unpackBeadWord(mesh.word[v], BEAD_WORD.feature) !== pf[u]) featureMisses++;
      }
    }
    console.info(`parity: ${compared} of ${mesh.word.length} vertices compared (${pv.length / 3} in Python), ${flips} threshold flips, largest position difference ${(vmax * 1e6).toFixed(3)} um, tangent ${tmax.toFixed(5)}`);
    expect(compared).toBeGreaterThan(0.999 * mesh.word.length);
    expect(flips).toBeLessThanOrEqual(pn.length * 1e-4);
    expect(vmax).toBeLessThan(5e-6); // widths travel as 5 um steps in the .bin
    expect(tmax).toBeLessThan(0.01); // the centreline stores float32 metres: a 2 um step moves its direction by up to 7 nm / 2 um
    expect(featureMisses).toBe(0);
  });
});
