import { connect, createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
  PROTOCOL,
  parseBridgeMessage,
  type BridgeMessage,
  type JobId,
  type TabMessage,
} from "../src/agent/protocol";
import { UsageError, createBridge, loadBridgeFile, parseArgs, type BridgeConfig } from "../tools/agent/bridge";
import { Jobs, MAX_IMAGES, ToolRefusal, type JobReport, type Reported } from "../tools/agent/jobs";
import { TabServer, resolveInRoots, type TabServerOptions } from "../tools/agent/tabs";

const TOKEN = "9c1e47a0d2b35f86e4a1";
const ORIGIN = "http://localhost:5173";

/** A booth tab: a real WebSocket client that parses what the bridge sends, with the binary frame that follows kept beside it. */
class FakeTab {
  readonly #socket: WebSocket;
  readonly #messages: BridgeMessage[] = [];
  readonly #binaries: Buffer[] = [];
  readonly #waiting: (() => void)[] = [];
  readonly closed: Promise<{ readonly code: number; readonly reason: string }>;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on("message", (data, isBinary) => {
      const bytes = data as Buffer;
      if (isBinary) this.#binaries.push(bytes);
      else this.#messages.push(parseBridgeMessage(JSON.parse(bytes.toString("utf8"))));
      for (const wake of this.#waiting.splice(0)) wake();
    });
    this.closed = new Promise((done) => {
      socket.on("close", (code, reason) => { done({ code, reason: reason.toString("utf8") }); });
    });
  }

