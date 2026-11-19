/**
 * Headless Chromium driving dev/photo.html over the DevTools protocol, served by Vite's dev
 * server (cross-origin isolated by vite.config.ts). Each page load uses a fresh profile.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";

export const REPO = new URL("../..", import.meta.url).pathname;
const CHROMIUM = process.env.CHROMIUM ?? "/usr/bin/chromium";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Narrows protocol JSON to a plain object. */
export function record(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null) throw new Error(`expected an object, got ${String(v)}`);
  return Object.fromEntries(Object.entries(v));
}

export async function startVite(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: ViteDevServer = await createServer({
    root: REPO, logLevel: "error", server: { host: "127.0.0.1", port: 5291, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("vite did not report a URL");
  return { url, close: () => server.close() };
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class Browser {
  private readonly chrome: ChildProcess;
  private readonly profile: string;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  readonly console: string[] = [];

  private constructor(chrome: ChildProcess, profile: string) {
    this.chrome = chrome;
    this.profile = profile;
  }

  static async launch(): Promise<Browser> {
    const profile = mkdtempSync(join(tmpdir(), "booth-parity-"));
    const port = 9400 + Math.floor(Math.random() * 400);
    const chrome = spawn(CHROMIUM, [
      "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
      "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "--window-size=1400,1000", "about:blank",
    ], { stdio: "ignore" });
    const browser = new Browser(chrome, profile);
    let socketUrl = "";
    for (let i = 0; i < 100 && !socketUrl; i++) {
      try {
        const list: unknown = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = (Array.isArray(list) ? list : []).map(record).find((p) => p.type === "page");
        socketUrl = String(page?.webSocketDebuggerUrl ?? "");
      } catch {
        await sleep(100);
      }
    }
    if (!socketUrl) throw new Error("Chromium DevTools did not come up");
    const ws = new WebSocket(socketUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (event) => browser.receive(String(event.data));
    browser.ws = ws;
    await browser.send("Runtime.enable");
    await browser.send("Page.enable");
    return browser;
  }

  private receive(data: string) {
    const message = record(JSON.parse(data));
    if (typeof message.id === "number") {
      const p = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) p?.reject(new Error(JSON.stringify(message.error)));
      else p?.resolve(message.result);
    } else if (message.method === "Runtime.consoleAPICalled") {
      const args = record(message.params).args;
      this.console.push((Array.isArray(args) ? args : []).map(record).map((a) => String(a.value ?? a.description)).join(" "));
    } else if (message.method === "Runtime.exceptionThrown") {
      this.console.push(`exception ${JSON.stringify(record(message.params).exceptionDetails).slice(0, 600)}`);
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    this.ws?.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression: string): Promise<unknown> {
    const r = record(await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }));
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return record(r.result).value;
  }

  navigate(url: string): Promise<unknown> {
    return this.send("Page.navigate", { url });
  }

  /** CPU seconds used so far by every process of this Chromium (utime + stime from /proc). */
  cpuSeconds(): number {
    const pids = new Set<number>([this.chrome.pid ?? -1]);
    for (let grew = true; grew;) {
      grew = false;
      for (const entry of readdirSync("/proc")) {
        const pid = Number(entry);
        if (!pid || pids.has(pid)) continue;
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
          const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
          if (pids.has(ppid)) {
            pids.add(pid);
            grew = true;
          }
        } catch {
          // the process exited while we looked
        }
      }
    }
    let ticks = 0;
    for (const pid of pids) {
      try {
        const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
        ticks += Number(fields[11]) + Number(fields[12]);
      } catch {
        // exited
      }
    }
    return ticks / 100;
  }

  async close() {
    this.ws?.close();
    this.chrome.kill("SIGTERM");
    await sleep(500);
    rmSync(this.profile, { recursive: true, force: true });
  }
}
