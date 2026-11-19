/**
 * vendor-pyodide.ts: copies the pinned Pyodide runtime from node_modules into
 * public/pyodide/, where the app serves it from its own origin. The page is
 * cross-origin isolated, so the interpreter cannot come from a CDN without
 * that CDN's cooperation, and the booth makes no network call at runtime.
 *
 * Run after changing the pyodide version in package.json: bun tools/agent/vendor-pyodide.ts
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"] as const;

const root = join(import.meta.dirname, "..", "..");
const from = join(root, "node_modules", "pyodide");
const to = join(root, "public", "pyodide");

const { version } = JSON.parse(await readFile(join(from, "package.json"), "utf8")) as { version: string };
await mkdir(to, { recursive: true });
let bytes = 0;
for (const name of FILES) {
  await copyFile(join(from, name), join(to, name));
  bytes += (await stat(join(to, name))).size;
}
await writeFile(join(to, "README.md"), [
  `# Pyodide ${version}`,
  "",
  "CPython compiled to WebAssembly, from the `pyodide` npm package. Mozilla Public License 2.0, https://github.com/pyodide/pyodide.",
  "The agent's Python worker loads it when the user turns agent control on. Copied here by `tools/agent/vendor-pyodide.ts`. Do not edit.",
  "",
].join("\n"));
console.log(`pyodide ${version}: ${FILES.length} files, ${(bytes / 1e6).toFixed(1)} MB in public/pyodide`);
