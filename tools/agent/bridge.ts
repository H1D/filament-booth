#!/usr/bin/env bun
/**
 * bridge.ts: the local process behind agent control of the booth tab. One
 * process is two servers: an MCP server over stdio for the coding agent, and
 * the loopback WebSocket server the booth tab dials (tabs.ts). It holds no
 * scene logic. It relays a script to the tab and the tab's output, progress,
 * images and outcome back, and reads and writes files on this machine for the tab.
 *
 *   npx -y filament-booth --token <t>    serve with the token the booth tab shows (the published package)
 *   bun tools/agent/bridge.ts            serve: what the agent's MCP config runs
 *   bun tools/agent/bridge.ts --pair     print the port, token and pairing link, then exit
 *   --token <t>                          use this token instead of the one in bridge.json
 *   --port <n>                           listen on this port instead of the one in bridge.json
 *   --app <origin>                       a booth origin to accept (repeatable); the first one is also the pairing link's base
 *   --allow <dir>                        another folder the tab may read and write (repeatable)
 *
 * Register it:  claude mcp add --scope user booth -- npx -y filament-booth --token <the token the tab shows>
 *          or:  claude mcp add --scope user booth -- bun <checkout>/tools/agent/bridge.ts
 *
 * The port is bound on the first tool call, so the sessions that never use the booth never hold it.
 *
 * MCP owns stdout. Every log line goes to stderr.
 */
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs as parseFlags } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BOOTH_URL, BRIDGE_ORIGINS, DEFAULT_PORT, TOKEN_PATTERN, pairingHash } from "../../src/agent/protocol";
import { Jobs, ToolRefusal, refusalResult, toMcpResult, type ProgressSink, type Reported } from "./jobs";
import { TabServer } from "./tabs";

export const DEFAULT_APP = BOOTH_URL;
export const DEFAULT_WAIT_S = 50;
export const MAX_WAIT_S = 600;
export const TAB_WAIT_MS = 15_000;
const CONFIG_DIR_ENV = "FILAMENT_BOOTH_CONFIG_DIR";

/** The only prose the agent gets before its first call. bpy.booth.reference() has the rest. */
export const TOOL_TEXT = {
  python:
    "Run a Blender Python (bpy) script inside the open Filament booth browser tab. The booth is a photo booth for one 3D-printed part: " +
    "area lights and scrims, one orbit camera, one part, a backdrop, an HDR world and Cycles. It is not Blender. Only what the booth has exists, " +
    "and anything else raises an error that names the booth's equivalent. Run print(bpy.booth.reference()) first: it lists every supported " +
    "attribute and operator with units and limits. Each call starts with fresh globals and the scene persists between calls. " +
    "bpy.ops.render.render(write_still=True) takes a photo and writes it to scene.render.filepath. bpy.ops.render.opengl() returns a quick preview image. " +
    "File paths are on this machine and relative to the folder you run in. Only that folder, and folders the bridge was started with --allow, can be read or written. " +
    "One script runs at a time. If the result's state is 'running', the script is still going in the tab: call booth_wait with its job id.",
  wait:
    "Wait for a booth_python job that was still running. Returns the output, progress and images that arrived since the last report for that job, " +
    "and the final state once it ends. Waiting never stops the job.",
  cancel:
    "Stop a running booth_python job and report its final state. The script ends where it is: edits it already made stay, and a render in progress is cancelled.",
} as const;

// ---- command line -----------------------------------------------------------

export class UsageError extends Error {
  override name = "UsageError";
}

export interface CliOptions {
  readonly mode: "serve" | "pair";
  readonly port: number | null;
  /** From --token: the token the booth tab made, used instead of bridge.json's. */
  readonly token: string | null;
  /** The booth URLs given with --app, in order. */
  readonly apps: readonly URL[];
  /** Absolute folders given with --allow. */
  readonly allow: readonly string[];
}

