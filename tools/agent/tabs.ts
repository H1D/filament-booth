/**
 * tabs.ts: TabServer, the loopback server the booth tab dials.
 *
 * node:http plus ws on 127.0.0.1 only. The newest tab that presents the token
 * has the agent: the previous tab's socket is closed with CLOSE.replaced. The
 * tab reads and writes files on the agent's machine only through here, only
 * for the job that is running, and only inside the allowed folders.
 *
 * It holds no scene logic. Frames never leave this file: the rest of the
 * bridge sees TabEvents and run/cancel.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  CLOSE,
  PROTOCOL,
  ProtocolError,
  parseTabMessage,
  type BridgeMessage,
  type ImageMeta,
  type JobId,
  type ScriptOutcome,
  type TabMessage,
} from "../../src/agent/protocol";

export interface TabServerOptions {
  /** 0 picks a free port. */
  readonly port: number;
  readonly token: string;
  /** Exact Origin header values the upgrade accepts. */
  readonly origins: readonly string[];
  /** Absolute folders the tab may read and write. The first one is the agent's working directory. */
  readonly roots: readonly string[];
  readonly log?: (line: string) => void;
}

/** What the server reports up. Jobs implements it. */
export interface TabEvents {
  output(job: JobId, text: string): void;
  progress(job: JobId, text: string, fraction: number | null): void;
  image(job: JobId, meta: ImageMeta, thumbnail: Uint8Array): void;
  done(job: JobId, outcome: ScriptOutcome): void;
  /** The paired tab went away. Its running job, if any, is over. */
  disconnected(reason: string | null): void;
  /** Gates file calls: only the running job may read or write. */
  isRunning(job: JobId): boolean;
}

export type ListenResult =
  | { readonly ok: true; readonly port: number }
  | { readonly ok: false; readonly code: "EADDRINUSE" | "other"; readonly reason: string };

export class NoTab extends Error {
  override name = "NoTab";
}

export const MAX_READ_BYTES = 1024 ** 3;
const MAX_FRAME_BYTES = 256 * 1024 ** 2;
const GREETING_TIMEOUT_MS = 5000;

interface Session {
  readonly socket: WebSocket;
  phase: { readonly kind: "greeting" } | { readonly kind: "paired"; readonly pageId: string } | { readonly kind: "closing" };
  /** The message whose binary frame is next. */
  awaiting: Extract<TabMessage, { image: unknown } | { write: unknown }> | null;
}

export class TabServer {
  readonly #opts: TabServerOptions;
  readonly #events: TabEvents;
  readonly #log: (line: string) => void;
  readonly #wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  #http: Server | null = null;
  #tab: Session | null = null;
  readonly #tabWaiters = new Set<() => void>();

  constructor(opts: TabServerOptions, events: TabEvents) {
    this.#opts = opts;
    this.#events = events;
    this.#log = opts.log ?? ((line) => { console.error(line); });
  }

