import { expect, test } from "vitest";
import {
  PROTOCOL,
  ProtocolError,
  pairingHash,
  parseBridgeMessage,
  parsePairingHash,
  parseTabMessage,
  type BridgeMessage,
  type JobId,
  type TabMessage,
} from "../src/agent/protocol";

const job = "4f1c2a9e" as JobId;
const image = { label: "render", path: "/work/out.png", width: 1600, height: 2000, note: "431/512 samples", binary: 1234 } as const;

const tabMessages: readonly TabMessage[] = [
  { hello: { app: "filament-booth", protocol: PROTOCOL, token: "9c1e47a0d2b35f86e4a1", pageId: "page-1" } },
  { output: { job, text: "lights: ['Key']\n" } },
  { progress: { job, text: "rendering 8%", fraction: 0.08 } },
  { progress: { job, text: "slicing", fraction: null } },
  { image: { job, ...image } },
  { image: { job, ...image, label: "preview", path: null } },
  { done: { job, outcome: { kind: "done" } } },
  { done: { job, outcome: { kind: "failed", type: "ValueError", message: "too bright", traceback: "Traceback..." } } },
  { done: { job, outcome: { kind: "cancelled", by: "user" } } },
  { read: { call: 3, job, path: "parts/bracket.stl" } },
  { write: { call: 4, job, path: "renders/", name: "photo.png", binary: 99 } },
];

const bridgeMessages: readonly BridgeMessage[] = [
  { welcome: { protocol: PROTOCOL } },
  { refused: { reason: "wrong token" } },
  { run: { job, code: "import bpy" } },
  { cancel: { job } },
  { reply: { call: 3, kind: "read", name: "bracket.stl", binary: 2048 } },
  { reply: { call: 4, kind: "write", path: "/work/renders/photo.png" } },
  { reply: { call: 5, kind: "failed", message: "outside the allowed folders" } },
];

