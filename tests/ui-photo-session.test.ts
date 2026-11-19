import { describe, expect, test } from "vitest";
import { PhotoCancelled, type Photo } from "../src/photo/photo";
import { MAX_SHOTS, PhotoSession, type UrlApi } from "../src/ui/photo-session";
import { ScriptedRun } from "./ui-fixtures";

const photo = (n: number): Photo => ({
  png: new Blob([String(n)]), fileName: `part_${n}.png`, width: 100, height: 125, samples: 64, targetSamples: 64, stoppedBy: { kind: "samples" }, engine: "cycles", docRev: 1,
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
});
