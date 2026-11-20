import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_SLICE, mm } from "../src/document";
import { PrintPipeline, Superseded, hiddenFacesSettled, servePrint } from "../src/print";
import type { BeadMesh } from "../src/print";
import { PrintSession } from "../src/print/session";
import { cyclesEngine } from "../src/photo/cycles";
import type { Scene } from "../src/scene";
import { MINI_GCODE, gcodeSource, recordingJob } from "./support/print";

type Sent = { message: { id: number; kind: string; stage?: string }; transfer: ArrayBuffer[] };

/** A real print worker served on this thread through a message channel, with what it sent recorded. */
function inProcessWorker() {
  const { port1, port2 } = new MessageChannel();
  const sent: Sent[] = [];
  const port = {
    onmessage: null as ((ev: MessageEvent) => void) | null,
    postMessage(message: Sent["message"], options: { transfer: ArrayBuffer[] }) {
      sent.push({ message, transfer: options.transfer });
      port2.postMessage(message, options);
    },
  };
  port2.onmessage = (ev) => port.onmessage?.(ev);
  servePrint(port);
  let terminated = 0;
  const worker = {
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onerror: null as ((ev: ErrorEvent) => void) | null,
    postMessage: (m: unknown) => port1.postMessage(m),
    terminate: () => { terminated++; port1.close(); port2.close(); },
  };
  port1.onmessage = (ev) => worker.onmessage?.(ev);
  return { worker: worker as unknown as Worker, raw: worker, sent, terminated: () => terminated };
}

/** A worker that answers only when the test says so. */
function scriptedWorker() {
  const requests: { id: number; op: string }[] = [];
  const raw = {
    onmessage: null as ((ev: { data: unknown }) => void) | null,
    onerror: null as ((ev: { message: string }) => void) | null,
    postMessage: (m: { id: number; op: string }) => { requests.push(m); },
    terminate: () => {},
  };
  return { worker: raw as unknown as Worker, raw, requests, reply: (data: unknown) => raw.onmessage?.({ data }) };
}

const live: PrintPipeline[] = [];
const pipeline = (spawn: () => Worker): PrintPipeline => { const p = new PrintPipeline(spawn); live.push(p); return p; };
afterEach(() => { live.splice(0).forEach((p) => p.dispose()); });

const noStage = (): void => {};
const withShells = (n: number): string => MINI_GCODE.replace("top_shell_layers = 3", `top_shell_layers = ${n}`);

describe("PrintPipeline over a real worker", () => {
  test("opens a G-code and reports its stages in order", async () => {
    const { worker } = inProcessWorker(), stages: string[] = [];
    const loaded = await pipeline(() => worker).open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, (s) => stages.push(s));
    expect(stages).toEqual(["reading", "parsing", "walls", "sweeping"]);
    expect(loaded.sliced.settingsSource).toBe("file");
    expect(loaded.mesh.layerCount).toBe(3);
    expect(loaded.mesh.tris).toBeGreaterThan(100);
    expect(loaded.source.kind).toBe("gcode");
  });

  test("hands the mesh buffers over by transfer, not by copy", async () => {
    const w = inProcessWorker();
    await pipeline(() => w.worker).open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    const answer = w.sent.find((s) => s.message.kind === "opened");
    // position, normal, tangent, word, index
    expect(answer?.transfer).toHaveLength(5);
    expect(new Set(answer?.transfer).size).toBe(5);
  });

  test("sends the lite mesh and then the hidden faces after the mesh, unasked", async () => {
    const w = inProcessWorker();
    const loaded = await pipeline(() => w.worker).open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    expect(loaded.liteMesh()).toBe(loaded.liteMesh());
    const lite: BeadMesh = await loaded.liteMesh();
    expect(lite.tris).toBeLessThan(loaded.mesh.tris);
    expect(lite.layerCount).toBe(3);
    await hiddenFacesSettled(loaded.mesh);
    const session = new PrintSession();
    await session.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob());
    expect(loaded.mesh.hidden).toEqual(await session.hidden(recordingJob()));
    expect(loaded.mesh.hidden).toHaveLength(loaded.mesh.tris);
    expect(loaded.mesh.hidden?.includes(1)).toBe(true);
    const kinds = w.sent.map((s) => s.message.kind);
    expect(kinds.slice(kinds.indexOf("opened"))).toEqual(["opened", "lite", "hidden"]);
    const [liteSent, hiddenSent] = w.sent.slice(-2);
    expect(new Set(liteSent.transfer).size).toBe(5);
    expect(hiddenSent.transfer).toHaveLength(0); // copied: the session keeps its own for a re-open
  });

  test("a second open supersedes the first, which rejects and hears nothing more", async () => {
    const { worker } = inProcessWorker(), p = pipeline(() => worker), heard: string[] = [];
    const first = p.open(gcodeSource(MINI_GCODE, "a.gcode"), DEFAULT_SLICE, (s) => heard.push(s));
    const second = p.open(gcodeSource(withShells(4), "b.gcode"), DEFAULT_SLICE, noStage);
    await expect(first).rejects.toBeInstanceOf(Superseded);
    const loaded = await second;
    expect(loaded.sliced.settings.topShellLayers).toBe(4);
    expect(heard).toEqual([]);
  });

  test("a lite mesh of a replaced print rejects as superseded", async () => {
    const { worker } = inProcessWorker(), p = pipeline(() => worker);
    const old = await p.open(gcodeSource(MINI_GCODE, "a.gcode"), DEFAULT_SLICE, noStage);
    await p.open(gcodeSource(withShells(4), "b.gcode"), DEFAULT_SLICE, noStage);
    await expect(old.liteMesh()).rejects.toBeInstanceOf(Superseded);
  });

  test("reports a parse failure as an error and keeps working afterwards", async () => {
    const { worker } = inProcessWorker(), p = pipeline(() => worker);
    await expect(p.open(gcodeSource("G28\n", "empty.gcode"), DEFAULT_SLICE, noStage)).rejects.toThrow(/no Bambu \/ Orca extrusions/);
    const loaded = await p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    expect(loaded.mesh.layerCount).toBe(3);
  });

  test("cannot re-slice before an open, or a G-code after one", async () => {
    const { worker } = inProcessWorker(), p = pipeline(() => worker);
    const settings = { ...DEFAULT_SLICE, layerHeight: mm(0.12) };
    await expect(p.reslice(settings, noStage)).rejects.toThrow(/only an opened STL/);
    await p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    await expect(p.reslice(settings, noStage)).rejects.toThrow(/only an opened STL/);
  });

  test("dispose stops the worker and rejects the live job as superseded", async () => {
    const w = inProcessWorker(), p = pipeline(() => w.worker);
    const live = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    p.dispose();
    await expect(live).rejects.toBeInstanceOf(Superseded);
    expect(w.terminated()).toBe(1);
  });
});

