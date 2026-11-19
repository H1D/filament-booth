/**
 * What the tab-side tests share: a socket the test plays the bridge on, and a
 * clock the test turns by hand. Neither touches a network or sleeps.
 */
import type { Bytes, SocketLike } from "../src/agent/link";
import { PROTOCOL, parseTabMessage, type BridgeMessage, type TabMessage } from "../src/agent/protocol";
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
