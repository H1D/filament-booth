/**
 * jobs.ts: the job table behind the three tools.
 *
 * A script is a job from the moment booth_python sends it until the tab says
 * done. A tool call only waits on a job: one that runs out of wait_s returns
 * state "running" and leaves the job alone, and an MCP client that gives up on
 * a call detaches its waiter and nothing more. Only booth_cancel, the user's
 * Stop script, or the tab going away ends a job early.
 *
 * Each report carries what arrived since the previous report for that job, so
 * repeated booth_wait calls never repeat output or images. Wire types stop
 * here: the agent sees only JobReport.
 */
import { randomBytes } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ImageMeta, JobId, ScriptOutcome } from "../../src/agent/protocol";
import { NoTab, type TabEvents } from "./tabs";

/** What the agent sees after every tool call. */
export interface JobReport {
  readonly job: string;
  readonly state: "running" | "done" | "failed" | "cancelled";
  /** print() output and warnings since the last report for this job, the last 20 000 characters of it. */
  readonly output: string;
  /** Only while running: what the tab is doing now. */
  readonly progress: string | null;
  readonly error: { readonly type: string; readonly message: string; readonly traceback: string } | null;
  /** Renders and previews finished since the last report. Each thumbnail is an image block beside the report. */
  readonly images: readonly ImageMeta[];
  readonly elapsed_s: number;
}

/** A report and the thumbnails of its images, in the same order. */
export interface Reported {
  readonly report: JobReport;
  readonly thumbnails: readonly Uint8Array[];
}

export const MAX_OUTPUT_CHARS = 20_000;
/** Images one report carries. A script that loops previews would otherwise fill the bridge's memory and the agent's context. */
export const MAX_IMAGES = 8;
/** booth_cancel waits this long for the tab to confirm before it says the cancel is still pending. */
export const CANCEL_GRACE_S = 10;
const KEPT_JOBS = 16;

type Status =
  | { readonly kind: "running"; readonly progress: string | null }
  | { readonly kind: "ended"; readonly outcome: ScriptOutcome; readonly at: number };

interface Waiter {
  readonly wake: () => void;
  readonly sink: ProgressSink | undefined;
}

interface JobRecord {
  readonly id: JobId;
  readonly startedAt: number;
  status: Status;
  /** Since the last report. */
  output: string;
  droppedChars: number;
  droppedImages: number;
  images: { readonly meta: ImageMeta; readonly thumbnail: Uint8Array }[];
  readonly waiters: Set<Waiter>;
}

export type ProgressSink = (text: string, fraction: number | null) => void;

export interface WaitOptions {
  readonly waitS: number;
  readonly sink?: ProgressSink | undefined;
  /** Aborts the wait, not the job. */
  readonly signal?: AbortSignal | undefined;
}

export interface JobTabs {
  run(job: JobId, code: string): void;
  cancel(job: JobId): void;
}

export interface JobsDeps {
  readonly tabs: JobTabs;
  readonly now?: () => number;
  readonly newId?: () => string;
  readonly cancelGraceS?: number;
}

/** A refusal the tool returns as an error with this text: busy, unknown job, no tab. */
export class ToolRefusal extends Error {
  override name = "ToolRefusal";
}

export class Jobs implements TabEvents {
  readonly #tabs: JobTabs;
  readonly #now: () => number;
  readonly #newId: () => string;
  readonly #cancelGraceS: number;
  readonly #jobs = new Map<string, JobRecord>();

  constructor(deps: JobsDeps) {
    this.#tabs = deps.tabs;
    this.#now = deps.now ?? Date.now;
    this.#newId = deps.newId ?? (() => randomBytes(4).toString("hex"));
    this.#cancelGraceS = deps.cancelGraceS ?? CANCEL_GRACE_S;
  }

  has(job: string): boolean {
    return this.#jobs.has(job);
  }

