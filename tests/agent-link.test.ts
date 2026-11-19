import { describe, expect, test } from "vitest";
import { BridgeLink, RETRY_FIRST_MS, RETRY_MAX_MS, type LinkState } from "../src/agent/link";
import { CLOSE, PROTOCOL, type JobId } from "../src/agent/protocol";
import { ManualClock, Sockets, type FakeSocket } from "./agent-wire-fixtures";

const TOKEN = "9c1e47a0d2b35f86e4a1";
const job = (id: string): JobId => id as JobId;

interface Rig {
  readonly link: BridgeLink;
  readonly sockets: Sockets;
  readonly clock: ManualClock;
  readonly states: LinkState[];
  readonly runs: { job: JobId; code: string }[];
  readonly cancels: JobId[];
}

function rig(): Rig {
  const sockets = new Sockets();
  const clock = new ManualClock();
  const states: LinkState[] = [];
  const runs: { job: JobId; code: string }[] = [];
  const cancels: JobId[] = [];
  const link = new BridgeLink(
    { openSocket: sockets.open, schedule: clock.schedule, pageId: "page-1" },
    { state: (s) => { states.push(s); }, run: (j, code) => { runs.push({ job: j, code }); }, cancel: (j) => { cancels.push(j); } },
  );
  return { link, sockets, clock, states, runs, cancels };
}

/** A link that has connected and been welcomed. */
function connected(): Rig & { readonly socket: FakeSocket } {
  const r = rig();
  r.link.connect(47615, TOKEN);
  r.sockets.last.welcome();
  return { ...r, socket: r.sockets.last };
}

const kinds = (states: readonly LinkState[]): string[] => states.map((s) => s.kind);

describe("connecting", () => {
  test("it dials the loopback port, says hello only once the socket is open, and is connected on welcome", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    const socket = r.sockets.last;
    expect(socket.url).toBe("ws://127.0.0.1:47615/");
    expect(socket.sent).toEqual([]);
    expect(kinds(r.states)).toEqual(["waiting"]);

    socket.open();
    expect(socket.messages).toEqual([{ hello: { app: "filament-booth", protocol: PROTOCOL, token: TOKEN, pageId: "page-1" } }]);
    expect(kinds(r.states)).toEqual(["waiting"]);

    socket.say({ welcome: { protocol: PROTOCOL } });
    expect(kinds(r.states)).toEqual(["waiting", "connected"]);
  });

  test("a reconnect says hello with the same page id", () => {
    const r = connected();
    r.socket.hangUp();
    r.clock.advance(RETRY_FIRST_MS);
    r.sockets.last.open();
    expect(r.sockets.last.messages).toEqual([{ hello: { app: "filament-booth", protocol: PROTOCOL, token: TOKEN, pageId: "page-1" } }]);
  });

  test("connect again replaces the old socket and ignores whatever it says late", () => {
    const r = connected();
    const old = r.socket;
    r.link.connect(5000, "another-token-1");
    expect(old.closedWith?.code).toBe(1000);
    expect(r.sockets.last.url).toBe("ws://127.0.0.1:5000/");
    old.say({ run: { job: job("late"), code: "import bpy" } });
    old.hangUp();
    expect(r.runs).toEqual([]);
    expect(r.clock.pending).toEqual([]);
  });
});

describe("retrying", () => {
  test("a bridge that is not there is retried after 0.5 s, doubling to 10 s", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      r.sockets.last.hangUp();
      delays.push(...r.clock.pending);
      r.clock.advance(RETRY_MAX_MS);
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000, 10_000]);
    expect(r.sockets.all).toHaveLength(9);
    expect(r.states).toHaveLength(1);
  });

  test("a welcome starts the backoff over", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    for (let i = 0; i < 3; i++) {
      r.sockets.last.hangUp();
      r.clock.advance(RETRY_MAX_MS);
    }
    r.sockets.last.welcome();
    r.sockets.last.hangUp();
    expect(r.clock.pending).toEqual([RETRY_FIRST_MS]);
    expect(kinds(r.states)).toEqual(["waiting", "connected", "waiting"]);
  });

  test("close stops the retries and says nothing more", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    r.sockets.last.hangUp();
    expect(r.clock.pending).toEqual([RETRY_FIRST_MS]);
    r.link.close();
    expect(r.clock.pending).toEqual([]);
    r.clock.advance(RETRY_MAX_MS);
    expect(r.sockets.all).toHaveLength(1);
    expect(kinds(r.states)).toEqual(["waiting"]);
  });
});