describe("PrintPipeline against a worker that answers when told", () => {
  const sliced = async () => (await new PrintSession().open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, recordingJob()));

  test("drops the late reply of a superseded job", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
    const first = p.open(gcodeSource(MINI_GCODE, "a.gcode"), DEFAULT_SLICE, noStage);
    const second = p.open(gcodeSource(MINI_GCODE, "b.gcode"), DEFAULT_SLICE, noStage);
    const [a, b] = w.requests;
    expect(a.id).not.toBe(b.id);
    await expect(first).rejects.toBeInstanceOf(Superseded);
    w.reply({ id: a.id, kind: "opened", sliced: { ...done.sliced, note: "late" }, mesh: done.mesh });
    w.reply({ id: b.id, kind: "opened", sliced: { ...done.sliced, note: "current" }, mesh: done.mesh });
    expect((await second).sliced.note).toBe("current");
  });

  test("drops stage reports of a superseded job", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), heard: string[] = [];
    const first = p.open(gcodeSource(MINI_GCODE, "a.gcode"), DEFAULT_SLICE, (s) => heard.push(`a:${s}`));
    const second = p.open(gcodeSource(MINI_GCODE, "b.gcode"), DEFAULT_SLICE, (s) => heard.push(`b:${s}`));
    first.catch(() => {});
    w.reply({ id: w.requests[0].id, kind: "stage", stage: "slicing" });
    w.reply({ id: w.requests[1].id, kind: "stage", stage: "reading" });
    expect(heard).toEqual(["b:reading"]);
    second.catch(() => {});
  });

  test("takes the lite mesh and hidden faces even when they come in the same task as the mesh", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
    const opening = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    const id = w.requests[0].id, hidden = new Uint8Array(done.mesh.tris).fill(1);
    w.reply({ id, kind: "opened", sliced: done.sliced, mesh: done.mesh });
    w.reply({ id, kind: "lite", mesh: done.mesh });
    w.reply({ id, kind: "hidden", hidden });
    const loaded = await opening;
    expect(await loaded.liteMesh()).toBe(done.mesh);
    expect(loaded.mesh.hidden).toBe(hidden);
  });

  test("a new open, a re-slice or dispose rejects a lite mesh asked for earlier and ends the wait for the faces", async () => {
    const stl = { kind: "stl" as const, file: new File([""], "p.stl"), fileHash: "p" };
    for (const next of ["open", "reslice", "dispose"] as const) {
      const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
      const opening = p.open(stl, DEFAULT_SLICE, noStage);
      w.reply({ id: w.requests[0].id, kind: "opened", sliced: done.sliced, mesh: { ...done.mesh } });
      const loaded = await opening;
      const lite = loaded.liteMesh(), settled = hiddenFacesSettled(loaded.mesh);
      if (next === "open") p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage).catch(() => {});
      if (next === "reslice") p.reslice({ ...DEFAULT_SLICE, layerHeight: mm(0.12) }, noStage).catch(() => {});
      if (next === "dispose") p.dispose();
      await expect(lite, next).rejects.toBeInstanceOf(Superseded);
      await settled;
      expect(loaded.mesh.hidden, next).toBeUndefined();
    }
  });

  test("an error after the mesh rejects the lite mesh, ends the wait for the faces and is logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
      const opening = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
      const id = w.requests[0].id;
      w.reply({ id, kind: "opened", sliced: done.sliced, mesh: { ...done.mesh } });
      const loaded = await opening;
      w.reply({ id, kind: "error", message: "out of memory" });
      await expect(loaded.liteMesh()).rejects.toThrow("out of memory");
      await hiddenFacesSettled(loaded.mesh);
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("out of memory"));
    } finally {
      logged.mockRestore();
    }
  });

  test("drops the lite mesh and hidden faces of a replaced print", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
    const first = p.open(gcodeSource(MINI_GCODE, "a.gcode"), DEFAULT_SLICE, noStage);
    const a = w.requests[0].id;
    w.reply({ id: a, kind: "opened", sliced: done.sliced, mesh: done.mesh });
    const old = await first;
    p.open(gcodeSource(MINI_GCODE, "b.gcode"), DEFAULT_SLICE, noStage).catch(() => {});
    w.reply({ id: a, kind: "lite", mesh: done.mesh });
    w.reply({ id: a, kind: "hidden", hidden: new Uint8Array(done.mesh.tris) });
    await expect(old.liteMesh()).rejects.toBeInstanceOf(Superseded);
    expect(old.mesh.hidden).toBeUndefined();
  });

  test("a worker crash after the mesh rejects its lite mesh", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
    const opening = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    w.reply({ id: w.requests[0].id, kind: "opened", sliced: done.sliced, mesh: done.mesh });
    const loaded = await opening;
    w.raw.onerror?.({ message: "out of memory" });
    await expect(loaded.liteMesh()).rejects.toThrow("out of memory");
    await hiddenFacesSettled(loaded.mesh);
  });

  test("a prebuilt part's null faces end the wait and leave its mesh whole", async () => {
    const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
    const opening = p.open({ kind: "bin", url: "part.bin" }, DEFAULT_SLICE, noStage);
    const id = w.requests[0].id;
    w.reply({ id, kind: "opened", sliced: done.sliced, mesh: { ...done.mesh } });
    const loaded = await opening;
    w.reply({ id, kind: "lite", mesh: done.mesh });
    w.reply({ id, kind: "hidden", hidden: null });
    await hiddenFacesSettled(loaded.mesh);
    expect(loaded.mesh.hidden).toBeUndefined();
  });

  test("a Cycles photo waits in fits for the faces a load is about to send", async () => {
    vi.stubGlobal("crossOriginIsolated", true);
    try {
      const w = scriptedWorker(), p = pipeline(() => w.worker), done = await sliced();
      const opening = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
      const id = w.requests[0].id;
      w.reply({ id, kind: "opened", sliced: done.sliced, mesh: { ...done.mesh } });
      const { mesh } = await opening;
      const scene = { part: { mesh }, film: { width: 8, height: 5 } } as unknown as Scene;
      let fit: unknown = null;
      const fits = cyclesEngine().fits(scene).then((f) => { fit = f; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fit).toBeNull();
      const hidden = new Uint8Array(mesh.tris).fill(1);
      w.reply({ id, kind: "hidden", hidden });
      await fits;
      expect(fit).toBe(true);
      expect(mesh.hidden).toBe(hidden);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("a worker crash rejects the live job, and the next call starts a fresh worker", async () => {
    const made: ReturnType<typeof scriptedWorker>[] = [];
    const p = pipeline(() => { const w = scriptedWorker(); made.push(w); return w.worker; });
    const crashed = p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage);
    made[0].raw.onerror?.({ message: "out of memory" });
    await expect(crashed).rejects.toThrow("out of memory");
    p.open(gcodeSource(MINI_GCODE), DEFAULT_SLICE, noStage).catch(() => {});
    expect(made).toHaveLength(2);
    expect(made[1].requests).toHaveLength(1);
  });

  test("re-slices an STL by naming only the settings, and re-sends the file to a fresh worker", async () => {
    const made: ReturnType<typeof scriptedWorker>[] = [];
    const p = pipeline(() => { const w = scriptedWorker(); made.push(w); return w.worker; });
    const done = await sliced();
    const stl = { kind: "stl" as const, file: new File([""], "p.stl"), fileHash: "p" };
    const opened = p.open(stl, DEFAULT_SLICE, noStage);
    made[0].reply({ id: made[0].requests[0].id, kind: "opened", sliced: done.sliced, mesh: done.mesh });
    await opened;
    const again = p.reslice({ ...DEFAULT_SLICE, layerHeight: mm(0.12) }, noStage);
    expect(made[0].requests.map((r) => r.op)).toEqual(["open", "reslice"]);
    made[0].reply({ id: made[0].requests[1].id, kind: "opened", sliced: done.sliced, mesh: done.mesh });
    await again;
    made[0].raw.onerror?.({ message: "lost" });
    p.reslice({ ...DEFAULT_SLICE, layerHeight: mm(0.16) }, noStage).catch(() => {});
    expect(made[1].requests.map((r) => r.op)).toEqual(["open"]);
  });
});
