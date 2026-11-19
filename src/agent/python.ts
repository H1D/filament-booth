/**
 * python.ts: the agent's Python, CPython 3.14 (Pyodide 314) in a worker.
 *
 * PythonRuntime owns the worker on the main thread and answers its host calls
 * through AgentHost. installShim and runScript run inside Pyodide, in the
 * worker and in the Node test alike, so the test runs what the tab runs.
 *
 * A script that never returns cannot be stopped in place, so cancel
 * terminates the worker and starts a fresh one, as the booth stops every
 * other worker job. Python holds no booth state and every script starts with
 * fresh globals, so the new interpreter behaves as the old one did.
 */
import type { PyodideAPI } from "pyodide";
import type { AgentHost, JobIo } from "./host";
import type { ScriptOutcome } from "./protocol";
import bpySource from "./py/bpy.py?raw";
import mathutilsSource from "./py/mathutils.py?raw";
import { createChannel, serveHost, type HostRequest } from "./rpc";

export type ToWorker =
  | { readonly boot: { readonly channel: SharedArrayBuffer } }
  | { readonly run: string };

export type FromWorker =
  | { readonly ready: true }
  | { readonly failed: string }
  | { readonly out: string }
  | { readonly done: ScriptOutcome };

/** Where the shim lives in Pyodide's file system. Traceback frames from here are the booth's, not the agent's. */
const SHIM_DIR = "/booth";

/** Runs one script with fresh globals and says how it ended, with the shim's frames left out of the traceback. */
const RUNNER = `
import json
import linecache
import sys
import traceback


def run(code):
    linecache.cache["<agent>"] = (len(code), None, code.splitlines(True), "<agent>")
    try:
        exec(compile(code, "<agent>", "exec"), {"__name__": "__main__", "__file__": "<agent>"})
    except SystemExit as e:
        if e.code not in (None, 0):
            return _failed(e)
    except BaseException as e:
        return _failed(e)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
    return json.dumps({"kind": "done"})


def _failed(e):
    frames = [f for f in traceback.extract_tb(e.__traceback__) if not f.filename.startswith("${SHIM_DIR}/")]
    lines = traceback.format_exception_only(e)
    if frames:
        lines = ["Traceback (most recent call last):\\n", *traceback.format_list(frames), *lines]
    return json.dumps({"kind": "failed", "type": type(e).__name__, "message": str(e), "traceback": "".join(lines)})
`;

/**
 * Writes the shim into Pyodide, registers `booth_host` over `callHost`, sends
 * stdout and stderr to `write` line by line, and imports bpy so the first
 * script does not pay for it.
 */