export function parseArgs(argv: readonly string[], cwd: string): CliOptions {
  let values;
  try {
    ({ values } = parseFlags({
      args: [...argv],
      options: {
        pair: { type: "boolean" },
        port: { type: "string" },
        token: { type: "string" },
        app: { type: "string", multiple: true },
        allow: { type: "string", multiple: true },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  let port: number | null = null;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UsageError(`--port: expected a port from 1 to 65535, got ${values.port}`);
  }
  if (values.token !== undefined && !TOKEN_PATTERN.test(values.token)) {
    throw new UsageError("--token: expected 8 to 128 letters, digits, - or _. Copy the command from the booth's Agent section again.");
  }
  const apps = (values.app ?? []).map((app) => {
    let url: URL;
    try {
      url = new URL(app);
    } catch {
      throw new UsageError(`--app: expected a URL such as ${DEFAULT_APP}, got ${app}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new UsageError(`--app: expected an http or https URL, got ${app}`);
    return url;
  });
  return {
    mode: values.pair === true ? "pair" : "serve",
    port,
    token: values.token ?? null,
    apps,
    allow: (values.allow ?? []).map((dir) => resolve(cwd, dir)),
  };
}

// ---- the token and port file ------------------------------------------------

export interface BridgeFile {
  readonly port: number;
  readonly token: string;
}

export function configDir(env: NodeJS.ProcessEnv): string {
  return env[CONFIG_DIR_ENV] ?? join(homedir(), ".config", "filament-booth");
}

/**
 * Reads bridge.json, or creates it with a fresh token and the default port.
 * The token is stable so a restarted agent needs no new pairing. The file is
 * mode 600 because the token is the only thing between a web page and the booth.
 */
export async function loadBridgeFile(dir: string): Promise<BridgeFile> {
  const file = join(dir, "bridge.json");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const fresh: BridgeFile = { port: DEFAULT_PORT, token: randomBytes(16).toString("hex") };
  try {
    await writeFile(file, `${JSON.stringify(fresh, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return fresh;
  } catch (error) {
    // Two agent sessions starting together both reach here: the loser reads what the winner wrote.
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new UsageError(`${file} is not valid JSON. Fix it, or delete it to get a new token.`);
  }
  const { port, token } = (parsed ?? {}) as Partial<Record<keyof BridgeFile, unknown>>;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535 || typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new UsageError(`${file} needs a "port" from 1 to 65535 and a "token" of 8 to 128 letters, digits, - or _. Fix it, or delete it to get a new token.`);
  }
  if (((await stat(file)).mode & 0o077) !== 0) await chmod(file, 0o600);
  return { port, token };
}

// ---- the bridge -------------------------------------------------------------

export interface BridgeConfig {
  /** 0 picks a free port: only tests do that. */
  readonly port: number;
  readonly token: string;
  readonly origins: readonly string[];
  /** Absolute folders: the agent's working directory first, then each --allow. */
  readonly roots: readonly string[];
  /** The booth URL the pairing link is built on. */
  readonly app: URL;
  /** How long a tool call waits for a tab before it gives the pairing instructions. */
  readonly tabWaitMs?: number;
  readonly cancelGraceS?: number;
  readonly log?: (line: string) => void;
}

export interface Bridge {
  readonly server: McpServer;
  readonly tabs: TabServer;
  readonly jobs: Jobs;
  pairingLink(): string;
  close(): Promise<void>;
}

export function createBridge(config: BridgeConfig): Bridge {
  const tabWaitMs = config.tabWaitMs ?? TAB_WAIT_MS;
  const log = config.log ?? ((line: string) => { console.error(line); });
  const jobs = new Jobs({
    tabs: { run: (job, code) => { tabs.run(job, code); }, cancel: (job) => { tabs.cancel(job); } },
    ...(config.cancelGraceS === undefined ? {} : { cancelGraceS: config.cancelGraceS }),
  });
  const tabs = new TabServer({ port: config.port, token: config.token, origins: config.origins, roots: config.roots, log }, jobs);
  const pairingLink = (): string => new URL(pairingHash(tabs.port, config.token), config.app).href;

  /** Null when the tool may go ahead, else the text to refuse with. A busy port is retried on every call. */
  const blocked = async (needsTab: boolean): Promise<string | null> => {
    const listening = await tabs.listen();
    if (!listening.ok) {
      const holder = listening.code === "EADDRINUSE" ? "another agent session's bridge holds it" : listening.reason;
      return `The booth bridge cannot listen on 127.0.0.1:${config.port}: ${holder}. ` +
        `Close the other agent session, or give this bridge another port with --port <n> and pair the booth tab to that port.`;
    }
    if (needsTab && tabs.pageId === null && !(await tabs.waitForTab(tabWaitMs))) {
      return `No booth tab is connected. A tab whose switch is already on redials within a minute, so call again once. ` +
        `If that also finds no tab, ask the user to open\n  ${pairingLink()}\nand turn on Setup → Agent → "Allow a local agent to control this tab".`;
    }
    return null;
  };

  const answer = async (needsTab: boolean, run: () => Promise<Reported>): Promise<CallToolResult> => {
    const refusal = await blocked(needsTab);
    if (refusal !== null) return refusalResult(refusal);
    try {
      return toMcpResult(await run());
    } catch (error) {
      if (error instanceof ToolRefusal) return refusalResult(error.message);
      throw error;
    }
  };

  const server = new McpServer({ name: "filament-booth", version: "0.1.1" });
  const waitS = z.number().min(1).max(MAX_WAIT_S).default(DEFAULT_WAIT_S)
    .describe(`How long to wait for the script to finish, in seconds (1 to ${MAX_WAIT_S}). When it runs longer the call returns state "running" and the script keeps going.`);

  /** Progress from the tab reaches the client as MCP progress notifications when it asked for them. */
  const progressTo = (extra: RequestHandlerExtra<ServerRequest, ServerNotification>): ProgressSink | undefined => {
    const progressToken = extra._meta?.progressToken;
    if (progressToken === undefined) return undefined;
    let step = 0;
    return (message) => {
      step += 1;
      extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress: step, message } }).catch(() => {});
    };
  };

  server.registerTool("booth_python", {
    title: "Run a Blender Python script in the booth",
    description: TOOL_TEXT.python,
    inputSchema: {
      code: z.string().min(1).describe("The Python source to run. Starts with fresh globals."),
      wait_s: waitS,
    },
  }, (input, extra) =>
    answer(true, () => jobs.run(input.code, { waitS: input.wait_s, sink: progressTo(extra), signal: extra.signal })));

  server.registerTool("booth_wait", {
    title: "Wait for a booth script",
    description: TOOL_TEXT.wait,
    inputSchema: {
      job: z.string().min(1).describe("The job id a booth_python call returned."),
      wait_s: waitS,
    },
  }, (input, extra) =>
    answer(!jobs.has(input.job), () => jobs.wait(input.job, { waitS: input.wait_s, sink: progressTo(extra), signal: extra.signal })));

  server.registerTool("booth_cancel", {
    title: "Stop a booth script",
    description: TOOL_TEXT.cancel,
    inputSchema: {
      job: z.string().min(1).describe("The job id a booth_python call returned."),
    },
  }, (input, extra) =>
    answer(!jobs.has(input.job), () => jobs.cancel(input.job, extra.signal)));

  return {
    server,
    tabs,
    jobs,
    pairingLink,
    async close() {
      await server.close();
      await tabs.close();
    },
  };
}

// ---- entry ------------------------------------------------------------------

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  const cli = parseArgs(argv, cwd);
  // A token from the tab needs no file: the bridge then writes nothing to this machine but what scripts save.
  const file = cli.token === null ? await loadBridgeFile(configDir(env)) : { port: DEFAULT_PORT, token: cli.token };
  const port = cli.port ?? file.port;
  const app = cli.apps[0] ?? new URL(DEFAULT_APP);

  if (cli.mode === "pair") {
    const link = new URL(pairingHash(port, file.token), app).href;
    process.stdout.write(`Filament booth bridge\n  port   ${port}\n  token  ${file.token}\n  link   ${link}\n`);
    return;
  }

  const roots = [cwd];
  for (const dir of cli.allow) {
    const real = await realpath(dir).catch(() => null);
    if (real === null || !(await stat(real)).isDirectory()) throw new UsageError(`--allow: ${dir} is not a folder`);
    roots.push(dir);
  }
  const running = createBridge({
    port,
    token: file.token,
    origins: [...BRIDGE_ORIGINS, ...cli.apps.map((url) => url.origin)],
    roots,
    app,
  });

  // The port is taken on the first tool call, not here. Registered for every project, the bridge
  // starts with every agent session, and an idle one must not hold the port the working one needs.
  console.error(`filament-booth bridge: ready, folders ${roots.join(", ")}. It listens on 127.0.0.1:${port} from the first booth tool call.`);

  await running.server.connect(new StdioServerTransport());
  const stop = (): void => {
    void running.close().finally(() => { process.exit(0); });
  };
  process.stdin.on("close", stop);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

/** The command line entry, for Bun here and for the Node build in the npm package. */
export async function run(): Promise<void> {
  try {
    await main(process.argv.slice(2), process.env, process.cwd());
  } catch (error) {
    console.error(`filament-booth bridge: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}

if (import.meta.main) await run();