  async run(code: string, options: WaitOptions): Promise<Reported> {
    const current = this.#running();
    if (current !== null) {
      const doing = current.status.kind === "running" && current.status.progress !== null ? ` (${current.status.progress})` : "";
      throw new ToolRefusal(`Job ${current.id} is still running${doing}. Call booth_wait to follow it or booth_cancel to stop it, then start the next script.`);
    }
    const record: JobRecord = {
      id: this.#newId() as JobId,
      startedAt: this.#now(),
      status: { kind: "running", progress: null },
      output: "",
      droppedChars: 0,
      droppedImages: 0,
      images: [],
      waiters: new Set(),
    };
    this.#jobs.set(record.id, record);
    try {
      this.#tabs.run(record.id, code);
    } catch (error) {
      this.#jobs.delete(record.id);
      if (error instanceof NoTab) throw new ToolRefusal("The booth tab disconnected before the script could start. Call booth_python again.");
      throw error;
    }
    this.#prune();
    return this.#follow(record, options);
  }

  async wait(job: string, options: WaitOptions): Promise<Reported> {
    return this.#follow(this.#find(job), options);
  }

  async cancel(job: string, signal?: AbortSignal): Promise<Reported> {
    const record = this.#find(job);
    if (record.status.kind === "running") {
      this.#tabs.cancel(record.id);
      await this.#until(record, { waitS: this.#cancelGraceS, signal });
      if (record.status.kind === "running") {
        record.status = { kind: "running", progress: "cancel requested, waiting for the tab to confirm" };
      }
    }
    return this.#report(record, true);
  }

  // ---- TabEvents ------------------------------------------------------------------------------

  output(job: JobId, text: string): void {
    const record = this.#runningRecord(job);
    if (record === undefined) return;
    const joined = record.output + text;
    record.droppedChars += Math.max(0, joined.length - MAX_OUTPUT_CHARS);
    record.output = joined.slice(-MAX_OUTPUT_CHARS);
  }

  progress(job: JobId, text: string, fraction: number | null): void {
    const record = this.#runningRecord(job);
    if (record === undefined) return;
    record.status = { kind: "running", progress: text };
    for (const waiter of record.waiters) waiter.sink?.(text, fraction);
  }

  image(job: JobId, meta: ImageMeta, thumbnail: Uint8Array): void {
    const record = this.#runningRecord(job);
    if (record === undefined) return;
    record.images.push({ meta, thumbnail });
    if (record.images.length <= MAX_IMAGES) return;
    record.images.shift();
    record.droppedImages += 1;
  }

  done(job: JobId, outcome: ScriptOutcome): void {
    const record = this.#runningRecord(job);
    if (record !== undefined) this.#end(record, outcome);
  }

