import { describe, expect, test } from "vitest";
import { AGENT_STORAGE_KEY, AgentControl, OUTPUT_BATCH_MS, PROGRESS_WINDOW_MS } from "../src/agent/agent";
import { RETRY_FIRST_MS } from "../src/agent/link";
import { CLOSE, DEFAULT_PORT, type JobId, type TabMessage } from "../src/agent/protocol";
import { FakeRuntime, ManualClock, Sockets, type FakeSocket } from "./agent-wire-fixtures";

const TOKEN = "9c1e47a0d2b35f86e4a1";
const job = (id: string): JobId => id as JobId;
const tick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

interface Rig {
  readonly control: AgentControl;
  readonly runtime: FakeRuntime;
  readonly sockets: Sockets;
  readonly clock: ManualClock;
  readonly store: Map<string, string>;
}

function rig(options: { readonly saved?: unknown; readonly unavailable?: string; readonly brokenStorage?: boolean } = {}): Rig {
  const store = new Map<string, string>();
  if (options.saved !== undefined) store.set(AGENT_STORAGE_KEY, typeof options.saved === "string" ? options.saved : JSON.stringify(options.saved));
  const sockets = new Sockets();
  const clock = new ManualClock();
  const runtime = new FakeRuntime();
  const control = new AgentControl({
    storage: options.brokenStorage === true
      ? { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    runtime,
    unavailable: () => options.unavailable ?? null,
    pageId: "page-1",
    openSocket: sockets.open,
    schedule: clock.schedule,
  });
  return { control, runtime, sockets, clock, store };
}

const stored = (r: Rig): unknown => JSON.parse(r.store.get(AGENT_STORAGE_KEY) ?? "null");
const status = (r: Rig): string => r.control.state.get().status.kind;

/** Paired, switched on, Python loaded and the bridge's welcome received. */
async function connected(): Promise<Rig & { readonly socket: FakeSocket }> {
  const r = rig();
  r.control.pair(DEFAULT_PORT, TOKEN);
  r.control.enable();
  r.runtime.loaded();
  await tick();
  r.sockets.last.welcome();
  return { ...r, socket: r.sockets.last };
}

/** The frames the tab sent after its hello, as message kinds. */
const kinds = (socket: FakeSocket): string[] => socket.messages.slice(1).map((m) => Object.keys(m)[0]!);
const framesOf = (socket: FakeSocket, kind: string): TabMessage[] => socket.messages.filter((m) => kind in m);

describe("the switch", () => {
  test("a fresh page is off and starts nothing: no Python, no socket", () => {
    const r = rig();
    expect(r.control.state.get()).toEqual({ settings: { enabled: false, port: DEFAULT_PORT, token: "" }, status: { kind: "off" }, running: null });
    expect(r.runtime.starts).toBe(0);
    expect(r.sockets.all).toHaveLength(0);
  });

  test("the pairing link fills the port and token and leaves the switch off", () => {
    const r = rig();
    r.control.pair(5000, TOKEN);
    expect(r.control.settings).toEqual({ enabled: false, port: 5000, token: TOKEN });
    expect(stored(r)).toEqual({ enabled: false, port: 5000, token: TOKEN });
    expect(r.runtime.starts).toBe(0);
    expect(r.sockets.all).toHaveLength(0);
  });

  test("it does nothing without a token", () => {
    const r = rig();
    r.control.enable();
    expect(status(r)).toBe("off");
    expect(r.runtime.starts).toBe(0);
  });

  test("on: Python loads first, then the bridge is dialled, then the welcome connects", async () => {
    const r = rig();
    r.control.pair(5000, TOKEN);
    r.control.enable();
    expect(status(r)).toBe("starting");
    expect(r.runtime.starts).toBe(1);
    expect(r.sockets.all).toHaveLength(0);
    expect(stored(r)).toMatchObject({ enabled: true });

    r.runtime.loaded();
    await tick();
    expect(r.sockets.last.url).toBe("ws://127.0.0.1:5000/");
    expect(status(r)).toBe("waiting");
    r.sockets.last.welcome();
    expect(status(r)).toBe("connected");
    expect(r.sockets.last.messages[0]).toMatchObject({ hello: { token: TOKEN, pageId: "page-1" } });
  });

  test("Python that cannot load is unavailable with the reason, and switching off and on tries again", async () => {
    const r = rig();
    r.control.pair(DEFAULT_PORT, TOKEN);
    r.control.enable();
    r.runtime.failToLoad("the wasm did not download");
    await tick();
    expect(r.control.state.get().status).toEqual({ kind: "unavailable", reason: "Python did not start: the wasm did not download" });
    expect(r.sockets.all).toHaveLength(0);
    expect(r.control.settings.enabled).toBe(true);

    r.control.disable();
    expect(status(r)).toBe("off");
    r.control.enable();
    expect(status(r)).toBe("starting");
    expect(r.runtime.starts).toBe(2);
  });

  test("a page that cannot run Python says why and the switch does nothing", () => {
    const r = rig({ unavailable: "this page is not cross-origin isolated", saved: { enabled: true, port: 5000, token: TOKEN } });
    expect(r.control.state.get().status).toEqual({ kind: "unavailable", reason: "this page is not cross-origin isolated" });
    expect(r.control.settings.enabled).toBe(false);
    r.control.enable();
    expect(r.runtime.starts).toBe(0);
    expect(r.sockets.all).toHaveLength(0);
  });

  test("a switch left on is remembered and resumes at the next load", async () => {
    const r = rig({ saved: { enabled: true, port: 5000, token: TOKEN } });
    expect(r.runtime.starts).toBe(1);
    expect(status(r)).toBe("starting");
    r.runtime.loaded();
    await tick();
    expect(r.sockets.last.url).toBe("ws://127.0.0.1:5000/");
  });

  test.each([
    ["not JSON", "{oops"],
    ["a null record", "null"],
    ["the wrong types", JSON.stringify({ enabled: "yes", port: "5000", token: 7 })],
  ])("a saved record that is %s gives the defaults", (_name, saved) => {
    const r = rig({ saved });
    expect(r.control.settings).toEqual({ enabled: false, port: DEFAULT_PORT, token: "" });
  });

  test("a saved port out of range is replaced by the default and the rest is kept", () => {
    const r = rig({ saved: { enabled: false, port: 70000, token: TOKEN } });
    expect(r.control.settings).toEqual({ enabled: false, port: DEFAULT_PORT, token: TOKEN });
  });

  test("a switch saved on with no token is not on", () => {
    const r = rig({ saved: { enabled: true, port: 5000, token: "" } });
    expect(r.control.settings.enabled).toBe(false);
    expect(r.runtime.starts).toBe(0);
  });

  test("storage that refuses to read or write does not stop the page", () => {
    const r = rig({ brokenStorage: true });
    r.control.pair(5000, TOKEN);
    r.control.enable();
    expect(status(r)).toBe("starting");
  });

  test("the document is never where the settings go", () => {
    const r = rig();
    r.control.pair(5000, TOKEN);
    expect([...r.store.keys()]).toEqual([AGENT_STORAGE_KEY]);
  });

  test("the pairing link turns a switch that was on back off: a link alone cannot move a connected tab", async () => {
    const r = await connected();
    r.control.pair(6000, "another-token-1");
    expect(status(r)).toBe("off");
    expect(r.control.settings).toEqual({ enabled: false, port: 6000, token: "another-token-1" });
    expect(r.socket.closedWith?.code).toBe(1000);
    expect(r.runtime.disposed).toBe(1);
  });
});

describe("the port and the token", () => {
  test("a refused connection stays refused until the token changes, which dials again", async () => {
    const r = rig();
    r.control.pair(DEFAULT_PORT, "the-wrong-token");
    r.control.enable();
    r.runtime.loaded();
    await tick();
    r.sockets.last.open();
    r.sockets.last.say({ refused: { reason: "wrong token" } });
    r.sockets.last.hangUp(CLOSE.badToken);
    expect(r.control.state.get().status).toEqual({ kind: "refused", reason: "wrong token" });
    r.clock.advance(60_000);
    expect(r.sockets.all).toHaveLength(1);

    r.control.setToken(` ${TOKEN} `);
    expect(r.control.settings.token).toBe(TOKEN);
    expect(status(r)).toBe("waiting");
    r.sockets.last.open();
    expect(r.sockets.last.messages[0]).toMatchObject({ hello: { token: TOKEN } });
  });

  test("a new port while connected hangs up and dials the new one", async () => {
    const r = await connected();
    r.control.setPort(6001);
    expect(r.socket.closedWith?.code).toBe(1000);
    expect(r.sockets.last.url).toBe("ws://127.0.0.1:6001/");
    expect(stored(r)).toMatchObject({ port: 6001 });
  });

  test("a port that is not one is ignored", () => {
    const r = rig();
    for (const bad of [0, 65536, 1.5, Number.NaN]) r.control.setPort(bad);
    expect(r.control.settings.port).toBe(DEFAULT_PORT);
  });

  test("a new port while Python is still loading is used when it is ready", async () => {
    const r = rig();
    r.control.pair(DEFAULT_PORT, TOKEN);
    r.control.enable();
    r.control.setPort(6002);
    expect(r.sockets.all).toHaveLength(0);
    r.runtime.loaded();
    await tick();
    expect(r.sockets.last.url).toBe("ws://127.0.0.1:6002/");
  });

  test("clearing the token turns the switch off", async () => {
    const r = await connected();
    r.control.setToken("  ");
    expect(status(r)).toBe("off");
    expect(r.control.settings).toEqual({ enabled: false, port: DEFAULT_PORT, token: "" });
  });
});

describe("one script at a time", () => {
  test("a run goes to Python with the agent's code, and shows as running until it ends", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "import bpy\nprint(1)" } });
    expect(r.runtime.script.code).toBe("import bpy\nprint(1)");
    expect(r.control.state.get().running).toEqual({ job: "a1", progress: null });

    r.runtime.script.end({ kind: "done" });
    await tick();
    expect(r.control.state.get().running).toBeNull();
    expect(r.socket.messages.at(-1)).toEqual({ done: { job: "a1", outcome: { kind: "done" } } });
  });

  test("a failure is carried to the bridge as it is", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const outcome = { kind: "failed", type: "ValueError", message: "bad", traceback: "Traceback\nValueError: bad" } as const;
    r.runtime.script.end(outcome);
    await tick();
    expect(r.socket.messages.at(-1)).toEqual({ done: { job: "a1", outcome } });
  });

  test("a run while one is running is answered as failed and does not touch the running script", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "first" } });
    r.socket.say({ run: { job: job("a2"), code: "second" } });
    expect(r.runtime.scripts).toHaveLength(1);
    const refusal = framesOf(r.socket, "done")[0];
    expect(refusal).toMatchObject({ done: { job: "a2", outcome: { kind: "failed", type: "RuntimeError" } } });
    expect(JSON.stringify(refusal)).toContain("job a1");
    expect(JSON.stringify(refusal)).toContain("Stop script");
    expect(r.control.state.get().running?.job).toBe("a1");

    r.runtime.script.end({ kind: "done" });
    await tick();
    r.socket.say({ run: { job: job("a3"), code: "third" } });
    expect(r.runtime.script.code).toBe("third");
  });

  test("a cancel from the bridge stops that job as the agent", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "while True: pass" } });
    r.socket.say({ cancel: { job: job("other") } });
    expect(r.runtime.cancels).toEqual([]);
    r.socket.say({ cancel: { job: job("a1") } });
    expect(r.runtime.cancels).toEqual(["agent"]);
    await tick();
    expect(r.socket.messages.at(-1)).toEqual({ done: { job: "a1", outcome: { kind: "cancelled", by: "agent" } } });
  });

  test("Stop script stops it as the user, and the next script runs", async () => {
    const r = await connected();
    r.control.stopScript();
    expect(r.runtime.cancels).toEqual([]);
    r.socket.say({ run: { job: job("a1"), code: "while True: pass" } });
    r.control.stopScript();
    expect(r.runtime.cancels).toEqual(["user"]);
    await tick();
    expect(r.socket.messages.at(-1)).toEqual({ done: { job: "a1", outcome: { kind: "cancelled", by: "user" } } });
    r.socket.say({ run: { job: job("a2"), code: "print(2)" } });
    expect(r.runtime.script.code).toBe("print(2)");
  });
});

