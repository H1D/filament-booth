/**
 * PythonRuntime against a stand-in worker, so the moments around loading and
 * cancelling can be placed exactly. The real worker is driven by tools/agent/drive.ts.
 */
import { describe, expect, test } from "vitest";
import type { AgentHost } from "../src/agent/host";
import { PythonRuntime, type FromWorker, type ToWorker } from "../src/agent/python";
import { memoryIo } from "./agent-fixtures";

class StandInWorker extends EventTarget {
  readonly posted: ToWorker[] = [];
  terminated = false;
  postMessage(message: ToWorker): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  say(message: FromWorker): void { this.dispatchEvent(new MessageEvent("message", { data: message })); }
}

function rig() {
  const workers: StandInWorker[] = [];
  const host = { call: () => "{}" } as unknown as AgentHost;
  const runtime = new PythonRuntime(host, () => {
    const worker = new StandInWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  return { runtime, workers };
}

/** Lets the runtime's own promise chain run before the next assertion. */
const settled = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

const scripts = (worker: StandInWorker) => worker.posted.filter((message) => "run" in message);

describe("PythonRuntime", () => {
  test("a script sent while Python loads runs once it is ready", async () => {
    const { runtime, workers } = rig();
    const outcome = runtime.run("print(1)", memoryIo().io);
    expect(scripts(workers[0]!)).toEqual([]);
    workers[0]!.say({ ready: true });
    await settled();
    expect(scripts(workers[0]!)).toEqual([{ run: "print(1)" }]);
    workers[0]!.say({ done: { kind: "done" } });
    expect(await outcome).toEqual({ kind: "done" });
  });

  test("a cancel while Python loads ends the script as cancelled and frees the runtime", async () => {
    const { runtime, workers } = rig();
    const outcome = runtime.run("while True: pass", memoryIo().io);
    runtime.cancel("agent");
    expect(await outcome).toEqual({ kind: "cancelled", by: "agent" });
    expect(workers[0]!.terminated).toBe(true);
    expect(scripts(workers[0]!)).toEqual([]);
    expect(runtime.running).toBe(false);

    const next = runtime.run("print(2)", memoryIo().io);
    workers[1]!.say({ ready: true });
    await settled();
    workers[1]!.say({ done: { kind: "done" } });
    expect(await next).toEqual({ kind: "done" });
  });

  test("Python that fails to load is a failed script, not a hang", async () => {
    const { runtime, workers } = rig();
    const outcome = runtime.run("print(1)", memoryIo().io);
    workers[0]!.say({ failed: "no wasm" });
    expect(await outcome).toMatchObject({ kind: "failed", message: "Python did not start: no wasm" });
  });
});