describe("a close the bridge chose", () => {
  test.each([
    ["badToken", CLOSE.badToken],
    ["originRefused", CLOSE.originRefused],
    ["replaced", CLOSE.replaced],
    ["protocolMismatch", CLOSE.protocolMismatch],
  ])("%s shows the bridge's reason and is not retried", (_name, code) => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    r.sockets.last.open();
    r.sockets.last.say({ refused: { reason: "because the bridge said so" } });
    r.sockets.last.hangUp(code, "short close reason");
    expect(r.states.at(-1)).toEqual({ kind: "refused", reason: "because the bridge said so" });
    expect(r.clock.pending).toEqual([]);
    r.clock.advance(RETRY_MAX_MS * 2);
    expect(r.sockets.all).toHaveLength(1);
  });

  test("without a refused message the close reason is shown, and without that a sentence for the code", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    r.sockets.last.hangUp(CLOSE.originRefused, "origin http://x is not allowed");
    expect(r.states.at(-1)).toEqual({ kind: "refused", reason: "origin http://x is not allowed" });

    r.link.connect(47615, TOKEN);
    r.sockets.last.hangUp(CLOSE.badToken, "");
    expect(r.states.at(-1)).toEqual({ kind: "refused", reason: "the token does not match the bridge's" });
  });

  test("connect after a refusal tries again", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    r.sockets.last.hangUp(CLOSE.badToken);
    r.link.connect(47615, "the-right-token");
    r.sockets.last.open();
    expect(r.sockets.last.messages[0]).toMatchObject({ hello: { token: "the-right-token" } });
  });

  test("a close with any other code is a dropped connection, not a refusal", () => {
    const r = connected();
    r.socket.hangUp(1001, "going away");
    expect(r.states.at(-1)).toEqual({ kind: "waiting" });
    expect(r.clock.pending).toEqual([RETRY_FIRST_MS]);
  });
});

describe("what the bridge asks", () => {
  test("run and cancel become events", () => {
    const r = connected();
    r.socket.say({ run: { job: job("a1"), code: "import bpy\nprint(1)" } });
    r.socket.say({ cancel: { job: job("a1") } });
    expect(r.runs).toEqual([{ job: "a1", code: "import bpy\nprint(1)" }]);
    expect(r.cancels).toEqual(["a1"]);
  });

  test.each([
    ["a frame that is not JSON", "not json"],
    ["a message of an unknown kind", JSON.stringify({ shout: {} })],
    ["a run with no job", JSON.stringify({ run: { code: "x" } })],
    ["a binary frame nobody announced", new Uint8Array([1, 2, 3]).buffer],
    ["a frame that is neither text nor bytes", 42],
  ])("%s closes the socket, and the link goes on retrying", (_name, frame) => {
    const r = connected();
    r.socket.sayRaw(frame);
    expect(r.socket.closedWith?.code).toBe(4100);
    expect(r.socket.closedWith?.reason).toMatch(/^bad frame/);
    r.socket.hangUp(4100);
    expect(r.states.at(-1)).toEqual({ kind: "waiting" });
    expect(r.clock.pending).toEqual([RETRY_FIRST_MS]);
  });

  test("anything but welcome first is a violation", () => {
    const r = rig();
    r.link.connect(47615, TOKEN);
    r.sockets.last.open();
    r.sockets.last.say({ run: { job: job("a1"), code: "x" } });
    expect(r.sockets.last.closedWith?.code).toBe(4100);
    expect(r.runs).toEqual([]);
  });

  test("a second welcome is a violation", () => {
    const r = connected();
    r.socket.say({ welcome: { protocol: PROTOCOL } });
    expect(r.socket.closedWith?.code).toBe(4100);
  });
});

describe("what the tab says", () => {
  test("output, progress and done are one frame each", () => {
    const r = connected();
    r.link.output(job("a1"), "hello\n");
    r.link.progress(job("a1"), "rendering 42%", 0.42);
    r.link.done(job("a1"), { kind: "cancelled", by: "user" });
    expect(r.socket.messages.slice(1)).toEqual([
      { output: { job: "a1", text: "hello\n" } },
      { progress: { job: "a1", text: "rendering 42%", fraction: 0.42 } },
      { done: { job: "a1", outcome: { kind: "cancelled", by: "user" } } },
    ]);
  });

  test("an image is its JSON frame and then exactly its thumbnail bytes, back to back", () => {
    const r = connected();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    r.link.image(job("a1"), { label: "render", path: "/work/out.png", width: 160, height: 200, note: "4/4 samples, Cycles" }, jpeg);
    r.link.done(job("a1"), { kind: "done" });
    expect(r.socket.sent.slice(1)).toEqual([
      { text: { image: { job: "a1", label: "render", path: "/work/out.png", width: 160, height: 200, note: "4/4 samples, Cycles", binary: 4 } } },
      { binary: jpeg },
      { text: { done: { job: "a1", outcome: { kind: "done" } } } },
    ]);
  });

  test("with no connection a frame is dropped, not queued for the next one", () => {
    const r = rig();
    r.link.output(job("a1"), "lost");
    r.link.connect(47615, TOKEN);
    r.link.output(job("a1"), "still lost: not welcomed yet");
    r.sockets.last.welcome();
    r.link.done(job("a1"), { kind: "done" });
    expect(r.sockets.last.messages.map((m) => Object.keys(m)[0])).toEqual(["hello", "done"]);
  });
});

