/**
 * What the tab-side tests share: a socket the test plays the bridge on, and a
 * clock the test turns by hand. Neither touches a network or sleeps.
 */
import type { ScriptRuntime } from "../src/agent/agent";
import type { JobIo } from "../src/agent/host";
import type { Bytes, SocketLike } from "../src/agent/link";
import { PROTOCOL, parseTabMessage, type BridgeMessage, type ScriptOutcome, type TabMessage } from "../src/agent/protocol";
import type { Schedule } from "../src/schedule";

export type Sent =
  | { readonly text: TabMessage; readonly binary?: undefined }
  | { readonly binary: Bytes; readonly text?: undefined };

/** The bridge's end of one socket: the test sends frames to the tab and reads what the tab sent. */
export class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null = null;
  readonly sent: Sent[] = [];
  closedWith: { readonly code: number | undefined; readonly reason: string | undefined } | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string | Bytes): void {
    this.sent.push(typeof data === "string" ? { text: parseTabMessage(JSON.parse(data)) } : { binary: data });
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
  }

  /** The tab's text frames, in order. */
  get messages(): TabMessage[] {
    return this.sent.flatMap((frame) => (frame.text === undefined ? [] : [frame.text]));
  }

  open(): void { this.onopen?.(); }

  say(message: BridgeMessage): void { this.onmessage?.({ data: JSON.stringify(message) }); }

  sayRaw(data: unknown): void { this.onmessage?.({ data }); }

  sayBinary(bytes: Bytes): void {
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }

  /** The bridge closes the socket, or the network drops it (code 1006). */
  hangUp(code = 1006, reason = ""): void { this.onclose?.({ code, reason }); }

  /** open, then the bridge's welcome. */
  welcome(): void {
    this.open();
    this.say({ welcome: { protocol: PROTOCOL } });
  }
}

/** Collects the sockets a link opens, newest last. */
export class Sockets {
  readonly all: FakeSocket[] = [];
  readonly open = (url: string): FakeSocket => {
    const socket = new FakeSocket(url);
    this.all.push(socket);
    return socket;
  };

  get last(): FakeSocket {
    const socket = this.all[this.all.length - 1];
    if (socket === undefined) throw new Error("no socket was opened");
    return socket;
  }
}

/** A Schedule the test advances by hand. */
export class ManualClock {
  #now = 0;
  readonly #timers = new Set<{ readonly at: number; readonly fn: () => void }>();

  readonly schedule: Schedule = (fn, ms) => {
    const timer = { at: this.#now + ms, fn };
    this.#timers.add(timer);
    return () => { this.#timers.delete(timer); };
  };

  /** How long until each pending timer fires, soonest first. */
  get pending(): number[] {
    return [...this.#timers].map((t) => t.at - this.#now).sort((a, b) => a - b);
  }

  advance(ms: number): void {
    const end = this.#now + ms;
    for (;;) {
      const next = [...this.#timers].filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      this.#timers.delete(next);
      this.#now = next.at;
      next.fn();
    }
    this.#now = end;
  }
}

export interface FakeScript {
  readonly code: string;
  readonly io: Omit<JobIo, "signal">;
  /** Ends the script as Python would. */
  end(outcome: ScriptOutcome): void;
}

/** A Python worker the test steers: start() waits for the test, and a script ends when the test or a cancel says so. */
export class FakeRuntime implements ScriptRuntime {
  starts = 0;
  disposed = 0;
  readonly cancels: ("agent" | "user")[] = [];
  readonly scripts: FakeScript[] = [];
  #ready: { resolve: () => void; reject: (error: Error) => void } | null = null;
  #running: FakeScript | null = null;
  #settle: ((outcome: ScriptOutcome) => void) | null = null;

  start(): Promise<void> {
    this.starts += 1;
    return new Promise<void>((resolve, reject) => { this.#ready = { resolve, reject }; });
  }

  /** Python finished loading. */
  loaded(): void { this.#ready?.resolve(); }

  /** Python could not load. */
  failToLoad(message: string): void { this.#ready?.reject(new Error(message)); }

  run(code: string, io: Omit<JobIo, "signal">): Promise<ScriptOutcome> {
    return new Promise<ScriptOutcome>((resolve) => {
      const script: FakeScript = { code, io, end: (outcome) => { this.#finish(script, outcome); } };
      this.#running = script;
      this.#settle = resolve;
      this.scripts.push(script);
    });
  }

  cancel(by: "agent" | "user"): void {
    if (this.#running === null) return;
    this.cancels.push(by);
    this.#finish(this.#running, { kind: "cancelled", by });
  }

  dispose(): void {
    this.disposed += 1;
    if (this.#running !== null) this.#finish(this.#running, { kind: "cancelled", by: "user" });
  }

  get script(): FakeScript {
    const script = this.scripts[this.scripts.length - 1];
    if (script === undefined) throw new Error("no script was run");
    return script;
  }

  #finish(script: FakeScript, outcome: ScriptOutcome): void {
    if (this.#running !== script) return;
    const settle = this.#settle;
    this.#running = null;
    this.#settle = null;
    settle?.(outcome);
  }
}