  static async open(port: number, origin: string | null = ORIGIN): Promise<FakeTab> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`, origin === null ? {} : { origin });
    const tab = new FakeTab(socket);
    await new Promise<void>((done, fail) => { socket.once("open", done); socket.once("error", fail); });
    return tab;
  }

  static async pair(port: number, pageId = "page-1", token = TOKEN): Promise<FakeTab> {
    const tab = await FakeTab.open(port);
    tab.send({ hello: { app: "filament-booth", protocol: PROTOCOL, token, pageId } });
    expect(await tab.next()).toEqual({ welcome: { protocol: PROTOCOL } });
    return tab;
  }

  send(message: TabMessage, binary?: Uint8Array): void {
    this.#socket.send(JSON.stringify(message));
    if (binary !== undefined) this.#socket.send(binary);
  }

  sendRaw(frame: string | Uint8Array): void {
    this.#socket.send(frame);
  }

  async next(): Promise<BridgeMessage> {
    while (this.#messages.length === 0) await new Promise<void>((wake) => { this.#waiting.push(wake); });
    return this.#messages.shift()!;
  }

  async nextBinary(): Promise<Buffer> {
    while (this.#binaries.length === 0) await new Promise<void>((wake) => { this.#waiting.push(wake); });
    return this.#binaries.shift()!;
  }

  async nextRun(): Promise<{ readonly job: JobId; readonly code: string }> {
    const message = await this.next();
    if (!("run" in message)) throw new Error(`expected run, got ${JSON.stringify(message)}`);
    return message.run;
  }

  async nextReply(): Promise<Extract<BridgeMessage, { reply: unknown }>["reply"]> {
    const message = await this.next();
    if (!("reply" in message)) throw new Error(`expected reply, got ${JSON.stringify(message)}`);
    return message.reply;
  }

  close(): void {
    this.#socket.close();
  }
}

interface Rig {
  readonly root: string;
  readonly tabs: TabServer;
  readonly jobs: Jobs;
  readonly port: number;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function folder(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "booth-bridge-"));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function rig(over: Partial<TabServerOptions> = {}, jobsOver: { readonly cancelGraceS?: number } = {}): Promise<Rig> {
  const root = await folder();
  const jobs = new Jobs({ tabs: { run: (job, code) => { tabs.run(job, code); }, cancel: (job) => { tabs.cancel(job); } }, ...jobsOver });
  const tabs = new TabServer({ port: 0, token: TOKEN, origins: [ORIGIN], roots: [root], log: () => {}, ...over }, jobs);
  cleanups.push(() => tabs.close());
  const listening = await tabs.listen();
  if (!listening.ok) throw new Error(listening.reason);
  return { root, tabs, jobs, port: listening.port };
}

async function pairedTab(r: { readonly port: number }, pageId?: string): Promise<FakeTab> {
  const tab = await FakeTab.pair(r.port, pageId);
  cleanups.push(() => { tab.close(); return Promise.resolve(); });
  return tab;
}

/** Starts a script and returns the job id the tab was told to run, with the pending report. */
async function startScript(r: Rig, tab: FakeTab, waitS = 5): Promise<{ readonly job: JobId; readonly report: Promise<Reported> }> {
  const report = r.jobs.run("import bpy", { waitS });
  const { job } = await tab.nextRun();
  return { job, report };
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const image = { label: "render", path: "/work/out.png", width: 1600, height: 2000, note: "431/512 samples, Cycles" } as const;

describe("pairing", () => {
  test("a tab with the token and an allowed origin is welcomed and becomes the paired tab", async () => {
    const r = await rig();
    expect(r.tabs.pageId).toBeNull();
    await pairedTab(r, "page-7");
    expect(r.tabs.pageId).toBe("page-7");
  });

  test("a wrong token is refused with the bad token code and the tab is not paired", async () => {
    const r = await rig();
    const tab = await FakeTab.open(r.port);
    tab.send({ hello: { app: "filament-booth", protocol: PROTOCOL, token: "not-the-token", pageId: "p" } });
    expect(await tab.next()).toMatchObject({ refused: { reason: expect.stringContaining("wrong token") as string } });
    expect((await tab.closed).code).toBe(4001);
    expect(r.tabs.pageId).toBeNull();
  });

  test.each([
    ["another origin", "https://evil.example"],
    ["no origin", null],
  ])("a connection with %s is refused before it can say hello", async (_name, origin) => {
    const r = await rig();
    const tab = await FakeTab.open(r.port, origin);
    expect(await tab.next()).toMatchObject({ refused: { reason: expect.stringContaining("not allowed") as string } });
    expect((await tab.closed).code).toBe(4003);
    expect(r.tabs.pageId).toBeNull();
  });

  test("an origin passed with --app is accepted", async () => {
    const r = await rig({ origins: [ORIGIN, "https://booth.example"] });
    const tab = await FakeTab.open(r.port, "https://booth.example");
    tab.send({ hello: { app: "filament-booth", protocol: PROTOCOL, token: TOKEN, pageId: "p" } });
    expect(await tab.next()).toEqual({ welcome: { protocol: PROTOCOL } });
  });

  test("a page speaking another protocol is refused with the mismatch code", async () => {
    const r = await rig();
    const tab = await FakeTab.open(r.port);
    tab.send({ hello: { app: "filament-booth", protocol: PROTOCOL + 1, token: TOKEN, pageId: "p" } });
    await tab.next();
    expect((await tab.closed).code).toBe(4010);
  });

  test("the newest tab wins: the previous one is closed as replaced and runs go to the new one", async () => {
    const r = await rig();
    const first = await pairedTab(r, "first");
    const second = await pairedTab(r, "second");
    expect(await first.next()).toMatchObject({ refused: { reason: expect.stringContaining("took over") as string } });
    expect((await first.closed).code).toBe(4008);
    expect(r.tabs.pageId).toBe("second");
    void r.jobs.run("import bpy", { waitS: 0.01 });
    expect((await second.nextRun()).code).toBe("import bpy");
  });

  test("a tab that sends anything before hello is closed as a protocol violation", async () => {
    const r = await rig();
    const tab = await FakeTab.open(r.port);
    tab.send({ output: { job: "j" as JobId, text: "x" } });
    expect((await tab.closed).code).toBe(1002);
  });

  test("a frame that is not JSON closes the socket", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    tab.sendRaw("not json");
    expect((await tab.closed).code).toBe(1002);
    await vi.waitFor(() => { expect(r.tabs.pageId).toBeNull(); });
  });

  test("waitForTab resolves as soon as a tab pairs and times out when none does", async () => {
    const r = await rig();
    expect(await r.tabs.waitForTab(20)).toBe(false);
    const waiting = r.tabs.waitForTab(5000);
    await pairedTab(r);
    expect(await waiting).toBe(true);
  });
});

describe("binding the port", () => {
  test("a busy port is reported, and listening again succeeds once the other holder is gone", async () => {
    const holder = await rig();
    const root = await folder();
    const second = new TabServer({ port: holder.port, token: TOKEN, origins: [ORIGIN], roots: [root], log: () => {} }, new Jobs({ tabs: { run: () => {}, cancel: () => {} } }));
    cleanups.push(() => second.close());
    expect(await second.listen()).toMatchObject({ ok: false, code: "EADDRINUSE" });
    await holder.tabs.close();
    expect(await second.listen()).toEqual({ ok: true, port: holder.port });
    expect(await second.listen()).toEqual({ ok: true, port: holder.port });
  });

  test("tool calls that arrive together share one bind", async () => {
    const holder = await rig();
    const port = holder.port;
    await holder.tabs.close();
    const root = await folder();
    const tabs = new TabServer({ port, token: TOKEN, origins: [ORIGIN], roots: [root], log: () => {} }, new Jobs({ tabs: { run: () => {}, cancel: () => {} } }));
    cleanups.push(() => tabs.close());
    expect(await Promise.all([tabs.listen(), tabs.listen(), tabs.listen()])).toEqual([1, 2, 3].map(() => ({ ok: true, port })));
  });
});

describe("a script's life", () => {
  test("running, then wait, then done: output, progress, an image and the outcome arrive in order and are not repeated", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const seen: string[] = [];
    const first = r.jobs.run("import bpy", { waitS: 0.3, sink: (text) => { seen.push(text); } });
    const { job } = await tab.nextRun();
    tab.send({ output: { job, text: "lights: 3\n" } });
    tab.send({ progress: { job, text: "rendering 8%", fraction: 0.08 } });
    tab.send({ image: { job, ...image, binary: jpeg.length } }, jpeg);

    const running = await first;
    expect(running.report).toMatchObject({ job, state: "running", output: "lights: 3\n", progress: "rendering 8%", error: null, images: [image] });
    expect(running.thumbnails).toEqual([jpeg]);
    expect(seen).toEqual(["rendering 8%"]);

    const second = r.jobs.wait(job, { waitS: 5 });
    tab.send({ output: { job, text: "saved\n" } });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    const done = await second;
    expect(done.report).toMatchObject({ job, state: "done", output: "saved\n", progress: null, error: null, images: [] });
    expect(done.thumbnails).toEqual([]);

    const again = await r.jobs.wait(job, { waitS: 1 });
    expect(again.report).toMatchObject({ state: "done", output: "", images: [] });
  });

  test("a failed script reports the error the tab sent", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    tab.send({ done: { job, outcome: { kind: "failed", type: "ValueError", message: "too bright", traceback: "Traceback...\nValueError: too bright" } } });
    expect((await report).report).toMatchObject({ state: "failed", error: { type: "ValueError", message: "too bright", traceback: "Traceback...\nValueError: too bright" } });
  });

  test("a second script while one runs is refused and names the running job", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    await expect(r.jobs.run("print(1)", { waitS: 1 })).rejects.toThrow(new RegExp(`${job}.*still running`));
    await expect(r.jobs.run("print(1)", { waitS: 1 })).rejects.toBeInstanceOf(ToolRefusal);
  });

  test("a call that detaches does not stop the job and does not swallow its output", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const detach = new AbortController();
    let sawProgress: () => void = () => {};
    const progressed = new Promise<void>((done) => { sawProgress = done; });
    const first = r.jobs.run("import bpy", { waitS: 30, signal: detach.signal, sink: () => { sawProgress(); } });
    const { job } = await tab.nextRun();
    tab.send({ output: { job, text: "before\n" } });
    tab.send({ progress: { job, text: "working", fraction: null } });
    await progressed;
    detach.abort();
    await first;
    expect(r.jobs.isRunning(job)).toBe(true);

    const resumed = r.jobs.wait(job, { waitS: 5 });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    expect((await resumed).report).toMatchObject({ state: "done", output: "before\n" });
  });

  test("the tab's output is cut to the last 20 000 characters and says how much was dropped", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    tab.send({ output: { job, text: "a".repeat(15_000) } });
    tab.send({ output: { job, text: "b".repeat(15_000) } });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    const { output } = (await report).report;
    expect(output).toBe(`[10000 earlier characters dropped]\n${"a".repeat(5000)}${"b".repeat(15_000)}`);
  });

  test("cancel sends cancel to the tab and reports the cancelled state the tab confirms", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    const cancelling = r.jobs.cancel(job);
    expect(await tab.next()).toEqual({ cancel: { job } });
    tab.send({ done: { job, outcome: { kind: "cancelled", by: "agent" } } });
    expect((await cancelling).report).toMatchObject({ job, state: "cancelled", error: null });
  });

  test("cancel on a job the tab does not confirm says the cancel is pending and leaves the job running", async () => {
    const r = await rig({}, { cancelGraceS: 0.05 });
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    const { report } = await r.jobs.cancel(job);
    expect(report).toMatchObject({ state: "running", progress: expect.stringContaining("cancel requested") as string });
    expect(r.jobs.isRunning(job)).toBe(true);
  });

  test("cancel on a job that already ended returns its final state", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    await report;
    expect((await r.jobs.cancel(job)).report.state).toBe("done");
  });

  test("a job id this bridge never issued is refused", async () => {
    const r = await rig();
    await expect(r.jobs.wait("deadbeef", { waitS: 1 })).rejects.toThrow(/No job deadbeef/);
    await expect(r.jobs.cancel("deadbeef")).rejects.toBeInstanceOf(ToolRefusal);
  });

  test("when the tab's socket closes mid-job the job fails with the disconnect", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    tab.close();
    expect((await report).report).toMatchObject({ job, state: "failed", error: { message: "the booth tab disconnected" } });
    expect(r.tabs.pageId).toBeNull();
  });

  test("when a newer tab takes over mid-job the job fails and the newer tab is not told about it", async () => {
    const r = await rig();
    const first = await pairedTab(r, "first");
    const { report } = await startScript(r, first);
    await pairedTab(r, "second");
    expect((await report).report).toMatchObject({ state: "failed", error: { message: expect.stringContaining("the booth tab disconnected") as string } });
  });

  test("starting a script with no tab is refused", async () => {
    const r = await rig();
    await expect(r.jobs.run("import bpy", { waitS: 1 })).rejects.toThrow(/tab disconnected before the script could start/);
  });
});

describe("binary frames", () => {
  test("an image whose bytes do not match its declared length closes the socket", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ image: { job, ...image, binary: 99 } }, jpeg);
    expect((await tab.closed).code).toBe(1002);
  });

  test("a text frame where a binary frame is due closes the socket", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ image: { job, ...image, binary: jpeg.length } });
    tab.send({ output: { job, text: "x" } });
    expect((await tab.closed).code).toBe(1002);
  });

  test("a binary frame nobody announced closes the socket", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    tab.sendRaw(jpeg);
    expect((await tab.closed).code).toBe(1002);
  });

  test("a report carries the newest images and says how many older ones it dropped", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    for (let i = 0; i < MAX_IMAGES + 3; i++) tab.send({ image: { job, ...image, note: `preview ${i}`, binary: jpeg.length } }, jpeg);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    const done = await report;
    expect(done.report.images.map((meta) => meta.note)).toEqual(Array.from({ length: MAX_IMAGES }, (_, i) => `preview ${i + 3}`));
    expect(done.thumbnails).toHaveLength(MAX_IMAGES);
    expect(done.report.output).toBe(`[3 earlier images dropped, a report carries the newest ${MAX_IMAGES}]\n`);
  });

  test("an image for a job that is not running is dropped", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job, report } = await startScript(r, tab);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    await report;
    tab.send({ image: { job, ...image, binary: jpeg.length } }, jpeg);
    tab.send({ output: { job, text: "late" } });
    await new Promise((wake) => setTimeout(wake, 30));
    expect((await r.jobs.wait(job, { waitS: 1 })).report).toMatchObject({ output: "", images: [] });
  });
});

describe("files", () => {
  test("a write inside the working directory lands there and the reply carries the absolute path", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    tab.send({ write: { call: 1, job, path: "//renders/", name: "photo.png", binary: png.length } }, png);
    expect(await tab.nextReply()).toEqual({ call: 1, kind: "write", path: join(r.root, "renders", "photo.png") });
    expect([...(await readFile(join(r.root, "renders", "photo.png")))]).toEqual([...png]);
  });

  test("a write to a path with an extension uses that file name, not the suggested one", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ write: { call: 1, job, path: "hero.png", name: "photo.png", binary: 1 } }, new Uint8Array([9]));
    expect(await tab.nextReply()).toEqual({ call: 1, kind: "write", path: join(r.root, "hero.png") });
  });

  test("a read returns the file name and its bytes as the frame that follows", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    await writeFile(join(r.root, "bracket.stl"), "solid x");
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ read: { call: 2, job, path: "bracket.stl" } });
    expect(await tab.nextReply()).toEqual({ call: 2, kind: "read", name: "bracket.stl", binary: 7 });
    expect((await tab.nextBinary()).toString("utf8")).toBe("solid x");
  });

  test("a read of a file that does not exist fails with a message, not a closed socket", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ read: { call: 3, job, path: "missing.stl" } });
    expect(await tab.nextReply()).toMatchObject({ call: 3, kind: "failed", message: expect.stringContaining("no such file") as string });
  });

  test("a read or write for a job that is not the running one fails and tells the agent why", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    await writeFile(join(r.root, "a.stl"), "x");
    tab.send({ read: { call: 1, job: "stale" as JobId, path: "a.stl" } });
    expect(await tab.nextReply()).toMatchObject({ call: 1, kind: "failed", message: expect.stringContaining("not the running job") as string });
    tab.send({ write: { call: 2, job: "stale" as JobId, path: "b.png", name: "b.png", binary: 1 } }, new Uint8Array([1]));
    expect(await tab.nextReply()).toMatchObject({ call: 2, kind: "failed", message: expect.stringContaining("not the running job") as string });
  });

  test("a path outside the roots fails and names the working directory and --allow", async () => {
    const r = await rig();
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ read: { call: 1, job, path: "../outside.stl" } });
    const reply = await tab.nextReply();
    expect(reply).toMatchObject({ call: 1, kind: "failed" });
    expect(reply.kind === "failed" ? reply.message : "").toContain(`under the working directory ${r.root}`);
    expect(reply.kind === "failed" ? reply.message : "").toContain("--allow");
  });

  test("a folder passed as an extra root is readable", async () => {
    const extra = await folder();
    await writeFile(join(extra, "part.stl"), "solid y");
    const r = await rig({ roots: [await folder(), extra] });
    const tab = await pairedTab(r);
    const { job } = await startScript(r, tab, 0.01);
    tab.send({ read: { call: 1, job, path: join(extra, "part.stl") } });
    expect(await tab.nextReply()).toMatchObject({ call: 1, kind: "read", name: "part.stl" });
  });
});

describe("resolveInRoots", () => {
  test("relative paths and the // prefix resolve against the first root", async () => {
    const root = await folder();
    expect(await resolveInRoots("a/b.stl", [root], null)).toEqual({ ok: true, path: join(root, "a", "b.stl") });
    expect(await resolveInRoots("//a/b.stl", [root], null)).toEqual({ ok: true, path: join(root, "a", "b.stl") });
  });

  test("a path that climbs out with .. is refused, even when it climbs back in by name", async () => {
    const root = await folder();
    expect(await resolveInRoots("../x.png", [root], null)).toMatchObject({ ok: false });
    expect(await resolveInRoots("a/../../x.png", [root], null)).toMatchObject({ ok: false });
    expect(await resolveInRoots("a/../x.png", [root], null)).toMatchObject({ ok: true });
  });

  test("a sibling folder whose name starts with the root's name is outside it", async () => {
    const parent = await folder();
    const root = join(parent, "work");
    await mkdir(root);
    await mkdir(join(parent, "work-private"));
    expect(await resolveInRoots(join(parent, "work-private", "x"), [root], null)).toMatchObject({ ok: false });
  });

  test("a symlink inside the root that points outside is refused for reads and for writes below it", async () => {
    const root = await folder();
    const outside = await folder();
    await writeFile(join(outside, "secret.txt"), "s");
    await symlink(outside, join(root, "link"));
    await symlink(join(outside, "secret.txt"), join(root, "file-link"));
    expect(await resolveInRoots("link/secret.txt", [root], null)).toMatchObject({ ok: false });
    expect(await resolveInRoots("file-link", [root], null)).toMatchObject({ ok: false });
    expect(await resolveInRoots("link/new/out.png", [root], { name: "out.png" })).toMatchObject({ ok: false });
  });

  test("a dangling symlink is refused because it can be pointed anywhere", async () => {
    const root = await folder();
    await symlink(join(root, "..", "nowhere"), join(root, "dangling.png"));
    expect(await resolveInRoots("dangling.png", [root], { name: "x.png" })).toMatchObject({ ok: false });
  });

  test("a symlink that stays inside the root is fine", async () => {
    const root = await folder();
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "alias"));
    expect(await resolveInRoots("alias/x.stl", [root], null)).toMatchObject({ ok: true });
  });

  test("a write path that ends in a separator, names a folder or has no extension is a folder for the suggested name", async () => {
    const root = await folder();
    await mkdir(join(root, "existing"));
    const name = { name: "photo.png" };
    expect(await resolveInRoots("out/", [root], name)).toEqual({ ok: true, path: join(root, "out", "photo.png") });
    expect(await resolveInRoots("existing", [root], name)).toEqual({ ok: true, path: join(root, "existing", "photo.png") });
    expect(await resolveInRoots("renders", [root], name)).toEqual({ ok: true, path: join(root, "renders", "photo.png") });
    expect(await resolveInRoots("hero.png", [root], name)).toEqual({ ok: true, path: join(root, "hero.png") });
  });

  test("a suggested name that is not a plain file name is refused", async () => {
    const root = await folder();
    expect(await resolveInRoots("out/", [root], { name: "../x.png" })).toMatchObject({ ok: false });
    expect(await resolveInRoots("out/", [root], { name: "" })).toMatchObject({ ok: false });
  });
});

describe("the command line", () => {
  test("no flags serves with the defaults", () => {
    expect(parseArgs([], "/work")).toEqual({ mode: "serve", port: null, token: null, apps: [], allow: [] });
  });

  test("--token is the token the booth tab made", () => {
    expect(parseArgs(["--token", "fresh-token-0001"], "/work").token).toBe("fresh-token-0001");
  });

  test("--pair, --port, --app and --allow are read, with --allow resolved against the working directory", () => {
    const options = parseArgs(["--pair", "--port", "5000", "--app", "https://booth.example/", "--app", "http://localhost:4000", "--allow", "shared", "--allow", "/data"], "/work");
    expect(options.mode).toBe("pair");
    expect(options.port).toBe(5000);
    expect(options.apps.map((url) => url.origin)).toEqual(["https://booth.example", "http://localhost:4000"]);
    expect(options.allow).toEqual([resolve("/work", "shared"), "/data"]);
  });

  test.each([
    [["--port", "0"], "--port"],
    [["--port", "http"], "--port"],
    [["--app", "booth.example"], "--app"],
    [["--app", "ftp://booth.example"], "--app"],
    [["--token", "short"], "--token"],
    [["--token", "has space in it"], "--token"],
    [["--nope"], "nope"],
    [["stray"], "stray"],
  ])("%j is a usage error that names %s", (argv, mention) => {
    expect(() => parseArgs(argv, "/work")).toThrow(UsageError);
    expect(() => parseArgs(argv, "/work")).toThrow(mention);
  });
});

describe("the token and port file", () => {
  test("it is created on first use with mode 600 and read back unchanged afterwards", async () => {
    const dir = join(await folder(), "filament-booth");
    const first = await loadBridgeFile(dir);
    expect(first.token).toMatch(/^[0-9a-f]{32}$/);
    expect(first.port).toBe(47615);
    expect((await stat(join(dir, "bridge.json"))).mode & 0o777).toBe(0o600);
    expect(await loadBridgeFile(dir)).toEqual(first);
  });

  test("a file the user edited is honoured and a loose mode is tightened", async () => {
    const dir = await folder();
    await writeFile(join(dir, "bridge.json"), JSON.stringify({ port: 5001, token: "abcdefgh12345678" }), { mode: 0o644 });
    expect(await loadBridgeFile(dir)).toEqual({ port: 5001, token: "abcdefgh12345678" });
    expect((await stat(join(dir, "bridge.json"))).mode & 0o777).toBe(0o600);
  });

  test.each([
    ["not JSON", "{"],
    ["a token that is too short", JSON.stringify({ port: 5001, token: "abc" })],
    ["a port out of range", JSON.stringify({ port: 70000, token: "abcdefgh12345678" })],
  ])("a file with %s is reported by name and left alone", async (_name, body) => {
    const dir = await folder();
    await writeFile(join(dir, "bridge.json"), body);
    await expect(loadBridgeFile(dir)).rejects.toThrow(join(dir, "bridge.json"));
    expect(await readFile(join(dir, "bridge.json"), "utf8")).toBe(body);
  });

  test("two bridges starting together end up with the same token", async () => {
    const dir = await folder();
    const [a, b] = await Promise.all([loadBridgeFile(dir), loadBridgeFile(dir)]);
    expect(a).toEqual(b);
  });
});

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;
type Block = { readonly type: string; readonly text?: string; readonly data?: string; readonly mimeType?: string };
const blocks = (result: ToolResult): readonly Block[] => result.content as Block[];
const textOf = (result: ToolResult): string => blocks(result).find((block) => block.type === "text")?.text ?? "";
const reportOf = (result: ToolResult): JobReport => result.structuredContent as unknown as JobReport;

interface Agent {
  readonly client: Client;
  readonly bridge: ReturnType<typeof createBridge>;
  readonly root: string;
  readonly port: number;
  call(name: string, args: Record<string, unknown>, options?: Parameters<Client["callTool"]>[2]): Promise<ToolResult>;
}

/** The bridge's MCP side wired to a real SDK client over the in-memory transport, and its tab server on an ephemeral port. */
async function agent(over: Partial<BridgeConfig> = {}, listen = true): Promise<Agent> {
  const root = await folder();
  const bridge = createBridge({ port: 0, token: TOKEN, origins: [ORIGIN], roots: [root], app: new URL("http://localhost:5173/"), tabWaitMs: 0, log: () => {}, ...over });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await bridge.server.connect(serverSide);
  const client = new Client({ name: "test-agent", version: "1" });
  await client.connect(clientSide);
  cleanups.push(() => bridge.close());
  cleanups.push(() => client.close());
  let port = over.port ?? 0;
  if (listen) {
    const listening = await bridge.tabs.listen();
    if (!listening.ok) throw new Error(listening.reason);
    port = listening.port;
  }
  return { client, bridge, root, port, call: (name, args, options) => client.callTool({ name, arguments: args }, undefined, options) };
}

describe("the tools", () => {
  test("three tools are listed with their descriptions and the wait_s range", async () => {
    const a = await agent();
    const { tools } = await a.client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["booth_cancel", "booth_python", "booth_wait"]);
    for (const tool of tools) expect(tool.description).toBeTruthy();
    const python = tools.find((tool) => tool.name === "booth_python")!;
    expect(python.description).toContain("bpy.booth.reference()");
    expect(python.inputSchema).toMatchObject({
      required: ["code"],
      properties: { code: { type: "string" }, wait_s: { type: "number", minimum: 1, maximum: 600, default: 50 } },
    });
    expect(tools.find((tool) => tool.name === "booth_wait")!.inputSchema).toMatchObject({ required: ["job"] });
    expect(tools.find((tool) => tool.name === "booth_cancel")!.inputSchema).toMatchObject({ required: ["job"] });
  });

  test.each([0, 601])("wait_s %d is refused by the schema", async (wait) => {
    const a = await agent();
    await pairedTab(a);
    const result = await a.call("booth_python", { code: "x", wait_s: wait });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("wait_s");
  });

  test("with no tab, the tool returns the pairing link built from the bridge's port and token", async () => {
    const a = await agent();
    const result = await a.call("booth_python", { code: "print(1)" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(`http://localhost:5173/#agent=${a.port}.${TOKEN}`);
    expect(textOf(result)).toContain("No booth tab is connected");
  });

  test("a tab that connects while the call waits gets the script", async () => {
    const a = await agent({ tabWaitMs: 5000 });
    const call = a.call("booth_python", { code: "print(1)" });
    await new Promise((wake) => setTimeout(wake, 20));
    const tab = await pairedTab(a);
    const { job } = await tab.nextRun();
    tab.send({ done: { job, outcome: { kind: "done" } } });
    expect(reportOf(await call)).toMatchObject({ job, state: "done" });
  });

  test("a tab with the wrong token or the wrong origin never receives a script", async () => {
    const a = await agent();
    const wrongToken = await FakeTab.open(a.port);
    wrongToken.send({ hello: { app: "filament-booth", protocol: PROTOCOL, token: "wrong", pageId: "p" } });
    const wrongOrigin = await FakeTab.open(a.port, "https://evil.example");
    wrongOrigin.send({ hello: { app: "filament-booth", protocol: PROTOCOL, token: TOKEN, pageId: "p" } });
    expect([(await wrongToken.closed).code, (await wrongOrigin.closed).code]).toEqual([4001, 4003]);
    const result = await a.call("booth_python", { code: "print(1)" });
    expect(textOf(result)).toContain("No booth tab is connected");
  });

  test("the newest tab gets the script", async () => {
    const a = await agent();
    const older = await pairedTab(a, "older");
    const newer = await pairedTab(a, "newer");
    expect((await older.closed).code).toBe(4008);
    const call = a.call("booth_python", { code: "print(1)" });
    const { job } = await newer.nextRun();
    newer.send({ done: { job, outcome: { kind: "done" } } });
    expect(reportOf(await call).state).toBe("done");
  });

  test("a script that outlives wait_s is running, and booth_wait picks it up without repeating output", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const first = a.call("booth_python", { code: "import bpy", wait_s: 1 });
    const { job } = await tab.nextRun();
    tab.send({ output: { job, text: "step 1\n" } });
    tab.send({ progress: { job, text: "rendering 8%", fraction: 0.08 } });
    const running = reportOf(await first);
    expect(running).toMatchObject({ job, state: "running", output: "step 1\n", progress: "rendering 8%", error: null, images: [] });
    expect(textOf(await a.call("booth_wait", { job, wait_s: 1 }))).toContain("rendering 8%");

    const second = a.call("booth_wait", { job, wait_s: 5 });
    tab.send({ output: { job, text: "step 2\n" } });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    const done = await second;
    expect(reportOf(done)).toMatchObject({ job, state: "done", output: "step 2\n", progress: null });
    expect(textOf(done)).toContain("--- output\nstep 2");
  });

  test("a failed script comes back with its error and traceback as a result, not a tool error", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const call = a.call("booth_python", { code: "boom" });
    const { job } = await tab.nextRun();
    tab.send({ done: { job, outcome: { kind: "failed", type: "ValueError", message: "too bright", traceback: "Traceback (most recent call last):\nValueError: too bright" } } });
    const result = await call;
    expect(result.isError).toBeUndefined();
    expect(reportOf(result)).toMatchObject({ state: "failed", error: { type: "ValueError", message: "too bright" } });
    expect(textOf(result)).toContain("--- error\nTraceback (most recent call last):");
  });

  test("progress from the tab reaches a client that asked for progress notifications", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const seen: { progress: number; message?: string | undefined }[] = [];
    const call = a.call("booth_python", { code: "import bpy" }, { onprogress: (progress) => { seen.push(progress); } });
    const { job } = await tab.nextRun();
    tab.send({ progress: { job, text: "slicing", fraction: null } });
    tab.send({ progress: { job, text: "rendering 8%", fraction: 0.08 } });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    await call;
    expect(seen).toEqual([{ progress: 1, message: "slicing" }, { progress: 2, message: "rendering 8%" }]);
  });

  test("an image arrives as an image block beside the report that describes it", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const call = a.call("booth_python", { code: "import bpy" });
    const { job } = await tab.nextRun();
    tab.send({ image: { job, ...image, binary: jpeg.length } }, jpeg);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    const result = await call;
    expect(blocks(result).map((block) => block.type)).toEqual(["text", "image"]);
    expect(blocks(result)[1]).toMatchObject({ mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") });
    expect(reportOf(result).images).toEqual([image]);
    expect(textOf(result)).toContain("render 1600x2000 /work/out.png (431/512 samples, Cycles)");
  });

  test("the agent gives up on a call: the job keeps running and the next report still has its output", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const abort = new AbortController();
    const first = a.call("booth_python", { code: "import bpy", wait_s: 30 }, { signal: abort.signal });
    const { job } = await tab.nextRun();
    tab.send({ output: { job, text: "kept\n" } });
    tab.send({ progress: { job, text: "working", fraction: null } });
    await vi.waitFor(() => { expect(a.bridge.jobs.isRunning(job)).toBe(true); });
    abort.abort();
    await expect(first).rejects.toBeDefined();
    expect(a.bridge.jobs.isRunning(job)).toBe(true);

    const resumed = a.call("booth_wait", { job, wait_s: 5 });
    tab.send({ done: { job, outcome: { kind: "done" } } });
    expect(reportOf(await resumed)).toMatchObject({ state: "done", output: "kept\n" });
  });

  test("booth_cancel tells the tab to stop and reports the cancelled state, to both calls", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const running = a.call("booth_python", { code: "while True: pass", wait_s: 30 });
    const { job } = await tab.nextRun();
    const cancelling = a.call("booth_cancel", { job });
    expect(await tab.next()).toEqual({ cancel: { job } });
    tab.send({ done: { job, outcome: { kind: "cancelled", by: "agent" } } });
    expect(reportOf(await cancelling)).toMatchObject({ job, state: "cancelled", error: null });
    expect(reportOf(await running).state).toBe("cancelled");
  });

  test("a second booth_python while one runs is a tool error naming the running job", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const first = a.call("booth_python", { code: "import bpy", wait_s: 30 });
    const { job } = await tab.nextRun();
    const second = await a.call("booth_python", { code: "print(2)" });
    expect(second.isError).toBe(true);
    expect(textOf(second)).toContain(`Job ${job} is still running`);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    await first;
  });

  test("a job id the bridge never issued is a tool error when a tab is connected, and the pairing help when none is", async () => {
    const a = await agent();
    const unpaired = await a.call("booth_wait", { job: "nope" });
    expect(textOf(unpaired)).toContain("No booth tab is connected");
    const tab = await pairedTab(a);
    const result = await a.call("booth_wait", { job: "nope" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("No job nope");
    expect(await a.call("booth_cancel", { job: "nope" })).toMatchObject({ isError: true });
    tab.close();
  });

  test("the tab disconnecting mid-job fails the job, and booth_wait still reports it with no tab connected", async () => {
    const a = await agent();
    const tab = await pairedTab(a);
    const call = a.call("booth_python", { code: "import bpy", wait_s: 30 });
    const { job } = await tab.nextRun();
    tab.send({ output: { job, text: "partway\n" } });
    tab.close();
    expect(reportOf(await call)).toMatchObject({ job, state: "failed", error: { type: "TabDisconnected", message: "the booth tab disconnected" } });
    const later = await a.call("booth_wait", { job });
    expect(later.isError).toBeUndefined();
    expect(reportOf(later)).toMatchObject({ job, state: "failed", output: "" });
    expect(textOf(await a.call("booth_python", { code: "print(1)" }))).toContain("No booth tab is connected");
  });

  test("a busy port is a tool error naming the port and the other session, and the next call retries the bind", async () => {
    const holder = await rig();
    const a = await agent({ port: holder.port }, false);
    for (const [name, args] of [["booth_python", { code: "x" }], ["booth_wait", { job: "j" }], ["booth_cancel", { job: "j" }]] as const) {
      const result = await a.call(name, args);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(`127.0.0.1:${holder.port}`);
      expect(textOf(result)).toContain("another agent session's bridge holds it");
    }
    await holder.tabs.close();
    const retried = await a.call("booth_python", { code: "x" });
    expect(textOf(retried)).toContain(`#agent=${holder.port}.${TOKEN}`);
    const tab = await pairedTab({ port: holder.port });
    expect(tab).toBeDefined();
  });

  test("files for the running script: a write lands in the working directory, and a .. or symlink escape is refused with advice", async () => {
    const a = await agent();
    const outside = await folder();
    await writeFile(join(outside, "secret.stl"), "s");
    await symlink(outside, join(a.root, "link"));
    const tab = await pairedTab(a);
    const call = a.call("booth_python", { code: "import bpy", wait_s: 30 });
    const { job } = await tab.nextRun();

    const png = new Uint8Array([137, 80, 78, 71]);
    tab.send({ write: { call: 1, job, path: "//renders/", name: "photo.png", binary: png.length } }, png);
    const written = await tab.nextReply();
    expect(written).toEqual({ call: 1, kind: "write", path: join(a.root, "renders", "photo.png") });
    expect([...(await readFile(join(a.root, "renders", "photo.png")))]).toEqual([...png]);

    tab.send({ read: { call: 2, job, path: "../etc-passwd" } });
    tab.send({ read: { call: 3, job, path: "link/secret.stl" } });
    tab.send({ write: { call: 4, job, path: "link/", name: "photo.png", binary: 1 } }, new Uint8Array([1]));
    const refusals = [await tab.nextReply(), await tab.nextReply(), await tab.nextReply()].sort((x, y) => x.call - y.call);
    expect(refusals).toEqual([2, 3, 4].map((callId) => ({ call: callId, kind: "failed", message: expect.stringContaining("--allow") as string })));
    await expect(readFile(join(outside, "photo.png"))).rejects.toThrow();

    tab.send({ image: { job, ...image, path: written.kind === "write" ? written.path : null, binary: jpeg.length } }, jpeg);
    tab.send({ done: { job, outcome: { kind: "done" } } });
    expect(reportOf(await call).images[0]!.path).toBe(join(a.root, "renders", "photo.png"));
  });
});