  /**
   * Binds the port. Calling it again while bound is a no-op, and calling it
   * after a failure tries again: a busy port means another agent session's
   * bridge holds it, which can end at any time.
   */
  async listen(): Promise<ListenResult> {
    if (this.#http !== null) return { ok: true, port: this.port };
    const http = createServer((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" }).end("Filament booth bridge: connect with a WebSocket.\n");
    });
    http.on("upgrade", (req, socket, head) => {
      if (new URL(req.url ?? "/", "http://x").pathname !== "/") {
        socket.destroy();
        return;
      }
      this.#wss.handleUpgrade(req, socket, head, (ws) => { this.#accept(ws, req); });
    });
    try {
      await new Promise<void>((done, fail) => {
        http.once("error", fail);
        http.listen(this.#opts.port, "127.0.0.1", () => { http.off("error", fail); done(); });
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { ok: false, code: code === "EADDRINUSE" ? "EADDRINUSE" : "other", reason: error instanceof Error ? error.message : String(error) };
    }
    http.on("error", (error) => { this.#log(`bridge: http server error: ${error.message}`); });
    this.#http = http;
    return { ok: true, port: this.port };
  }

  /** The bound port, or the configured one before listen succeeds. */
  get port(): number {
    const address = this.#http?.address();
    return typeof address === "object" && address !== null ? address.port : this.#opts.port;
  }

  get pageId(): string | null {
    return this.#tab?.phase.kind === "paired" ? this.#tab.phase.pageId : null;
  }

  /** Resolves true as soon as a tab is paired, false after `ms`. */
  waitForTab(ms: number): Promise<boolean> {
    if (this.pageId !== null) return Promise.resolve(true);
    return new Promise((done) => {
      const wake = (): void => { clearTimeout(timer); this.#tabWaiters.delete(wake); done(this.pageId !== null); };
      const timer = setTimeout(wake, ms);
      this.#tabWaiters.add(wake);
    });
  }

  /** Throws NoTab when no tab is paired. */
  run(job: JobId, code: string): void {
    if (this.#tab === null || this.#tab.phase.kind !== "paired") throw new NoTab("no booth tab is connected");
    this.#send(this.#tab, { run: { job, code } });
  }

  cancel(job: JobId): void {
    if (this.#tab !== null && this.#tab.phase.kind === "paired") this.#send(this.#tab, { cancel: { job } });
  }

  async close(): Promise<void> {
    for (const client of this.#wss.clients) client.terminate();
    this.#tab = null;
    const http = this.#http;
    this.#http = null;
    if (http !== null) await new Promise<void>((done) => { http.close(() => { done(); }); });
  }

  #send(session: Session, message: BridgeMessage, binary?: Uint8Array): void {
    if (session.socket.readyState !== WebSocket.OPEN) return;
    session.socket.send(JSON.stringify(message));
    if (binary !== undefined) session.socket.send(binary);
  }

  #refuse(session: Session, code: number, reason: string): void {
    session.phase = { kind: "closing" };
    this.#send(session, { refused: { reason } });
    session.socket.close(code, reason.slice(0, 120));
  }

  #accept(socket: WebSocket, req: IncomingMessage): void {
    const session: Session = { socket, phase: { kind: "greeting" }, awaiting: null };
    const greeting = setTimeout(() => {
      if (session.phase.kind === "greeting") socket.close(1008, "no hello");
    }, GREETING_TIMEOUT_MS);
    greeting.unref();

    socket.on("close", () => {
      clearTimeout(greeting);
      if (this.#tab === session) {
        this.#tab = null;
        this.#events.disconnected(null);
      }
    });
    socket.on("error", (error) => { this.#log(`bridge: tab socket error: ${error.message}`); });
    socket.on("message", (data, isBinary) => {
      if (session.phase.kind === "closing") return;
      try {
        this.#onFrame(session, data as Buffer, isBinary);
      } catch (error) {
        const reason = error instanceof ProtocolError ? error.message : "malformed frame";
        this.#log(`bridge: closing a tab socket: ${reason}`);
        session.phase = { kind: "closing" };
        socket.close(1002, reason.slice(0, 120));
      }
    });

    // The refusal is sent over the open socket, not as an HTTP error, because a page cannot read why a handshake failed.
    if (!this.#opts.origins.includes(req.headers.origin ?? "")) {
      this.#log(`bridge: refused a connection from origin ${req.headers.origin ?? "(none)"}. Start the bridge with --app <origin> to allow it.`);
      this.#refuse(session, CLOSE.originRefused, `origin ${req.headers.origin ?? "(none)"} is not allowed; start the bridge with --app <origin>`);
    }
  }

  #onFrame(session: Session, data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      const message = session.awaiting;
      if (message === null) throw new ProtocolError("frame: unexpected binary frame");
      session.awaiting = null;
      const expected = "image" in message ? message.image.binary : message.write.binary;
      if (data.length !== expected) throw new ProtocolError(`frame: expected ${expected} bytes, got ${data.length}`);
      const bytes = new Uint8Array(data);
      if ("image" in message) {
        const { job, binary: _binary, ...meta } = message.image;
        this.#events.image(job, meta, bytes);
      } else {
        void this.#write(session, message.write, bytes);
      }
      return;
    }

    if (session.awaiting !== null) throw new ProtocolError("frame: expected a binary frame");
    let json: unknown;
    try {
      json = JSON.parse(data.toString("utf8"));
    } catch {
      throw new ProtocolError("frame: not JSON");
    }
    const message = parseTabMessage(json);

    if ("hello" in message) {
      if (session.phase.kind !== "greeting") throw new ProtocolError("hello: already said hello");
      this.#onHello(session, message.hello);
      return;
    }
    if (session.phase.kind !== "paired") throw new ProtocolError("message: hello first");

    if ("output" in message) this.#events.output(message.output.job, message.output.text);
    else if ("progress" in message) this.#events.progress(message.progress.job, message.progress.text, message.progress.fraction);
    else if ("done" in message) this.#events.done(message.done.job, message.done.outcome);
    else if ("read" in message) void this.#read(session, message.read);
    else session.awaiting = message;
  }

  #onHello(session: Session, hello: Extract<TabMessage, { hello: unknown }>["hello"]): void {
    if (!sameSecret(hello.token, this.#opts.token)) {
      this.#refuse(session, CLOSE.badToken, "wrong token: the agent's bridge was added with another token. Run claude mcp remove booth, then the command in the Agent section again");
      return;
    }
    if (hello.protocol !== PROTOCOL) {
      this.#refuse(session, CLOSE.protocolMismatch, `this bridge speaks protocol ${PROTOCOL}, the page speaks ${hello.protocol}`);
      return;
    }
    const previous = this.#tab;
    this.#tab = session;
    session.phase = { kind: "paired", pageId: hello.pageId };
    if (previous !== null) {
      this.#events.disconnected("another booth tab took over");
      this.#refuse(previous, CLOSE.replaced, "another booth tab took over the agent");
    }
    this.#send(session, { welcome: { protocol: PROTOCOL } });
    for (const wake of [...this.#tabWaiters]) wake();
  }

  async #read(session: Session, call: Extract<TabMessage, { read: unknown }>["read"]): Promise<void> {
    const failed = (message: string): void => { this.#send(session, { reply: { call: call.call, kind: "failed", message } }); };
    try {
      if (!this.#events.isRunning(call.job)) return failed(notRunning(call.job, "read"));
      const target = await resolveInRoots(call.path, this.#opts.roots, null);
      if (!target.ok) return failed(target.message);
      const info = await stat(target.path);
      if (!info.isFile()) return failed(`${target.path} is not a file`);
      if (info.size > MAX_READ_BYTES) return failed(`${target.path} is ${info.size} bytes; the bridge reads files up to ${MAX_READ_BYTES} bytes`);
      const bytes = await readFile(target.path);
      this.#send(session, { reply: { call: call.call, kind: "read", name: basename(target.path), binary: bytes.length } }, bytes);
    } catch (error) {
      failed(`cannot read ${call.path}: ${describeFsError(error)}`);
    }
  }

  async #write(session: Session, call: Extract<TabMessage, { write: unknown }>["write"], bytes: Uint8Array): Promise<void> {
    const failed = (message: string): void => { this.#send(session, { reply: { call: call.call, kind: "failed", message } }); };
    try {
      if (!this.#events.isRunning(call.job)) return failed(notRunning(call.job, "write"));
      const target = await resolveInRoots(call.path, this.#opts.roots, { name: call.name });
      if (!target.ok) return failed(target.message);
      await mkdir(dirname(target.path), { recursive: true });
      await writeFile(target.path, bytes);
      this.#send(session, { reply: { call: call.call, kind: "write", path: target.path } });
    } catch (error) {
      failed(`cannot write ${call.path}: ${describeFsError(error)}`);
    }
  }
}

function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function notRunning(job: JobId, verb: string): string {
  return `cannot ${verb} files for job ${job}: it is not the running job. Files are only available to the script that is running.`;
}

function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" ? "no such file" : error instanceof Error ? error.message : String(error);
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** The real location of `path`, following symlinks on whatever part of it exists. Null for a dangling symlink, which could be pointed anywhere later. */
async function realLocation(path: string): Promise<string | null> {
  const missing: string[] = [];
  for (let current = path; ; ) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
    if (await lstat(current).then(() => true, () => false)) return null;
    const parent = dirname(current);
    if (parent === current) return null;
    missing.push(basename(current));
    current = parent;
  }
}

/**
 * Where a path from a script lands on the agent's machine.
 *
 * "x" and "//x" are relative to roots[0], the agent's working directory, as
 * Blender's "//" is relative to the .blend. For a write, a path that ends in
 * a separator, names a folder, or has no extension is a folder, and `name`
 * is the file inside it. The real path, symlinks followed, must be inside one
 * root.
 */
export async function resolveInRoots(
  path: string, roots: readonly string[], forWrite: { readonly name: string } | null,
): Promise<{ readonly ok: true; readonly path: string } | { readonly ok: false; readonly message: string }> {
  const base = roots[0];
  if (base === undefined) return { ok: false, message: "the bridge has no folder the booth may use" };
  const refuse = (): { readonly ok: false; readonly message: string } => ({
    ok: false,
    message: `${path} is outside the folders the booth may use (${roots.join(", ")}). Use a path under the working directory ${base}, or start the bridge with --allow <dir>.`,
  });

  let target = resolve(base, path.startsWith("//") ? path.slice(2) : path);
  if (forWrite !== null) {
    const { name } = forWrite;
    const asFolder = /[\\/]$/.test(path) || extname(target) === "" || (await stat(target).then((info) => info.isDirectory(), () => false));
    if (asFolder) {
      if (name === "" || name === "." || name === ".." || basename(name) !== name) {
        return { ok: false, message: `${path} names a folder and "${name}" is not a plain file name` };
      }
      target = join(target, name);
    }
  }

  const real = await realLocation(target);
  if (real === null) return refuse();
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => null);
    if (realRoot !== null && inside(realRoot, real)) return { ok: true, path: target };
  }
  return refuse();
}
