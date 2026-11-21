/**
 * shoot.ts: makes the README's pictures. Runs Python scripts in the real app
 * through the real bridge and an MCP client, in the hardware-GPU session of
 * tools/e2e/session.ts, and keeps what an agent would get back.
 *
 *   bun tools/readme/shoot.ts <workdir> <script.py>...
 *
 * <workdir> is the folder the bridge runs in, so the scripts' relative paths
 * resolve there. benchy.py and hero.py expect 3DBenchy.stl in it (CC0, from
 * https://www.3dbenchy.com). Each script's output goes to <workdir>/<name>.log,
 * its thumbnails to <workdir>/<name>-<n>.jpg and a screenshot of the page to
 * <workdir>/<name>-page.png. The scripts run one after another in one tab, and
 * the camera a script leaves changes how the next import frames the part. The
 * README's pictures come from one run per script.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { enterGamescope, startSession } from "../e2e/session";
import type { JobReport } from "../agent/jobs";

const argv = process.argv.slice(2);
const outcome = await enterGamescope(fileURLToPath(import.meta.url), argv);
if (outcome !== null) process.exit(outcome ? 0 : 1);

const [workArg, ...scripts] = argv.filter((a) => a !== "--inside");
if (workArg === undefined || scripts.length === 0) throw new Error("usage: tools/readme/shoot.ts <workdir> <script.py>...");
const work = resolve(workArg);
const config = join(work, ".config");
await mkdir(config, { recursive: true });
const BRIDGE = join(import.meta.dirname, "../agent/bridge.ts");
const say = (line: string): void => { console.log(`@ ${line}`); };

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => { server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  await new Promise<void>((done) => { server.close(() => { done(); }); });
  if (address === null || typeof address === "string") throw new Error("no free port");
  return address.port;
}

const session = await startSession();
const { page, origin } = session;
page.setDefaultTimeout(120_000);
let ok = true;
try {
  const port = await freePort();
  const env = { ...getDefaultEnvironment(), FILAMENT_BOOTH_CONFIG_DIR: config };
  const bridgeArgs = ["--port", String(port), "--app", origin];
  const pair = spawnSync(process.execPath, [BRIDGE, "--pair", ...bridgeArgs], { cwd: work, env, encoding: "utf8" });
  const link = /link\s+(\S+)/.exec(pair.stdout)?.[1];
  if (link === undefined) throw new Error(`no pairing link:\n${pair.stdout}\n${pair.stderr}`);

  const client = new Client({ name: "readme-shoot", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BRIDGE, ...bridgeArgs], cwd: work, env, stderr: "ignore" }));
  const tool = (name: string, args: Record<string, unknown>): Promise<CallToolResult> =>
    client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }) as Promise<CallToolResult>;

  await page.goto(link);
  await page.waitForSelector(".app");
  await page.getByRole("switch", { name: /control this tab/ }).click();
  await page.locator(".agent .agent-status", { hasText: "Waiting for the bridge" }).waitFor();

  for (const script of scripts) {
    const name = basename(script, ".py");
    const started = Date.now();
    let result = await tool("booth_python", { code: readFileSync(script, "utf8"), wait_s: 20 });
    let report = result.structuredContent as unknown as JobReport;
    if (result.isError === true || report === undefined) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
    let output = report.output;
    const images = [...report.images];
    let shots = 0;
    const keep = (r: CallToolResult): void => {
      for (const block of r.content) {
        if (block.type !== "image") continue;
        shots += 1;
        writeFileSync(join(work, `${name}-${shots}.jpg`), Buffer.from(block.data, "base64"));
      }
    };
    keep(result);
    while (report.state === "running") {
      if (Date.now() - started > 3_600_000) throw new Error(`${name}: still running after an hour`);
      result = await tool("booth_wait", { job: report.job, wait_s: 20 });
      report = result.structuredContent as unknown as JobReport;
      if (result.isError === true || report === undefined) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
      output += report.output;
      images.push(...report.images);
      keep(result);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const error = report.error === null ? "" : `\n${report.error.type}: ${report.error.message}\n${report.error.traceback}`;
    writeFileSync(join(work, `${name}.log`), `state ${report.state} in ${seconds} s\n${output}${error}\n${JSON.stringify(images, null, 1)}\n`);
    await page.waitForTimeout(4000);
    // The rail as a visitor first sees it: the Agent section folded, scrolled to the top.
    await page.evaluate(() => {
      const agent = document.querySelector<HTMLDetailsElement>('details.section[data-section="agent"]');
      if (agent !== null) agent.open = false;
      document.querySelector(".rail")?.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(work, `${name}-page.png`) });
    say(`${name}: ${report.state} in ${seconds} s, ${shots} thumbnails`);
    if (report.state !== "done") ok = false;
  }
  await client.close();
} catch (e) {
  ok = false;
  say(`FAILED ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
} finally {
  await session.close();
}
if (ok) say("ok");
process.exit(ok ? 0 : 1);