describe("the real process", () => {
  const BRIDGE = new URL("../tools/agent/bridge.ts", import.meta.url).pathname;

  async function freePort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((done) => { probe.listen(0, "127.0.0.1", done); });
    const address = probe.address();
    await new Promise<void>((done) => { probe.close(() => { done(); }); });
    if (typeof address !== "object" || address === null) throw new Error("no port");
    return address.port;
  }

  /** True when something accepts a TCP connection on the port. */
  const bound = (port: number): Promise<boolean> => new Promise((done) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => { done(false); });
  });

  test("bun tools/agent/bridge.ts serves MCP over stdio and the tab over the loopback port from the first tool call, end to end", { timeout: 60_000 }, async () => {
    const config = await folder();
    const work = await folder();
    const port = await freePort();
    const client = new Client({ name: "test-agent", version: "1" });
    await client.connect(new StdioClientTransport({
      command: "bun",
      args: [BRIDGE, "--port", String(port)],
      cwd: work,
      env: { ...getDefaultEnvironment(), FILAMENT_BOOTH_CONFIG_DIR: config, TMPDIR: tmpdir() },
      stderr: "ignore",
    }));
    cleanups.push(() => client.close());

    const { token } = JSON.parse(await vi.waitFor(() => readFile(join(config, "bridge.json"), "utf8"), { timeout: 10_000 })) as { token: string };
    expect((await stat(join(config, "bridge.json"))).mode & 0o777).toBe(0o600);
    // Registered for every project, a bridge starts with every agent session. One that has not been used leaves the port free.
    expect(await bound(port)).toBe(false);

    const call = client.callTool({ name: "booth_python", arguments: { code: "import bpy\nprint('hello')", wait_s: 30 } });
    const tab = await vi.waitFor(() => FakeTab.pair(port, "e2e", token), { timeout: 10_000, interval: 100 });
    cleanups.push(() => { tab.close(); return Promise.resolve(); });
    const { job, code } = await tab.nextRun();
    expect(code).toBe("import bpy\nprint('hello')");
    tab.send({ output: { job, text: "hello\n" } });
    const png = new Uint8Array([137, 80, 78, 71, 13, 10]);
    tab.send({ write: { call: 1, job, path: "//renders/", name: "photo.png", binary: png.length } }, png);
    const reply = await tab.nextReply();
    expect(reply).toEqual({ call: 1, kind: "write", path: join(work, "renders", "photo.png") });
    tab.send({ image: { job, ...image, path: join(work, "renders", "photo.png"), binary: jpeg.length } }, jpeg);
    tab.send({ done: { job, outcome: { kind: "done" } } });

    const result = await call;
    expect(result.isError).toBeUndefined();
    expect(reportOf(result)).toMatchObject({ job, state: "done", output: "hello\n", images: [{ label: "render", path: join(work, "renders", "photo.png") }] });
    expect(blocks(result).map((block) => block.type)).toEqual(["text", "image"]);
    expect([...(await readFile(join(work, "renders", "photo.png")))]).toEqual([...png]);
  });
});
