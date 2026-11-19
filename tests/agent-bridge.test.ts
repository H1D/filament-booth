import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import {
  PROTOCOL,
  parseBridgeMessage,
  type BridgeMessage,
  type JobId,
  type TabMessage,
} from "../src/agent/protocol";
import { Jobs, ToolRefusal, type Reported } from "../tools/agent/jobs";
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

async function pairedTab(r: Rig, pageId?: string): Promise<FakeTab> {
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