test.each(tabMessages.map((message) => [Object.keys(message)[0]!, message] as const))("a well formed %s message from the tab parses unchanged", (_kind, message) => {
  expect(parseTabMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
});

test.each(bridgeMessages.map((message) => [Object.keys(message)[0]!, message] as const))("a well formed %s message from the bridge parses unchanged", (_kind, message) => {
  expect(parseBridgeMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
});

test("fields the parser does not know are dropped, not passed on", () => {
  const parsed = parseTabMessage({ output: { job, text: "x", extra: { nested: true } } });
  expect(parsed).toEqual({ output: { job, text: "x" } });
});

const hello = { app: "filament-booth", protocol: PROTOCOL, token: "t", pageId: "p" };

const badTabFrames: readonly (readonly [string, unknown, string])[] = [
  ["a string", "hello", "message: expected an object, got string"],
  ["an array", [], "message: expected an object, got an array"],
  ["null", null, "message: expected an object, got null"],
  ["no key", {}, "message: expected exactly one key, got none"],
  ["two keys", { output: { job, text: "" }, done: {} }, "message: expected exactly one key, got output, done"],
  ["an unknown kind", { ping: {} }, 'message: unknown kind "ping"'],
  ["a body that is not an object", { hello: "x" }, "hello: expected an object, got string"],
  ["a hello from another app", { hello: { ...hello, app: "scanruler" } }, 'hello.app: expected "filament-booth"'],
  ["a hello without a token", { hello: { app: "filament-booth", protocol: 1, pageId: "p" } }, "hello.token: missing"],
  ["a hello with an empty token", { hello: { ...hello, token: "" } }, "hello.token: must not be empty"],
  ["a hello with a fractional protocol", { hello: { ...hello, protocol: 1.5 } }, "hello.protocol: expected a non-negative whole number, got 1.5"],
  ["a hello with a numeric page id", { hello: { ...hello, pageId: 7 } }, "hello.pageId: expected a string, got number"],
  ["output without a job", { output: { text: "x" } }, "output.job: missing"],
  ["output with an empty job", { output: { job: "", text: "x" } }, "output.job: must not be empty"],
  ["output text that is not a string", { output: { job, text: 5 } }, "output.text: expected a string, got number"],
  ["progress with a fraction above 1", { progress: { job, text: "x", fraction: 1.2 } }, "progress.fraction: expected null or a number from 0 to 1, got 1.2"],
  ["progress with a missing fraction", { progress: { job, text: "x" } }, "progress.fraction: missing"],
  ["progress with a text fraction",{ progress: { job, text: "x", fraction: "half" } }, "progress.fraction"],
  ["an image with another label", { image: { job, ...image, label: "sketch" } }, 'image.label: expected one of render, preview, got "sketch"'],
  ["an image with zero width", { image: { job, ...image, width: 0 } }, "image.width: must be at least 1"],
  ["an image with a negative byte count", { image: { job, ...image, binary: -1 } }, "image.binary: expected a non-negative whole number, got -1"],
  ["an image whose path is a number", { image: { job, ...image, path: 4 } }, "image.path: expected a string or null, got number"],
  ["done without an outcome", { done: { job } }, "done.outcome: missing"],
  ["done with another outcome kind", { done: { job, outcome: { kind: "paused" } } }, 'done.outcome.kind: expected one of done, failed, cancelled, got "paused"'],
  ["a failed outcome without a traceback", { done: { job, outcome: { kind: "failed", type: "E", message: "m" } } }, "done.outcome.traceback: missing"],
  ["a cancelled outcome by someone else", { done: { job, outcome: { kind: "cancelled", by: "cron" } } }, "done.outcome.by: expected one of agent, user"],
  ["a read with a negative call", { read: { call: -1, job, path: "a" } }, "read.call: expected a non-negative whole number, got -1"],
  ["a read with an empty path", { read: { call: 1, job, path: "" } }, "read.path: must not be empty"],
  ["a write without a byte count", { write: { call: 1, job, path: "a", name: "n" } }, "write.binary: missing"],
  ["a write with an unsafe byte count", { write: { call: 1, job, path: "a", name: "n", binary: 2 ** 60 } }, "write.binary: expected a non-negative whole number"],
];

test.each(badTabFrames)("the tab parser rejects %s and names the field", (_name, frame, expected) => {
  expect(() => parseTabMessage(frame)).toThrow(ProtocolError);
  expect(() => parseTabMessage(frame)).toThrow(expected);
});

const badBridgeFrames: readonly (readonly [string, unknown, string])[] = [
  ["an unknown kind", { hello }, 'message: unknown kind "hello"'],
  ["a welcome for another protocol", { welcome: { protocol: 2 } }, "welcome.protocol: expected 1, got 2"],
  ["a refusal without a reason", { refused: {} }, "refused.reason: missing"],
  ["a run without code", { run: { job } }, "run.code: missing"],
  ["a cancel with a numeric job", { cancel: { job: 4 } }, "cancel.job: expected a string, got number"],
  ["a reply without a call", { reply: { kind: "failed", message: "m" } }, "reply.call: missing"],
  ["a reply of another kind", { reply: { call: 1, kind: "delete" } }, 'reply.kind: expected one of read, write, failed, got "delete"'],
  ["a read reply without a byte count", { reply: { call: 1, kind: "read", name: "a.stl" } }, "reply.binary: missing"],
  ["a write reply with an empty path", { reply: { call: 1, kind: "write", path: "" } }, "reply.path: must not be empty"],
  ["a failed reply with a numeric message", { reply: { call: 1, kind: "failed", message: 1 } }, "reply.message: expected a string, got number"],
];

test.each(badBridgeFrames)("the bridge parser rejects %s and names the field", (_name, frame, expected) => {
  expect(() => parseBridgeMessage(frame)).toThrow(ProtocolError);
  expect(() => parseBridgeMessage(frame)).toThrow(expected);
});

test("a frame that uses an own property called __proto__ is read as data", () => {
  const frame: unknown = JSON.parse('{"output":{"job":"j","text":"x","__proto__":{"job":"other"}}}');
  expect(parseTabMessage(frame)).toEqual({ output: { job: "j", text: "x" } });
});

test("the pairing hash the bridge writes is the one the page reads", () => {
  const token = "9c1e47a0d2b35f86e4a1";
  expect(parsePairingHash(pairingHash(47615, token))).toEqual({ port: 47615, token });
  expect(parsePairingHash("#agent=70000.9c1e47a0d2b35f86e4a1")).toBeNull();
});