export function installShim(py: PyodideAPI, callHost: (request: string) => string, write: (text: string) => void): void {
  const stream = () => {
    const decoder = new TextDecoder();
    return { write: (bytes: Uint8Array) => { write(decoder.decode(bytes, { stream: true })); return bytes.length; } };
  };
  py.setStdout(stream());
  py.setStderr(stream());
  py.FS.mkdirTree(SHIM_DIR);
  py.FS.writeFile(`${SHIM_DIR}/bpy.py`, bpySource);
  py.FS.writeFile(`${SHIM_DIR}/mathutils.py`, mathutilsSource);
  py.FS.writeFile(`${SHIM_DIR}/_booth_runner.py`, RUNNER);
  py.registerJsModule("booth_host", { call: callHost });
  py.runPython([
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(SHIM_DIR)})`,
    "sys.stdout.reconfigure(line_buffering=True)",
    "sys.stderr.reconfigure(line_buffering=True)",
    "import bpy",
  ].join("\n"));
}

/** Runs one script to its end. Every Python exception is an outcome, never a throw. */
export function runScript(py: PyodideAPI, code: string): ScriptOutcome {
  const runner = py.pyimport("_booth_runner");
  try {
    return parseOutcome(String(runner.run(code)));
  } finally {
    runner.destroy();
  }
}

function parseOutcome(text: string): ScriptOutcome {
  const o = JSON.parse(text) as Partial<Record<string, unknown>>;
  if (o.kind === "done") return { kind: "done" };
  return { kind: "failed", type: String(o.type), message: String(o.message), traceback: String(o.traceback) };
}

/** Why the agent's Python cannot run in this page, or null when it can. */
export function pythonUnavailable(): string | null {
  return typeof SharedArrayBuffer === "function" && globalThis.crossOriginIsolated === true
    ? null
    : "the agent's Python needs a cross-origin isolated page (SharedArrayBuffer), and this page is not";
}

interface Live {
  readonly worker: Worker;
  readonly ready: Promise<void>;
  /** Stops answering its calls and terminates it. */
  readonly stop: () => void;
}

interface Job {
  readonly io: JobIo;
  readonly abort: AbortController;
  readonly finish: (outcome: ScriptOutcome) => void;
}

const crashed = (message: string): ScriptOutcome => ({ kind: "failed", type: "RuntimeError", message, traceback: "" });

export class PythonRuntime {
  readonly #host: AgentHost;
  readonly #spawn: () => Worker;
  #live: Live | null = null;
  #job: Job | null = null;

  /** `spawn` creates the worker from py-worker.ts, so Vite bundles it where the app is wired. */
  constructor(host: AgentHost, spawn: () => Worker) {
    this.#host = host;
    this.#spawn = spawn;
  }

  get running(): boolean { return this.#job !== null; }

  /** Loads Python now, so the first script does not wait for it. Rejects when Pyodide cannot load. */
  start(): Promise<void> {
    this.#live ??= this.#boot();
    return this.#live.ready;
  }

  /**
   * Runs one script with fresh globals. Settles when it ends and never
   * rejects: a Python exception, a cancel or a crashed worker is an outcome.
   * The runtime owns the job's abort signal; cancel() fires it.
   */
  async run(code: string, io: Omit<JobIo, "signal">): Promise<ScriptOutcome> {
    if (this.#job !== null) throw new Error("a script is already running");
    const abort = new AbortController();
    let settle: (outcome: ScriptOutcome) => void = () => {};
    const outcome = new Promise<ScriptOutcome>((resolve) => { settle = resolve; });
    const job: Job = {
      io: {
        signal: abort.signal,
        print: (text) => { io.print(text); },
        progress: (text, fraction) => { io.progress(text, fraction); },
        read: (path) => io.read(path),
        write: (path, name, bytes) => io.write(path, name, bytes),
        image: (meta, thumbnail) => { io.image(meta, thumbnail); },
      },
      abort,
      finish: (result) => {
        if (this.#job !== job) return;
        this.#job = null;
        settle(result);
      },
    };
    this.#job = job;
    const live = (this.#live ??= this.#boot());
    try {
      await live.ready;
    } catch (e) {
      job.finish(crashed(`Python did not start: ${e instanceof Error ? e.message : String(e)}`));
      return outcome;
    }
    if (this.#job === job) live.worker.postMessage({ run: code } satisfies ToWorker);
    return outcome;
  }

  /**
   * Stops the running script: aborts its signal, which cancels a photo in
   * flight, terminates the interpreter and starts a fresh one for the next.
   */
  cancel(by: "agent" | "user"): void {
    const job = this.#job;
    if (job === null) return;
    job.abort.abort(by);
    this.#live?.stop();
    this.#live = null;
    job.finish({ kind: "cancelled", by });
    this.start().catch(() => {});
  }

  dispose(): void {
    this.cancel("user");
    this.#live?.stop();
    this.#live = null;
  }

  #boot(): Live {
    const worker = this.#spawn();
    const channel = createChannel();
    const stopServing = serveHost(worker, channel, (request) => this.#host.call(request, this.#job?.io ?? null));
    let resolveReady: () => void = () => {};
    let rejectReady: (e: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    ready.catch(() => {});
    const live: Live = { worker, ready, stop: () => { stopServing(); worker.terminate(); } };
    const lose = (message: string) => {
      rejectReady(new Error(message));
      if (this.#live !== live) return;
      live.stop();
      this.#live = null;
      this.#job?.finish(crashed(message));
    };
    worker.addEventListener("message", (event: MessageEvent<FromWorker | HostRequest>) => {
      if (this.#live !== live) return;
      const message = event.data;
      if ("ready" in message) resolveReady();
      else if ("failed" in message) lose(`Python did not start: ${message.failed}`);
      else if ("out" in message) this.#job?.io.print(message.out);
      else if ("done" in message) this.#job?.finish(message.done);
    });
    worker.addEventListener("error", (event) => { lose(`the Python worker stopped: ${event.message}`); });
    worker.postMessage({ boot: { channel } } satisfies ToWorker);
    return live;
  }
}
