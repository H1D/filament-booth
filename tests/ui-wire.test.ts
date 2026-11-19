import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { defaultDocument } from "../src/document";
import { parseManifest } from "../src/film";
import type { PhotoTools } from "../src/photo/photo";
import { compileScene } from "../src/scene";
import { FakePrint } from "../dev/fakes";
import type { PrintPort } from "../src/booth";
import type { SliceSettings } from "../src/document";
import type { BeadMesh, LoadedPrint, PrintSource } from "../src/print";
import { Ui } from "../src/ui/store";
import { PhotoSession } from "../src/ui/photo-session";
import { agentControl, connectViewport, photoDesk, type ViewportLike } from "../src/ui/wire";
import { boothWith } from "./ui-fixtures";

const scene = compileScene(defaultDocument(), null, 1);
const manifest = parseManifest(JSON.parse(readFileSync(new URL("../public/lut/manifest.json", import.meta.url), "utf8")));
const tools: PhotoTools = {
  loadAgx: async (look) => ({ look, manifest, base: new Float32Array(0), pre: null }),
  quickLook: () => ({ width: 1, height: 1, close() {} }),
  develop: async () => new Blob(["png"]),
  now: () => 0,
  schedule: () => () => {},
};

// Node is not cross-origin isolated, so Cycles reports that it does not fit and the desk goes on to the next engine.
test("the photo desk renders on the preview when Cycles cannot run here", async () => {
  const accumulate = vi.fn((_scene: unknown, _onPass: unknown, signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => { reject(signal.reason); }); }));
  const run = photoDesk({ accumulate }, tools).take(scene, "part");
  await vi.waitFor(() => { expect(accumulate).toHaveBeenCalledTimes(1); });
  expect(accumulate.mock.calls[0][0]).toBe(scene);
  run.cancel();
  await run.result.catch(() => {});
});

test("with no preview the desk has Cycles alone, and the photo fails saying why", async () => {
  const run = photoDesk(null, tools).take(scene, "part");
  await expect(run.result).rejects.toThrow(/cross-origin isolated/);
});

// ---- agentControl --------------------------------------------------------------------------

test("agent control is built over the real parts and starts nothing until the switch is turned on", () => {
  const { booth } = boothWith();
  const storage = new Map<string, string>();
  const parts = {
    booth, photos: new PhotoSession(() => booth.takePhoto()),
    storage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } },
  };
  for (const viewport of [null, { accumulate: vi.fn() }]) {
    const agent = agentControl({ ...parts, viewport });
    // Node is not cross-origin isolated, so Python cannot run here and the control says so instead of loading it.
    expect(agent.state.get().status).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("cross-origin isolated") as string });
    expect(agent.state.get().settings.enabled).toBe(false);
  }
  expect(storage.size).toBe(0);
});

// ---- connectViewport -----------------------------------------------------------------------

class LitePrint implements PrintPort {
  readonly #inner = new FakePrint({ stage: 0, slice: 0, reslice: 0 });
  readonly lites: { mesh: BeadMesh; resolve: (m: BeadMesh) => void }[] = [];

  async open(src: PrintSource, settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    const loaded = await this.#inner.open(src, settings, onStage);
    let resolve: (m: BeadMesh) => void = () => {};
    const lite = new Promise<BeadMesh>((r) => { resolve = r; });
    this.lites.push({ mesh: loaded.mesh, resolve });
    return { ...loaded, liteMesh: () => lite };
  }

  reslice(settings: SliceSettings, onStage: (stage: string) => void): Promise<LoadedPrint> {
    return this.#inner.reslice(settings, onStage);
  }

  dispose(): void {}
}

function recordingViewport(): ViewportLike & { lites: (BeadMesh | null)[] } {
  const lites: (BeadMesh | null)[] = [];
  return { lites, show: () => {}, setFocusTool: () => {}, setLiteMesh: (m) => { lites.push(m); } };
}

const gcode = (name: string) => new File(["G1 X0 Y0 Z0.2 E0.1\n"], name);

test("the viewport gets the lite mesh of the part that opened", async () => {
  const print = new LitePrint();
  const { booth } = boothWith({ print });
  const viewport = recordingViewport();
  connectViewport(booth, new Ui(), viewport);
  await booth.open(gcode("a.gcode"));
  const lite = { ...print.lites[0].mesh };
  print.lites[0].resolve(lite);
  await vi.waitFor(() => { expect(viewport.lites).toEqual([lite]); });
});

test("a lite mesh that arrives after another part opened is not shown", async () => {
  const print = new LitePrint();
  const { booth } = boothWith({ print });
  const viewport = recordingViewport();
  connectViewport(booth, new Ui(), viewport);
  await booth.open(gcode("a.gcode"));
  await booth.open(gcode("b.gcode"));
  const lateLite = { ...print.lites[0].mesh }, lite = { ...print.lites[1].mesh };
  print.lites[0].resolve(lateLite);
  print.lites[1].resolve(lite);
  await vi.waitFor(() => { expect(viewport.lites).toEqual([lite]); });
});
