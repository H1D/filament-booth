/**
 * protocol.ts: the wire between the booth tab and the local bridge.
 *
 * The bridge (tools/agent/) listens on 127.0.0.1:<port>. The tab is the
 * client and opens ws://127.0.0.1:<port>/. The connection model is
 * ScanRuler's: a local MCP process the page dials, paired by a token.
 *
 * Every text frame is one JSON object with exactly one key, the message kind.
 * A message whose body has `binary: n` is followed by exactly one binary frame
 * of n bytes, sent back to back, so a reader pairs them without ids.
 *
 * Both sides read frames only through the two parsers below and see only
 * these types past them. Nothing here reaches the agent: it sees the bridge's
 * job report, never a frame.
 */

export const PROTOCOL = 1;
export const DEFAULT_PORT = 47615;

/** Close codes the bridge uses. The tab shows the reason and stops retrying for all of them. */
export const CLOSE = {
  badToken: 4001,
  originRefused: 4003,
  /** Another tab connected with the same token. The newest tab has the agent. */
  replaced: 4008,
  protocolMismatch: 4010,
} as const;

export type JobId = string & { readonly _brand: "JobId" };

// ---- bridge -> tab -----------------------------------------------------------

export type BridgeMessage =
  | { readonly welcome: { readonly protocol: typeof PROTOCOL } }
  /** Sent just before closing with one of CLOSE. */
  | { readonly refused: { readonly reason: string } }
  | { readonly run: { readonly job: JobId; readonly code: string } }
  | { readonly cancel: { readonly job: JobId } }
  /** The answer to a tab's read or write. A read's bytes follow as one binary frame. */
  | { readonly reply: ReadReply | WriteReply | CallFailed };

export interface ReadReply { readonly call: number; readonly kind: "read"; readonly name: string; readonly binary: number }
export interface WriteReply { readonly call: number; readonly kind: "write"; readonly path: string }
export interface CallFailed { readonly call: number; readonly kind: "failed"; readonly message: string }

// ---- tab -> bridge -----------------------------------------------------------

export type TabMessage =
  | { readonly hello: Hello }
  /** print() output, batched by the tab. */
  | { readonly output: { readonly job: JobId; readonly text: string } }
  /** What the tab is doing now. Replaces the previous progress. */
  | { readonly progress: { readonly job: JobId; readonly text: string; readonly fraction: number | null } }
  /** A finished render or preview. Its thumbnail (JPEG) follows as one binary frame. */
  | { readonly image: ImageMeta & { readonly job: JobId; readonly binary: number } }
  | { readonly done: { readonly job: JobId; readonly outcome: ScriptOutcome } }
  /** Read a file on the agent's machine for a running job. The bridge refuses paths outside its roots. */
  | { readonly read: { readonly call: number; readonly job: JobId; readonly path: string } }
  /** Write a file for a running job. Its bytes follow as one binary frame. `name` is used when `path` is a folder. */
  | { readonly write: { readonly call: number; readonly job: JobId; readonly path: string; readonly name: string; readonly binary: number } };

export interface Hello {
  readonly app: "filament-booth";
  readonly protocol: number;
  readonly token: string;
  /** Random per page load: tells a reconnect of this tab from another tab. */
  readonly pageId: string;
}

export interface ImageMeta {
  readonly label: "render" | "preview";
  /** Where the bridge wrote the full image on the agent's machine, or null when nothing was written. */
  readonly path: string | null;
  readonly width: number;
  readonly height: number;
  /** "431/512 samples, stopped by the 600 s time limit, Cycles", or "live preview, not a Cycles photo". */
  readonly note: string;
}

/** How a script ended. Produced in the tab, carried as is into the bridge's job report. */
export type ScriptOutcome =
  | { readonly kind: "done" }
  | { readonly kind: "failed"; readonly type: string; readonly message: string; readonly traceback: string }
  /** `by` says who stopped it: the agent (booth_cancel) or the user (Stop script, or turning agent control off). */
  | { readonly kind: "cancelled"; readonly by: "agent" | "user" };

// ---- parsers (the only way either side reads a text frame) ------------------

export class ProtocolError extends Error {
  override name = "ProtocolError";
}

type Fields = Readonly<Record<string, unknown>>;

function kindOf(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "an array" : typeof value;
}

