/**
 * link.ts: BridgeLink, the booth tab's side of the wire to the local bridge.
 *
 * It dials ws://127.0.0.1:<port>/, says hello with the token and a per-load
 * page id, and then turns frames into domain events: the bridge's run and
 * cancel go to LinkEvents, and the tab's own read and write calls come back as
 * promises. Callers never see a frame. Every text frame is read through
 * parseBridgeMessage, and a binary frame is always the one its JSON frame
 * announced, so a frame that is neither closes the socket.
 *
 * A bridge that is not there yet is the normal case: the link retries with
 * backoff for as long as it is connected on. Only a close the bridge chose
 * (CLOSE: wrong token, other origin, another tab took over, other protocol)
 * stops the retries, because they would fail the same way.
 *
 * The socket factory and the timer are injected, so tests need neither a
 * network nor a sleep.
 */
import { setTimer, type Schedule } from "../schedule";
import {
  CLOSE, PROTOCOL, parseBridgeMessage,
  type BridgeMessage, type ImageMeta, type JobId, type ScriptOutcome, type TabMessage,
} from "./protocol";

export const RETRY_FIRST_MS = 500;
export const RETRY_MAX_MS = 10_000;

/** A page may close a socket with 1000 or 3000 to 4999 only. The bridge's own codes are 4001 to 4010. */
const BAD_FRAME = 4100;

/** Bytes a socket can send: a typed array over a plain ArrayBuffer, as `arrayBuffer()` returns. */
export type Bytes = Uint8Array<ArrayBuffer>;

/** The part of a browser WebSocket the link uses. browserSocket adapts the real one. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
  send(data: string | Bytes): void;
  close(code?: number, reason?: string): void;
}

export function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const socket: SocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => { ws.send(data); },
    close: (code, reason) => { ws.close(code, reason); },
  };
  ws.onopen = () => { socket.onopen?.(); };
  ws.onmessage = (event) => { socket.onmessage?.({ data: event.data }); };
  ws.onclose = (event) => { socket.onclose?.({ code: event.code, reason: event.reason }); };
  return socket;
}

/** Where the link stands. `refused` is final until connect() is called again. */
export type LinkState =
  | { readonly kind: "waiting" }
  | { readonly kind: "connected" }
  | { readonly kind: "refused"; readonly reason: string };

/** What the link tells AgentControl. Domain events only. */
export interface LinkEvents {
  state(state: LinkState): void;
  run(job: JobId, code: string): void;
  cancel(job: JobId): void;
}

export interface LinkDeps {
  readonly openSocket?: (url: string) => SocketLike;
  readonly schedule?: Schedule;
  /** Random per page load: tells a reconnect of this tab from another tab. */
  readonly pageId: string;
}

type Pending =
  | { readonly kind: "read"; readonly resolve: (file: File) => void; readonly reject: (error: Error) => void }
  | { readonly kind: "write"; readonly resolve: (path: string) => void; readonly reject: (error: Error) => void };

const REFUSED_BY_CODE: Readonly<Record<number, string>> = {
  [CLOSE.badToken]: "the token does not match the bridge's",
  [CLOSE.originRefused]: "the bridge does not accept this page's address; start it with --app <this page's origin>",
  [CLOSE.replaced]: "another booth tab took over the agent",
  [CLOSE.protocolMismatch]: "the page and the bridge speak different protocol versions",
};

const notConnected = (): Error => new Error("the bridge is not connected");

export class BridgeLink {
  readonly #events: LinkEvents;
  readonly #openSocket: (url: string) => SocketLike;
  readonly #schedule: Schedule;
  readonly #pageId: string;

  #target: { readonly port: number; readonly token: string } | null = null;
  #socket: SocketLike | null = null;
  #phase: "greeting" | "ready" = "greeting";
  #delayMs = RETRY_FIRST_MS;
  #cancelRetry: (() => void) | null = null;
  /** What the bridge said when it refused, kept for the close that follows. */
  #refusal: string | null = null;
  /** The read whose bytes are the next binary frame. */
  #awaiting: { readonly call: number; readonly name: string; readonly binary: number } | null = null;
  readonly #calls = new Map<number, Pending>();
  #nextCall = 1;
  #last: LinkState | null = null;

