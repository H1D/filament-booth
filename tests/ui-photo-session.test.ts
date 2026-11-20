import { describe, expect, test } from "vitest";
import { PhotoCancelled, type Photo } from "../src/photo/photo";
import { MAX_SHOTS, PhotoSession, type UrlApi } from "../src/ui/photo-session";
import { ScriptedRun } from "./ui-fixtures";

const photo = (n: number): Photo => ({
  png: new Blob([String(n)]), fileName: `part_${n}.png`, width: 100, height: 125, samples: 64, targetSamples: 64, stoppedBy: { kind: "samples" }, denoising: { kind: "denoised" }, engine: "cycles", docRev: 1,
});

function setup(starts: () => ScriptedRun) {
  const made: string[] = [];
  const revoked: string[] = [];
  const urls: UrlApi = {
    create: (blob) => { const url = `blob:${made.length}-${blob.size}`; made.push(url); return url; },
    revoke: (url) => { revoked.push(url); },
  };
  return { session: new PhotoSession(starts, urls), made, revoked };
}

describe("PhotoSession", () => {
  test("a run goes from preparing through rendering to a shot on show", () => {
    const run = new ScriptedRun();
    const { session } = setup(() => run);
    session.take();
    expect(session.state.get().run).toEqual({ phase: "running", progress: { state: "preparing", message: "Starting" } });
    run.emit({ state: "rendering", fraction: 0.4, image: null, etaS: 12 });
    expect(session.state.get().run).toMatchObject({ phase: "running", progress: { state: "rendering", fraction: 0.4 } });
    run.emit({ state: "developing" });
    run.emit({ state: "done", photo: photo(1) });
    const s = session.state.get();
    expect(s.run).toEqual({ phase: "idle" });
    expect(s.shots).toHaveLength(1);
    expect(s.shownId).toBe(s.shots[0].id);
    expect(run.listening).toBe(0);
  });

  test("cancel asks the run to stop and the card shows it cancelled once the run says so", () => {
    const run = new ScriptedRun();
    const { session } = setup(() => run);
    session.take();
    session.cancel();
    expect(run.cancelled).toBe(1);
    run.emit({ state: "cancelled" });
    expect(session.state.get().run).toEqual({ phase: "cancelled" });
    expect(session.state.get().shots).toHaveLength(0);
  });

  test("finish now is passed to the run", () => {
    const run = new ScriptedRun();
    const { session } = setup(() => run);
    session.take();
    session.finishNow();
    expect(run.finished).toBe(1);
  });

  test("a failed run keeps its message", () => {
    const run = new ScriptedRun();
    const { session } = setup(() => run);
    session.take();
    run.emit({ state: "failed", message: "out of memory" });
    expect(session.state.get().run).toEqual({ phase: "failed", message: "out of memory" });
  });

  test("a second press while one is rendering does nothing", () => {
    let starts = 0;
    const { session } = setup(() => { starts += 1; return new ScriptedRun(); });
    session.take();
    session.take();
    expect(starts).toBe(1);
  });

  test("take hands back the run it started, and null when it started none", () => {
    const run = new ScriptedRun();
    const { session } = setup(() => run);
    expect(session.take()).toBe(run);
    expect(session.take()).toBeNull();
    const refused = setup(() => { throw new Error("Open a part before taking a photo"); });
    expect(refused.session.take()).toBeNull();
  });

  test("a late event from an earlier run cannot overwrite the new one", () => {
    const first = new ScriptedRun();
    const second = new ScriptedRun();
    const runs = [first, second];
    const { session } = setup(() => runs.shift() ?? second);
    session.take();
    first.emit({ state: "cancelled" });
    session.take();
    first.emit({ state: "done", photo: photo(1) });
    second.emit({ state: "rendering", fraction: 0.1, image: null, etaS: null });
    expect(session.state.get().shots).toHaveLength(0);
    expect(session.state.get().run).toMatchObject({ phase: "running", progress: { state: "rendering" } });
  });

  test("a refused start (no part open) shows as a failed run", () => {
    const { session } = setup(() => { throw new Error("Open a part before taking a photo"); });
    session.take();
    expect(session.state.get().run).toEqual({ phase: "failed", message: "Open a part before taking a photo" });
  });

  test("the result promise settling is enough to end a run, once", async () => {
    const run = new ScriptedRun();
    Object.defineProperty(run, "result", { value: Promise.reject(new PhotoCancelled()) });
    const { session } = setup(() => run);
    session.take();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.state.get().run).toEqual({ phase: "cancelled" });
  });

  test("the tray is bounded and a dropped photo's URL is revoked", () => {
    const runs: ScriptedRun[] = [];
    const revoked: string[] = [];
    let created = 0;
    const session = new PhotoSession(() => { const r = new ScriptedRun(); runs.push(r); return r; }, {
      create: () => `u${++created}`, revoke: (u) => { revoked.push(u); },
    });
    for (let i = 0; i < MAX_SHOTS + 2; i++) {
      session.take();
      runs[i].emit({ state: "done", photo: photo(i) });
    }
    expect(session.state.get().shots).toHaveLength(MAX_SHOTS);
    expect(revoked).toEqual(["u1", "u2"]);
  });

  test("show picks a thumbnail, dismiss clears the view but keeps the tray, dispose revokes everything", () => {
    const runs: ScriptedRun[] = [];
    const revoked: string[] = [];
    const session = new PhotoSession(() => { const r = new ScriptedRun(); runs.push(r); return r; }, {
      create: () => `u${runs.length}`, revoke: (u) => { revoked.push(u); },
    });
    session.take();
    runs[0].emit({ state: "done", photo: photo(1) });
    session.take();
    runs[1].emit({ state: "done", photo: photo(2) });
    const [a, b] = session.state.get().shots;
    expect(session.state.get().shownId).toBe(b.id);
    session.show(a.id);
    expect(session.state.get().shownId).toBe(a.id);
    session.show(999);
    expect(session.state.get().shownId).toBe(a.id);
    session.dismiss();
    expect(session.state.get().shownId).toBeNull();
    expect(session.state.get().shots).toHaveLength(2);
    session.dispose();
    expect(revoked.sort()).toEqual(["u1", "u2"]);
    expect(session.state.get().shots).toHaveLength(0);
  });

  test("a photo is filed under its scene, and byScene keeps the newest of each", () => {
    const runs: ScriptedRun[] = [];
    let active = "a";
    const started: (string | undefined)[] = [];
    const session = new PhotoSession((id) => { started.push(id); const r = new ScriptedRun(); runs.push(r); return r; },
      { create: () => "u", revoke: () => {} }, () => active);
    session.take();
    runs[0].emit({ state: "done", photo: photo(1) });
    active = "b";
    session.take("a");
    runs[1].emit({ state: "done", photo: photo(2) });
    session.take();
    runs[2].emit({ state: "done", photo: photo(3) });
    expect(started).toEqual([undefined, "a", undefined]);
    const s = session.state.get();
    expect(s.shots.map((x) => x.sceneId)).toEqual(["a", "a", "b"]);
    expect([...s.byScene].map(([id, p]) => [id, p.fileName])).toEqual([["a", "part_2.png"], ["b", "part_3.png"]]);
  });

  test("takeAll photographs each scene in turn, and a failure moves on", () => {
    const runs: ScriptedRun[] = [];
    const started: (string | undefined)[] = [];
    const session = new PhotoSession((id) => {
      started.push(id);
      if (id === "gone") throw new Error("there is no scene gone");
      const r = new ScriptedRun(); runs.push(r); return r;
    }, { create: () => "u", revoke: () => {} });
    session.takeAll(["a", "gone", "b", "c"]);
    expect(session.state.get()).toMatchObject({ sceneId: "a", queued: ["gone", "b", "c"], batchSize: 4 });
    expect(session.take()).toBeNull();
    runs[0].emit({ state: "done", photo: photo(1) });
    expect(started).toEqual(["a", "gone", "b"]);
    expect(session.state.get()).toMatchObject({ sceneId: "b", queued: ["c"], run: { phase: "running" } });
    runs[1].emit({ state: "failed", message: "out of memory" });
    expect(session.state.get()).toMatchObject({ sceneId: "c", queued: [] });
    runs[2].emit({ state: "done", photo: photo(3) });
    const s = session.state.get();
    expect(s).toMatchObject({ run: { phase: "idle" }, queued: [], batchSize: 0, sceneId: null });
    expect([...s.byScene.keys()]).toEqual(["a", "c"]);
  });

  test("cancel ends the whole queue", () => {
    const runs: ScriptedRun[] = [];
    const session = new PhotoSession(() => { const r = new ScriptedRun(); runs.push(r); return r; }, { create: () => "u", revoke: () => {} });
    session.takeAll(["a", "b", "c"]);
    session.cancel();
    expect(runs[0].cancelled).toBe(1);
    expect(session.state.get().queued).toEqual([]);
    runs[0].emit({ state: "cancelled" });
    expect(runs).toHaveLength(1);
    expect(session.state.get()).toMatchObject({ run: { phase: "cancelled" }, batchSize: 0 });
  });
});
