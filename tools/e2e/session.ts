/**
 * session.ts: the real app (index.html) on a Vite dev server, in a headful
 * Chromium with hardware WebGPU. Plain headless Chromium only offers a
 * software adapter, so the driver re-runs itself inside a headless gamescope
 * (a Wayland compositor with Xwayland) and Chromium draws there with Vulkan.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";

export const REPO = join(import.meta.dirname, "../..");
export const WIDTH = 1440, HEIGHT = 900;
/** /tmp is a small tmpfs here, and a browser profile with a few photos fills it. */
export const SCRATCH = process.env.BOOTH_TMP ?? join(homedir(), ".t3/scratch/e2e-tmp");

/** The 2D canvas stays accelerated, as in a user's browser: the driver must see what they would. */
const GPU_FLAGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ozone-platform=x11", "--ignore-gpu-blocklist"];

/**
 * Re-runs this script inside gamescope unless it already is there. Returns, in
 * the parent, whether the child reported success with a line `@ ok`; null
 * inside. gamescope's own exit code does not carry the child's.
 */
export async function enterGamescope(script: string, args: readonly string[]): Promise<boolean | null> {
  if (args.includes("--inside")) return null;
  mkdirSync(SCRATCH, { recursive: true });
  const child = spawn("gamescope", ["--backend", "headless", "-W", String(WIDTH), "-H", String(HEIGHT), "--", process.execPath, script, ...args, "--inside"], {
    stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, TMPDIR: SCRATCH },
  });
  let ok = false;
  // gamescope and Mesa write their own lines to stdout; the driver's own lines are marked.
  for await (const line of createInterface({ input: child.stdout })) {
    if (line === "@ ok") ok = true;
    else if (line.startsWith("@ ")) console.log(line.slice(2));
  }
  return ok;
}

export interface Session {
  readonly origin: string;
  readonly browser: Browser;
  readonly context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function startSession(): Promise<Session> {
  const server: ViteDevServer = await createServer({ root: REPO, logLevel: "error", server: { port: 0, host: "127.0.0.1", strictPort: false } });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") throw new Error("the dev server has no port");
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium", headless: false,
    args: [...GPU_FLAGS, `--window-size=${WIDTH},${HEIGHT}`, ...(process.env.BOOTH_CHROMIUM_FLAGS ?? "").split(" ").filter(Boolean)],
  });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT - 80 }, acceptDownloads: true });
  const page = await context.newPage();
  return {
    origin, browser, context, page,
    close: async () => {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}