  disconnected(reason: string | null): void {
    const record = this.#running();
    if (record === null) return;
    this.#end(record, {
      kind: "failed",
      type: "TabDisconnected",
      message: reason === null ? "the booth tab disconnected" : `the booth tab disconnected: ${reason}`,
      traceback: "",
    });
  }

  isRunning(job: JobId): boolean {
    return this.#runningRecord(job) !== undefined;
  }

  // ---- internals ------------------------------------------------------------------------------

  #find(job: string): JobRecord {
    const record = this.#jobs.get(job);
    if (record === undefined) {
      throw new ToolRefusal(`No job ${job} on this bridge. Jobs belong to one bridge process: start a script with booth_python.`);
    }
    return record;
  }

  #running(): JobRecord | null {
    for (const record of this.#jobs.values()) if (record.status.kind === "running") return record;
    return null;
  }

  #runningRecord(job: string): JobRecord | undefined {
    const record = this.#jobs.get(job);
    return record?.status.kind === "running" ? record : undefined;
  }

  #end(record: JobRecord, outcome: ScriptOutcome): void {
    record.status = { kind: "ended", outcome, at: this.#now() };
    for (const waiter of [...record.waiters]) waiter.wake();
  }

  /** Keeps the table small: the oldest finished jobs go first. */
  #prune(): void {
    for (const [id, record] of this.#jobs) {
      if (this.#jobs.size <= KEPT_JOBS) return;
      if (record.status.kind === "ended") this.#jobs.delete(id);
    }
  }

  async #follow(record: JobRecord, options: WaitOptions): Promise<Reported> {
    const how = await this.#until(record, options);
    // A detached call has no reader, so what it would have drained stays for the next report.
    return this.#report(record, how !== "detached");
  }

  #until(record: JobRecord, options: { readonly waitS: number; readonly sink?: ProgressSink | undefined; readonly signal?: AbortSignal | undefined }): Promise<"ended" | "timeout" | "detached"> {
    const { signal } = options;
    if (record.status.kind === "ended") return Promise.resolve("ended");
    if (signal?.aborted === true) return Promise.resolve("detached");
    return new Promise((settle) => {
      const finish = (how: "ended" | "timeout" | "detached"): void => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        record.waiters.delete(waiter);
        settle(how);
      };
      const onAbort = (): void => { finish("detached"); };
      const waiter: Waiter = { wake: () => { finish("ended"); }, sink: options.sink };
      const timer = setTimeout(() => { finish("timeout"); }, options.waitS * 1000);
      record.waiters.add(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  #report(record: JobRecord, drain: boolean): Reported {
    const { status } = record;
    const outcome = status.kind === "ended" ? status.outcome : null;
    const dropped = (record.droppedChars > 0 ? `[${record.droppedChars} earlier characters dropped]\n` : "")
      + (record.droppedImages > 0 ? `[${record.droppedImages} earlier images dropped, a report carries the newest ${MAX_IMAGES}]\n` : "");
    const report: JobReport = {
      job: record.id,
      state: outcome === null ? "running" : outcome.kind,
      output: dropped + record.output,
      progress: status.kind === "running" ? status.progress : null,
      error: outcome?.kind === "failed" ? { type: outcome.type, message: outcome.message, traceback: outcome.traceback } : null,
      images: record.images.map((image) => image.meta),
      elapsed_s: Math.round(((status.kind === "ended" ? status.at : this.#now()) - record.startedAt) / 1000),
    };
    const thumbnails = record.images.map((image) => image.thumbnail);
    if (drain) {
      record.output = "";
      record.droppedChars = 0;
      record.droppedImages = 0;
      record.images = [];
    }
    return { report, thumbnails };
  }
}

/** One text block, the report as structuredContent, and one image block per thumbnail. */
export function toMcpResult({ report, thumbnails }: Reported): CallToolResult {
  return {
    content: [
      { type: "text", text: reportText(report) },
      ...thumbnails.map((thumbnail) => ({ type: "image" as const, data: Buffer.from(thumbnail).toString("base64"), mimeType: "image/jpeg" })),
    ],
    structuredContent: { ...report },
  };
}

export function refusalResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/**
 * The text block, for clients that ignore structuredContent:
 *   job 4f1c2a9e: running (50 s)
 *   rendering 8%
 *   --- output
 *   ...
 *   --- error
 *   ValueError: ...
 *   --- images
 *   render 1600x2000 /home/me/work/out.png (431/512 samples)
 */
export function reportText(report: JobReport): string {
  const lines = [`job ${report.job}: ${report.state} (${report.elapsed_s} s)`];
  if (report.progress !== null) lines.push(report.progress);
  if (report.output !== "") lines.push("--- output", report.output.replace(/\n$/, ""));
  if (report.error !== null) lines.push("--- error", report.error.traceback !== "" ? report.error.traceback : `${report.error.type}: ${report.error.message}`);
  if (report.images.length > 0) {
    lines.push("--- images");
    for (const image of report.images) {
      lines.push(`${image.label} ${image.width}x${image.height} ${image.path ?? "(not saved)"} (${image.note})`);
    }
  }
  return lines.join("\n");
}