  constructor(deps: LinkDeps, events: LinkEvents) {
    this.#events = events;
    this.#openSocket = deps.openSocket ?? browserSocket;
    this.#schedule = deps.schedule ?? setTimer;
    this.#pageId = deps.pageId;
  }

  /** Dials the bridge, replacing any earlier connection or pending retry. */
  connect(port: number, token: string): void {
    this.#teardown();
    this.#target = { port, token };
    this.#delayMs = RETRY_FIRST_MS;
    this.#last = null;
    this.#emit({ kind: "waiting" });
    this.#dial();
  }

  /** Hangs up and stops retrying. Calls still waiting for an answer reject. */
  close(): void {
    this.#teardown();
    this.#target = null;
    this.#last = null;
  }

  // ---- tab to bridge. Each one is dropped when there is no connection: the bridge ends a job whose tab went away. ----

  output(job: JobId, text: string): void {
    this.#transmit({ output: { job, text } });
  }

  progress(job: JobId, text: string, fraction: number | null): void {
    this.#transmit({ progress: { job, text, fraction } });
  }

  image(job: JobId, meta: ImageMeta, thumbnail: Bytes): void {
    this.#transmit({ image: { job, ...meta, binary: thumbnail.byteLength } }, thumbnail);
  }

  done(job: JobId, outcome: ScriptOutcome, sceneUrl?: string | null): void {
    this.#transmit({ done: { job, outcome, ...(sceneUrl === undefined ? {} : { sceneUrl }) } });
  }

