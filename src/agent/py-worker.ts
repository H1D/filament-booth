/**
 * py-worker.ts: the worker the agent's Python runs in. PythonRuntime spawns
 * it, boots it with the call channel, then sends one script at a time. A
 * host call blocks this worker, never the page, and terminating it is how a
 * runaway script stops.
 */
import type { PyodideAPI } from "pyodide";
import { installShim, runScript, type FromWorker, type ToWorker } from "./python";
import { hostCaller } from "./rpc";

/** public/pyodide, served from the page's own origin. Loaded at run time so Vite leaves it unbundled. */
const PYODIDE_URL = `${import.meta.env.BASE_URL}pyodide/`;

const post = (message: FromWorker): void => { self.postMessage(message); };
let python: PyodideAPI | null = null;

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if ("boot" in message) {
    try {
      const indexURL = new URL(PYODIDE_URL, self.location.href).href;
      const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import("pyodide");
      const py = await loadPyodide({ indexURL });
      installShim(py, hostCaller(message.boot.channel, (request) => { self.postMessage(request); }), (text) => { post({ out: text }); });
      python = py;
      post({ ready: true });
    } catch (e) {
      post({ failed: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  post({ done: python === null
    ? { kind: "failed", type: "RuntimeError", message: "Python is not loaded", traceback: "" }
    : runScript(python, message.run) });
};