function fields(value: unknown, path: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${path}: expected an object, got ${kindOf(value)}`);
  }
  return value as Fields;
}

function member(from: Fields, path: string, key: string): unknown {
  if (!Object.hasOwn(from, key)) throw new ProtocolError(`${path}.${key}: missing`);
  return from[key];
}

function text(from: Fields, path: string, key: string): string {
  const value = member(from, path, key);
  if (typeof value !== "string") throw new ProtocolError(`${path}.${key}: expected a string, got ${kindOf(value)}`);
  return value;
}

function nonEmptyText(from: Fields, path: string, key: string): string {
  const value = text(from, path, key);
  if (value === "") throw new ProtocolError(`${path}.${key}: must not be empty`);
  return value;
}

/** A non-negative whole number: a call id or a byte count. */
function count(from: Fields, path: string, key: string): number {
  const value = member(from, path, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ProtocolError(`${path}.${key}: expected a non-negative whole number, got ${typeof value === "number" ? String(value) : kindOf(value)}`);
  }
  return value;
}

function pixels(from: Fields, path: string, key: string): number {
  const value = count(from, path, key);
  if (value === 0) throw new ProtocolError(`${path}.${key}: must be at least 1`);
  return value;
}

function job(from: Fields, path: string): JobId {
  return nonEmptyText(from, path, "job") as JobId;
}

function oneOf<const T extends string>(from: Fields, path: string, key: string, allowed: readonly T[]): T {
  const value = text(from, path, key);
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new ProtocolError(`${path}.${key}: expected one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`);
  return match;
}

/** Splits `{ kind: body }` into its one key and the body, which must itself be an object. */
function envelope(json: unknown): { readonly kind: string; readonly body: Fields } {
  const message = fields(json, "message");
  const keys = Object.keys(message);
  if (keys.length !== 1) {
    throw new ProtocolError(`message: expected exactly one key, got ${keys.length === 0 ? "none" : keys.join(", ")}`);
  }
  const kind = keys[0]!;
  return { kind, body: fields(message[kind], kind) };
}

function parseOutcome(value: unknown, path: string): ScriptOutcome {
  const body = fields(value, path);
  switch (oneOf(body, path, "kind", ["done", "failed", "cancelled"])) {
    case "done":
      return { kind: "done" };
    case "failed":
      return { kind: "failed", type: text(body, path, "type"), message: text(body, path, "message"), traceback: text(body, path, "traceback") };
    case "cancelled":
      return { kind: "cancelled", by: oneOf(body, path, "by", ["agent", "user"]) };
  }
}

function parseReply(body: Fields): ReadReply | WriteReply | CallFailed {
  const call = count(body, "reply", "call");
  switch (oneOf(body, "reply", "kind", ["read", "write", "failed"])) {
    case "read":
      return { call, kind: "read", name: text(body, "reply", "name"), binary: count(body, "reply", "binary") };
    case "write":
      return { call, kind: "write", path: nonEmptyText(body, "reply", "path") };
    case "failed":
      return { call, kind: "failed", message: text(body, "reply", "message") };
  }
}

/** Throws ProtocolError naming the field. An unknown kind is an error, not ignored. */
export function parseTabMessage(json: unknown): TabMessage {
  const { kind, body } = envelope(json);
  switch (kind) {
    case "hello": {
      const app = text(body, kind, "app");
      if (app !== "filament-booth") throw new ProtocolError(`hello.app: expected "filament-booth", got ${JSON.stringify(app)}`);
      return { hello: { app, protocol: count(body, kind, "protocol"), token: nonEmptyText(body, kind, "token"), pageId: nonEmptyText(body, kind, "pageId") } };
    }
    case "output":
      return { output: { job: job(body, kind), text: text(body, kind, "text") } };
    case "progress": {
      const fraction = member(body, kind, "fraction");
      if (fraction !== null && (typeof fraction !== "number" || !(fraction >= 0 && fraction <= 1))) {
        throw new ProtocolError(`progress.fraction: expected null or a number from 0 to 1, got ${typeof fraction === "number" ? String(fraction) : kindOf(fraction)}`);
      }
      return { progress: { job: job(body, kind), text: text(body, kind, "text"), fraction } };
    }
    case "image": {
      const path = member(body, kind, "path");
      if (path !== null && typeof path !== "string") throw new ProtocolError(`image.path: expected a string or null, got ${kindOf(path)}`);
      return {
        image: {
          job: job(body, kind),
          label: oneOf(body, kind, "label", ["render", "preview"]),
          path,
          width: pixels(body, kind, "width"),
          height: pixels(body, kind, "height"),
          note: text(body, kind, "note"),
          binary: count(body, kind, "binary"),
        },
      };
    }
    case "done":
      return { done: { job: job(body, kind), outcome: parseOutcome(member(body, kind, "outcome"), "done.outcome") } };
    case "read":
      return { read: { call: count(body, kind, "call"), job: job(body, kind), path: nonEmptyText(body, kind, "path") } };
    case "write":
      return {
        write: {
          call: count(body, kind, "call"),
          job: job(body, kind),
          path: nonEmptyText(body, kind, "path"),
          name: text(body, kind, "name"),
          binary: count(body, kind, "binary"),
        },
      };
    default:
      throw new ProtocolError(`message: unknown kind ${JSON.stringify(kind)}`);
  }
}

export function parseBridgeMessage(json: unknown): BridgeMessage {
  const { kind, body } = envelope(json);
  switch (kind) {
    case "welcome": {
      const version = count(body, kind, "protocol");
      if (version !== PROTOCOL) throw new ProtocolError(`welcome.protocol: expected ${PROTOCOL}, got ${version}`);
      return { welcome: { protocol: PROTOCOL } };
    }
    case "refused":
      return { refused: { reason: text(body, kind, "reason") } };
    case "run":
      return { run: { job: job(body, kind), code: text(body, kind, "code") } };
    case "cancel":
      return { cancel: { job: job(body, kind) } };
    case "reply":
      return { reply: parseReply(body) };
    default:
      throw new ProtocolError(`message: unknown kind ${JSON.stringify(kind)}`);
  }
}

/** The npm package that runs the bridge with Node: `npx -y filament-booth`. */
export const BRIDGE_PACKAGE = "filament-booth";
/** Where the booth is hosted. The pairing link starts here unless the bridge gets --app. */
export const BOOTH_URL = "https://booth.artems.net/";
/** Origins the bridge accepts without --app: the hosted booth and the dev server. */
export const BRIDGE_ORIGINS: readonly string[] = [new URL(BOOTH_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173"];
/** The spelling of a token, the same on both sides. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The one line a user pastes into a terminal to give their agent this tab:
 * it registers the bridge with Claude Code, carrying this page's token, and
 * the port and origin only when they are not the defaults.
 */
export function bridgeArgs({ port, token, origin }: { readonly port: number; readonly token: string; readonly origin: string }): string[] {
  return [
    "-y", BRIDGE_PACKAGE, "--token", token,
    ...(port === DEFAULT_PORT ? [] : ["--port", String(port)]),
    // The hosted booth is the bridge's default pairing base. Any other origin is named, so the bridge's link opens this page.
    ...(origin === new URL(BOOTH_URL).origin ? [] : ["--app", origin]),
  ];
}

export function bridgeCommand(page: Parameters<typeof bridgeArgs>[0]): string {
  return `claude mcp add booth -- npx ${bridgeArgs(page).join(" ")}`;
}

/**
 * What the user says to the agent once the bridge is added. It names the tool,
 * because an agent with a browser tool otherwise drives the page by clicking,
 * which goes around the switch. The part in angle brackets is theirs to replace.
 */
export const AGENT_PROMPT =
  "Use the booth MCP server (booth_python tool) to work in my Filament booth tab. Don't open the page in a browser or use DevTools. " +
  "Start your first script with import bpy and print(bpy.booth.reference()). Then: <what you want, e.g. open part.stl from this folder, take a hero shot and a top view, and save the PNGs here>";

/** The pairing link's hash, `#agent=<port>.<token>`. One spelling, written by the bridge and read by the page. */
export function pairingHash(port: number, token: string): string {
  return `#agent=${port}.${token}`;
}

export function parsePairingHash(hash: string): { readonly port: number; readonly token: string } | null {
  const match = /^#agent=(\d{1,5})\.([A-Za-z0-9_-]+)$/.exec(hash);
  if (match === null || !TOKEN_PATTERN.test(match[2]!)) return null;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535 ? { port, token: match[2]! } : null;
}