  /** The bytes of a file on the agent's machine. Rejects with the bridge's reason, such as a path outside its folders. */
  read(job: JobId, path: string): Promise<File> {
    return new Promise<File>((resolve, reject) => {
      const call = this.#nextCall++;
      this.#calls.set(call, { kind: "read", resolve, reject });
      if (!this.#transmit({ read: { call, job, path } })) this.#fail(call, notConnected());
    });
  }

  /** Writes a file on the agent's machine and resolves to the absolute path the bridge wrote. */
  write(job: JobId, path: string, name: string, bytes: Bytes): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const call = this.#nextCall++;
      this.#calls.set(call, { kind: "write", resolve, reject });
      if (!this.#transmit({ write: { call, job, path, name, binary: bytes.byteLength } }, bytes)) this.#fail(call, notConnected());
    });
  }

  // ---- connection ------------------------------------------------------------------------------

  #dial(): void {
    const target = this.#target;
    if (target === null) return;
    this.#phase = "greeting";
    this.#refusal = null;
    this.#awaiting = null;
    const socket = this.#openSocket(`ws://127.0.0.1:${target.port}/`);
    this.#socket = socket;
    socket.onopen = () => {
      if (this.#socket !== socket) return;
      socket.send(JSON.stringify({ hello: { app: "filament-booth", protocol: PROTOCOL, token: target.token, pageId: this.#pageId } } satisfies TabMessage));
    };
    socket.onmessage = (event) => {
      if (this.#socket === socket) this.#onFrame(socket, event.data);
    };
    socket.onclose = (event) => {
      if (this.#socket === socket) this.#onClose(event.code, event.reason);
    };
  }

  #teardown(): void {
    this.#cancelRetry?.();
    this.#cancelRetry = null;
    const socket = this.#socket;
    this.#socket = null;
    this.#awaiting = null;
    this.#failAll("the bridge went away");
    if (socket === null) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.close(1000);
  }

  #onClose(code: number, reason: string): void {
    this.#socket = null;
    this.#awaiting = null;
    this.#failAll("the bridge went away");
    if ((Object.values(CLOSE) as number[]).includes(code)) {
      this.#emit({ kind: "refused", reason: this.#refusal ?? (reason !== "" ? reason : REFUSED_BY_CODE[code] ?? `the bridge closed the connection (${code})`) });
      return;
    }
    this.#emit({ kind: "waiting" });
    const delay = this.#delayMs;
    this.#delayMs = Math.min(delay * 2, RETRY_MAX_MS);
    this.#cancelRetry = this.#schedule(() => {
      this.#cancelRetry = null;
      this.#dial();
    }, delay);
  }

  #emit(state: LinkState): void {
    const last = this.#last;
    if (last !== null && last.kind === state.kind && (state.kind !== "refused" || (last.kind === "refused" && last.reason === state.reason))) return;
    this.#last = state;
    this.#events.state(state);
  }

  // ---- frames ----------------------------------------------------------------------------------

  #violate(socket: SocketLike, why: string): void {
    this.#awaiting = null;
    socket.close(BAD_FRAME, `bad frame: ${why}`.slice(0, 120));
  }

  #onFrame(socket: SocketLike, data: unknown): void {
    if (typeof data === "string") this.#onText(socket, data);
    else if (data instanceof ArrayBuffer) this.#onBinary(socket, data);
    else this.#violate(socket, "expected a text or binary frame");
  }

  #onText(socket: SocketLike, data: string): void {
    let message: BridgeMessage;
    try {
      message = parseBridgeMessage(JSON.parse(data));
    } catch (error) {
      this.#violate(socket, error instanceof SyntaxError ? "not JSON" : error instanceof Error ? error.message : String(error));
      return;
    }
    if (this.#awaiting !== null) return this.#violate(socket, "expected a binary frame");
    if ("refused" in message) {
      this.#refusal = message.refused.reason;
      return;
    }
    if (this.#phase === "greeting") {
      if (!("welcome" in message)) return this.#violate(socket, "expected welcome first");
      this.#phase = "ready";
      this.#delayMs = RETRY_FIRST_MS;
      this.#emit({ kind: "connected" });
      return;
    }
    if ("welcome" in message) return this.#violate(socket, "welcome twice");
    if ("run" in message) this.#events.run(message.run.job, message.run.code);
    else if ("cancel" in message) this.#events.cancel(message.cancel.job);
    else this.#onReply(socket, message.reply);
  }

  #onReply(socket: SocketLike, reply: Extract<BridgeMessage, { reply: unknown }>["reply"]): void {
    const pending = this.#calls.get(reply.call);
    if (pending === undefined) return this.#violate(socket, `reply to call ${reply.call}, which was not asked`);
    if (reply.kind === "failed") {
      this.#fail(reply.call, new Error(reply.message));
    } else if (reply.kind === "write" && pending.kind === "write") {
      this.#calls.delete(reply.call);
      pending.resolve(reply.path);
    } else if (reply.kind === "read" && pending.kind === "read") {
      this.#awaiting = { call: reply.call, name: reply.name, binary: reply.binary };
    } else {
      this.#violate(socket, `a ${reply.kind} reply to a ${pending.kind} call`);
    }
  }

  #onBinary(socket: SocketLike, data: ArrayBuffer): void {
    const awaiting = this.#awaiting;
    if (awaiting === null) return this.#violate(socket, "unexpected binary frame");
    this.#awaiting = null;
    if (data.byteLength !== awaiting.binary) return this.#violate(socket, `expected ${awaiting.binary} bytes, got ${data.byteLength}`);
    const pending = this.#calls.get(awaiting.call);
    this.#calls.delete(awaiting.call);
    if (pending?.kind === "read") pending.resolve(new File([data], awaiting.name));
  }

  /** Sends one message and its binary frame back to back. False when the bridge is not ready for it. */
  #transmit(message: TabMessage, binary?: Bytes): boolean {
    const socket = this.#socket;
    if (socket === null || this.#phase !== "ready") return false;
    socket.send(JSON.stringify(message));
    if (binary !== undefined) socket.send(binary);
    return true;
  }

  #fail(call: number, error: Error): void {
    const pending = this.#calls.get(call);
    this.#calls.delete(call);
    pending?.reject(error);
  }

  #failAll(why: string): void {
    for (const call of [...this.#calls.keys()]) this.#fail(call, new Error(why));
  }
}