describe("what a script sends while it runs", () => {
  test("print output is batched into one frame per 250 ms and flushed before the outcome", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const { io } = r.runtime.script;
    io.print("one\n");
    io.print("two\n");
    expect(kinds(r.socket)).toEqual([]);
    r.clock.advance(OUTPUT_BATCH_MS);
    expect(r.socket.messages.slice(1)).toEqual([{ output: { job: "a1", text: "one\ntwo\n" } }]);

    io.print("three\n");
    r.runtime.script.end({ kind: "done" });
    await tick();
    expect(r.socket.messages.slice(2)).toEqual([
      { output: { job: "a1", text: "three\n" } },
      { done: { job: "a1", outcome: { kind: "done" } } },
    ]);
    r.clock.advance(OUTPUT_BATCH_MS * 4);
    expect(kinds(r.socket)).toEqual(["output", "output", "done"]);
  });

  test("progress goes out at once, then once per second with only the newest, and the badge sees every one", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const { io } = r.runtime.script;
    io.progress("rendering 1%", 0.01);
    io.progress("rendering 2%", 0.02);
    io.progress("rendering 3%", 0.03);
    expect(r.control.state.get().running?.progress).toBe("rendering 3%");
    expect(framesOf(r.socket, "progress")).toEqual([{ progress: { job: "a1", text: "rendering 1%", fraction: 0.01 } }]);

    r.clock.advance(PROGRESS_WINDOW_MS);
    expect(framesOf(r.socket, "progress").map((m) => "progress" in m && m.progress.text)).toEqual(["rendering 1%", "rendering 3%"]);

    r.clock.advance(PROGRESS_WINDOW_MS * 3);
    expect(framesOf(r.socket, "progress")).toHaveLength(2);
    io.progress("rendering 9%", 0.09);
    expect(framesOf(r.socket, "progress")).toHaveLength(3);
  });

  test("an image is sent with its thumbnail bytes before the outcome that follows it", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const meta = { label: "render", path: "/work/out.png", width: 160, height: 200, note: "4/4 samples, Cycles" } as const;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const thumbnail = new Blob([jpeg]);
    let release: () => void = () => {};
    thumbnail.arrayBuffer = () => new Promise((resolve) => { release = () => { resolve(jpeg.buffer); }; });
    r.runtime.script.io.image(meta, thumbnail);
    r.runtime.script.end({ kind: "done" });
    await tick();
    expect(kinds(r.socket)).toEqual([]);
    release();
    await tick();
    expect(r.socket.sent.slice(1)).toEqual([
      { text: { image: { job: "a1", ...meta, binary: 4 } } },
      { binary: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
      { text: { done: { job: "a1", outcome: { kind: "done" } } } },
    ]);
  });

  test("reading a file asks the bridge and returns the bytes it sends", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const read = r.runtime.script.io.read("parts/bracket.stl");
    expect(r.socket.messages.at(-1)).toEqual({ read: { call: 1, job: "a1", path: "parts/bracket.stl" } });
    r.socket.say({ reply: { call: 1, kind: "read", name: "bracket.stl", binary: 3 } });
    r.socket.sayBinary(new Uint8Array([1, 2, 3]));
    const file = await read;
    expect(file.name).toBe("bracket.stl");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  test("a path the bridge refuses reaches the script with the bridge's words", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const read = r.runtime.script.io.read("/etc/passwd");
    r.socket.say({ reply: { call: 1, kind: "failed", message: "/etc/passwd is outside the folders the booth may use. Use a path under the working directory." } });
    await expect(read).rejects.toThrow("Use a path under the working directory");
  });

  test("writing a file sends its bytes and resolves to the path the bridge wrote", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const write = r.runtime.script.io.write("renders/", "part_1.png", new Blob([new Uint8Array([9, 8, 7])]));
    await tick();
    expect(r.socket.sent.slice(1)).toEqual([
      { text: { write: { call: 1, job: "a1", path: "renders/", name: "part_1.png", binary: 3 } } },
      { binary: new Uint8Array([9, 8, 7]) },
    ]);
    r.socket.say({ reply: { call: 1, kind: "write", path: "/work/renders/part_1.png" } });
    expect(await write).toBe("/work/renders/part_1.png");
  });

  test("once a script has ended its io is closed: nothing is sent, files are refused", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    const { io } = r.runtime.script;
    r.runtime.script.end({ kind: "done" });
    await tick();
    const before = r.socket.sent.length;
    io.print("late\n");
    io.progress("late", null);
    io.image({ label: "preview", path: null, width: 1, height: 1, note: "" }, new Blob([new Uint8Array([1])]));
    r.clock.advance(PROGRESS_WINDOW_MS * 2);
    await tick();
    await expect(io.read("a.stl")).rejects.toThrow("the script has ended");
    await expect(io.write("a.png", "a.png", new Blob([new Uint8Array([1])]))).rejects.toThrow("the script has ended");
    expect(r.socket.sent).toHaveLength(before);
  });
});