describe("reading and writing files on the agent's machine", () => {
  test("a read is numbered, and its reply pairs with the binary frame that follows", async () => {
    const r = connected();
    const first = r.link.read(job("a1"), "parts/a.stl");
    const second = r.link.read(job("a1"), "parts/b.stl");
    expect(r.socket.messages.slice(1)).toEqual([
      { read: { call: 1, job: "a1", path: "parts/a.stl" } },
      { read: { call: 2, job: "a1", path: "parts/b.stl" } },
    ]);

    r.socket.say({ reply: { call: 2, kind: "read", name: "b.stl", binary: 3 } });
    r.socket.sayBinary(new Uint8Array([7, 8, 9]));
    r.socket.say({ reply: { call: 1, kind: "read", name: "a.stl", binary: 0 } });
    r.socket.sayBinary(new Uint8Array([]));

    const b = await second;
    expect(b.name).toBe("b.stl");
    expect([...new Uint8Array(await b.arrayBuffer())]).toEqual([7, 8, 9]);
    const a = await first;
    expect(a.name).toBe("a.stl");
    expect(a.size).toBe(0);
  });

  test("a read the bridge refuses rejects with its message, so the agent is told what to do", async () => {
    const r = connected();
    const read = r.link.read(job("a1"), "/etc/passwd");
    r.socket.say({ reply: { call: 1, kind: "failed", message: "/etc/passwd is outside the folders the booth may use. Use a path under the working directory." } });
    await expect(read).rejects.toThrow("Use a path under the working directory");
  });

  test("a binary frame of the wrong length is a violation and the read does not resolve", async () => {
    const r = connected();
    const read = r.link.read(job("a1"), "parts/a.stl");
    r.socket.say({ reply: { call: 1, kind: "read", name: "a.stl", binary: 3 } });
    r.socket.sayBinary(new Uint8Array([1, 2]));
    expect(r.socket.closedWith?.code).toBe(4100);
    r.socket.hangUp(4100);
    await expect(read).rejects.toThrow("the bridge went away");
  });

  test("a text frame where the announced bytes should be is a violation", () => {
    const r = connected();
    void r.link.read(job("a1"), "parts/a.stl").catch(() => {});
    r.socket.say({ reply: { call: 1, kind: "read", name: "a.stl", binary: 3 } });
    r.socket.say({ cancel: { job: job("a1") } });
    expect(r.socket.closedWith?.code).toBe(4100);
    expect(r.cancels).toEqual([]);
  });

  test("a write is its JSON frame and its bytes back to back, and resolves to the path the bridge wrote", async () => {
    const r = connected();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const write = r.link.write(job("a1"), "renders/", "part_20260101.png", bytes);
    expect(r.socket.sent.slice(1)).toEqual([
      { text: { write: { call: 1, job: "a1", path: "renders/", name: "part_20260101.png", binary: 4 } } },
      { binary: bytes },
    ]);
    r.socket.say({ reply: { call: 1, kind: "write", path: "/work/renders/part_20260101.png" } });
    expect(await write).toBe("/work/renders/part_20260101.png");
  });

  test("a write the bridge refuses rejects with its message", async () => {
    const r = connected();
    const write = r.link.write(job("a1"), "/etc/", "x.png", new Uint8Array([1]));
    r.socket.say({ reply: { call: 1, kind: "failed", message: "outside the folders" } });
    await expect(write).rejects.toThrow("outside the folders");
  });

  test("a reply to a call nobody made is a violation", () => {
    const r = connected();
    r.socket.say({ reply: { call: 99, kind: "write", path: "/x.png" } });
    expect(r.socket.closedWith?.code).toBe(4100);
  });

  test("a reply of the wrong kind is a violation", async () => {
    const r = connected();
    const read = r.link.read(job("a1"), "a.stl");
    r.socket.say({ reply: { call: 1, kind: "write", path: "/a.stl" } });
    expect(r.socket.closedWith?.code).toBe(4100);
    r.socket.hangUp(4100);
    await expect(read).rejects.toThrow("went away");
  });

  test("calls made with no connection reject at once", async () => {
    const r = rig();
    await expect(r.link.read(job("a1"), "a.stl")).rejects.toThrow("the bridge is not connected");
    r.link.connect(47615, TOKEN);
    await expect(r.link.write(job("a1"), "out.png", "x.png", new Uint8Array([1]))).rejects.toThrow("the bridge is not connected");
  });

  test("calls still waiting when the connection drops reject, and numbers are not reused", async () => {
    const r = connected();
    const read = r.link.read(job("a1"), "a.stl");
    const write = r.link.write(job("a1"), "out.png", "x.png", new Uint8Array([1]));
    r.socket.hangUp();
    await expect(read).rejects.toThrow("the bridge went away");
    await expect(write).rejects.toThrow("the bridge went away");

    r.clock.advance(RETRY_FIRST_MS);
    r.sockets.last.welcome();
    void r.link.read(job("a2"), "b.stl").catch(() => {});
    expect(r.sockets.last.messages.at(-1)).toEqual({ read: { call: 3, job: "a2", path: "b.stl" } });
  });

  test("close rejects the calls still waiting", async () => {
    const r = connected();
    const read = r.link.read(job("a1"), "a.stl");
    r.link.close();
    await expect(read).rejects.toThrow("the bridge went away");
  });
});
