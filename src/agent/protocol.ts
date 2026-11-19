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

/** Throws ProtocolError naming the field. An unknown kind is an error, not ignored. */
export function parseTabMessage(json: unknown): TabMessage {
  void json;
  throw new Error("not implemented");
}

export function parseBridgeMessage(json: unknown): BridgeMessage {
  void json;
  throw new Error("not implemented");
}

/** The pairing link's hash, `#agent=<port>.<token>`. One spelling, written by the bridge and read by the page. */
export function pairingHash(port: number, token: string): string {
  return `#agent=${port}.${token}`;
}

export function parsePairingHash(hash: string): { readonly port: number; readonly token: string } | null {
  const match = /^#agent=(\d{1,5})\.([A-Za-z0-9_-]{8,128})$/.exec(hash);
  if (match === null) return null;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535 ? { port, token: match[2]! } : null;
}