describe("turning it off", () => {
  test("the running script is stopped as the user and the bridge is told before the socket closes", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "while True: pass" } });
    r.runtime.script.io.print("started\n");

    r.control.disable();
    expect(status(r)).toBe("off");
    expect(stored(r)).toMatchObject({ enabled: false, token: TOKEN });
    expect(r.runtime.cancels).toEqual(["user"]);

    await tick();
    expect(r.socket.messages.slice(1)).toEqual([
      { output: { job: "a1", text: "started\n" } },
      { done: { job: "a1", outcome: { kind: "cancelled", by: "user" } } },
    ]);
    expect(r.socket.closedWith?.code).toBe(1000);
    expect(r.runtime.disposed).toBe(1);
    expect(r.control.state.get().running).toBeNull();
    r.clock.advance(60_000);
    expect(r.sockets.all).toHaveLength(1);
  });

  test("with no script it hangs up and disposes the worker at once", async () => {
    const r = await connected();
    r.control.disable();
    expect(r.socket.closedWith?.code).toBe(1000);
    expect(r.runtime.disposed).toBe(1);
  });

  test("turned off while Python is still loading, nothing is dialled when it finishes", async () => {
    const r = rig();
    r.control.pair(DEFAULT_PORT, TOKEN);
    r.control.enable();
    r.control.disable();
    r.runtime.loaded();
    await tick();
    expect(r.sockets.all).toHaveLength(0);
    expect(status(r)).toBe("off");
  });

  test("turned off while waiting for the bridge, it stops retrying", async () => {
    const r = rig();
    r.control.pair(DEFAULT_PORT, TOKEN);
    r.control.enable();
    r.runtime.loaded();
    await tick();
    r.sockets.last.hangUp();
    expect(r.clock.pending).toEqual([RETRY_FIRST_MS]);
    r.control.disable();
    expect(r.clock.pending).toEqual([]);
  });

  test("switched on again while the old script is still ending, the new connection is kept", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "x" } });
    r.control.disable();
    r.control.enable();
    r.runtime.loaded();
    await tick();
    expect(r.sockets.all.length).toBeGreaterThanOrEqual(2);
    expect(r.sockets.last.closedWith).toBeNull();
    expect(status(r)).toBe("waiting");
  });
});

describe("the connection drops while a script runs", () => {
  test("the script goes on, its late frames are dropped, and a run after the reconnect is told why it cannot start yet", async () => {
    const r = await connected();
    r.socket.say({ run: { job: job("a1"), code: "render" } });
    r.socket.hangUp();
    expect(status(r)).toBe("waiting");
    expect(r.control.state.get().running?.job).toBe("a1");

    r.runtime.script.io.print("still going\n");
    r.clock.advance(OUTPUT_BATCH_MS);
    expect(kinds(r.socket)).toEqual([]);

    r.clock.advance(RETRY_FIRST_MS);
    const again = r.sockets.last;
    again.welcome();
    expect(status(r)).toBe("connected");
    again.say({ run: { job: job("a2"), code: "next" } });
    expect(again.messages.at(-1)).toMatchObject({ done: { job: "a2", outcome: { kind: "failed" } } });
    expect(r.runtime.scripts).toHaveLength(1);

    r.runtime.script.end({ kind: "done" });
    await tick();
    expect(r.control.state.get().running).toBeNull();
  });
});
