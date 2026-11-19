/**
 * agent.ts: AgentControl, the opt-in switch and the policy around one script
 * at a time. It is what the UI reads and the only thing that turns agent
 * control on.
 *
 * Nothing runs until the user flips the switch: no Python, no socket. Turning
 * it on loads Python in its worker, then dials the bridge on 127.0.0.1.
 * Turning it off stops the running script, hangs up and terminates the worker.
 * The switch, the port and the token are remembered in localStorage under
 * "booth.agent", beside the document and never in it, so a saved setup file
 * cannot carry a token.
 *
 * The connection is one union (`status`), because "waiting for the bridge" and
 * "refused" cannot both be true. A script is separate: it can outlive a dropped
 * connection, and the badge must still offer to stop it.
 */
import { setTimer, type Schedule } from "../schedule";
import { Store } from "../ui/store";
import type { JobIo } from "./host";
import { BridgeLink, type LinkState, type SocketLike } from "./link";
import { DEFAULT_PORT, type JobId, type ScriptOutcome } from "./protocol";
import type { PythonRuntime } from "./python";

export const AGENT_STORAGE_KEY = "booth.agent";

/** print() output goes to the bridge at most this often per job. */
export const OUTPUT_BATCH_MS = 250;
/** Progress goes to the bridge at most this often per job, and the latest one wins. */
export const PROGRESS_WINDOW_MS = 1000;

export interface AgentSettings {
  readonly enabled: boolean;
  readonly port: number;
  readonly token: string;
}

export type AgentStatus =
  | { readonly kind: "off" }
  /** Python is loading in its worker. */
  | { readonly kind: "starting" }
  /** Python is ready and the bridge is not answering (yet). The link retries. */
  | { readonly kind: "waiting" }
  | { readonly kind: "connected" }
  /** The bridge turned this tab away. The link stops until the port or token changes. */
  | { readonly kind: "refused"; readonly reason: string }
  /** Python cannot run here, or did not start. */
  | { readonly kind: "unavailable"; readonly reason: string };

export interface RunningScript {
  readonly job: JobId;
  /** What the tab is doing now, such as "rendering 42%". */
  readonly progress: string | null;
}

export interface AgentState {
  readonly settings: AgentSettings;
  readonly status: AgentStatus;
  readonly running: RunningScript | null;
}

/** What AgentControl asks of the Python worker. PythonRuntime is it. */
export type ScriptRuntime = Pick<PythonRuntime, "start" | "run" | "cancel" | "dispose">;

export interface AgentDeps {
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  readonly runtime: ScriptRuntime;
  /** Why the agent's Python cannot run in this page, or null. */
  readonly unavailable: () => string | null;
  /** Random per page load. */
  readonly pageId: string;
  readonly openSocket?: (url: string) => SocketLike;
  readonly schedule?: Schedule;
}

const DEFAULT_SETTINGS: AgentSettings = { enabled: false, port: DEFAULT_PORT, token: "" };

export const validPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65535;

function loadSettings(storage: AgentDeps["storage"]): AgentSettings {
  try {
    const raw = storage.getItem(AGENT_STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Record<keyof AgentSettings, unknown>> | null;
    const token = typeof saved?.token === "string" ? saved.token : "";
    return {
      enabled: saved?.enabled === true && token !== "",
      port: typeof saved?.port === "number" && validPort(saved.port) ? saved.port : DEFAULT_PORT,
      token,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * One script's frames to the bridge: print() batched, progress with the latest
 * winning, thumbnails with their bytes, files by call. finish() sends what is
 * still pending and then the outcome, so the bridge never sees `done` first.
 */
class JobWire {
  readonly io: Omit<JobIo, "signal">;
  readonly #id: JobId;
  readonly #link: BridgeLink;
  readonly #schedule: Schedule;
  #text = "";
  #cancelFlush: (() => void) | null = null;
  #latest: { readonly text: string; readonly fraction: number | null } | null = null;
  #cancelWindow: (() => void) | null = null;
  readonly #images: Promise<void>[] = [];
  #over = false;

  constructor(id: JobId, link: BridgeLink, schedule: Schedule, shown: (progress: string) => void) {
    this.#id = id;
    this.#link = link;
    this.#schedule = schedule;
    this.io = {
      print: (text) => { this.#print(text); },
      progress: (text, fraction) => { shown(text); this.#progress(text, fraction); },
      read: (path) => (this.#over ? Promise.reject(new Error("the script has ended")) : link.read(id, path)),
      write: async (path, name, bytes) => {
        if (this.#over) throw new Error("the script has ended");
        return link.write(id, path, name, new Uint8Array(await bytes.arrayBuffer()));
      },
      image: (meta, thumbnail) => {
        if (this.#over) return;
        this.#images.push(thumbnail.arrayBuffer().then((buffer) => { link.image(id, meta, new Uint8Array(buffer)); }, () => {}));
      },
    };
  }

  async finish(outcome: ScriptOutcome): Promise<void> {
    if (this.#over) return;
    this.#over = true;
    this.#cancelWindow?.();
    this.#cancelWindow = null;
    this.#flush();
    await Promise.all(this.#images);
    this.#link.done(this.#id, outcome);
  }

  #print(text: string): void {
    if (this.#over) return;
    this.#text += text;
    this.#cancelFlush ??= this.#schedule(() => { this.#flush(); }, OUTPUT_BATCH_MS);
  }

  #flush(): void {
    this.#cancelFlush?.();
    this.#cancelFlush = null;
    if (this.#text === "") return;
    const text = this.#text;
    this.#text = "";
    this.#link.output(this.#id, text);
  }

  /** The first update goes out at once and opens a window, in which only the newest is kept and sent when it closes. */
  #progress(text: string, fraction: number | null): void {
    if (this.#over) return;
    if (this.#cancelWindow !== null) {
      this.#latest = { text, fraction };
      return;
    }
    this.#link.progress(this.#id, text, fraction);
    this.#openWindow();
  }

  #openWindow(): void {
    this.#cancelWindow = this.#schedule(() => {
      this.#cancelWindow = null;
      const latest = this.#latest;
      this.#latest = null;
      if (latest === null || this.#over) return;
      this.#link.progress(this.#id, latest.text, latest.fraction);
      this.#openWindow();
    }, PROGRESS_WINDOW_MS);
  }
}

interface ActiveJob {
  readonly id: JobId;
  /** Settles once the outcome has been sent. */
  readonly sent: Promise<void>;
}

export class AgentControl {
  readonly state: Store<AgentState>;
  readonly #deps: AgentDeps;
  readonly #link: BridgeLink;
  readonly #schedule: Schedule;
  #job: ActiveJob | null = null;
  /** Bumped by every switch change, so a late answer from an earlier one is ignored. */
  #generation = 0;

  constructor(deps: AgentDeps) {
    this.#deps = deps;
    this.#schedule = deps.schedule ?? setTimer;
    this.#link = new BridgeLink(
      {
        pageId: deps.pageId,
        schedule: this.#schedule,
        ...(deps.openSocket === undefined ? {} : { openSocket: deps.openSocket }),
      },
      {
        state: (state) => { this.#onLink(state); },
        run: (job, code) => { this.#onRun(job, code); },
        cancel: (job) => { if (this.#job?.id === job) deps.runtime.cancel("agent"); },
      },
    );
    const settings = loadSettings(deps.storage);
    const reason = deps.unavailable();
    this.state = new Store<AgentState>({
      settings: reason === null ? settings : { ...settings, enabled: false },
      status: reason === null ? { kind: "off" } : { kind: "unavailable", reason },
      running: null,
    });
    if (reason === null && settings.enabled) this.#start();
  }

  get settings(): AgentSettings { return this.state.get().settings; }

  /**
   * The user's switch. Loads Python, then dials the bridge. It does nothing
   * without a token, and nothing on a page that cannot run Python at all,
   * which is `unavailable` with the switch off.
   */
  enable(): void {
    const { settings, status } = this.state.get();
    if (settings.enabled || settings.token === "" || status.kind === "unavailable") return;
    this.#remember({ ...settings, enabled: true });
    this.#start();
  }

  /** Stops the running script as the user, says so to the bridge, then hangs up and ends Python. */
  disable(): void {
    const { settings } = this.state.get();
    if (!settings.enabled) return;
    const generation = ++this.#generation;
    this.#remember({ ...settings, enabled: false });
    this.#patch({ status: { kind: "off" } });
    const job = this.#job;
    this.#deps.runtime.cancel("user");
    const hangUp = (): void => {
      if (this.#generation !== generation) return;
      this.#link.close();
      this.#deps.runtime.dispose();
    };
    if (job === null) hangUp();
    else void job.sent.then(hangUp);
  }

  /** The badge's Stop script. */
  stopScript(): void {
    if (this.#job !== null) this.#deps.runtime.cancel("user");
  }

  setPort(port: number): void {
    const { settings } = this.state.get();
    if (!validPort(port) || port === settings.port) return;
    this.#remember({ ...settings, port });
    this.#redial();
  }

  setToken(token: string): void {
    const { settings } = this.state.get();
    const trimmed = token.trim();
    if (trimmed === settings.token) return;
    this.#remember({ ...settings, token: trimmed });
    if (trimmed === "") this.disable();
    else this.#redial();
  }

  /**
   * From the pairing link. It fills port and token and nothing else: the page
   * stays as off as the user left it, and one that was on is turned off, so a
   * link cannot move a connected tab to another bridge without a click.
   */
  pair(port: number, token: string): void {
    this.disable();
    const { settings } = this.state.get();
    this.#remember({ ...settings, port, token });
  }

  // ---- connection ------------------------------------------------------------------------------

  #start(): void {
    const generation = ++this.#generation;
    this.#patch({ status: { kind: "starting" } });
    this.#deps.runtime.start().then(
      () => { if (this.#generation === generation) this.#dial(); },
      (error: unknown) => {
        if (this.#generation !== generation) return;
        this.#patch({ status: { kind: "unavailable", reason: `Python did not start: ${errorText(error)}` } });
      },
    );
  }

  #dial(): void {
    const { port, token } = this.settings;
    this.#link.connect(port, token);
  }

  /** A new port or token while on connects again. While Python is still loading, #start dials with the newest. */
  #redial(): void {
    const { kind } = this.state.get().status;
    if (kind === "waiting" || kind === "connected" || kind === "refused") this.#dial();
  }

  #onLink(state: LinkState): void {
    if (!this.settings.enabled) return;
    this.#patch({ status: state });
  }

  // ---- scripts ---------------------------------------------------------------------------------

  #onRun(id: JobId, code: string): void {
    const current = this.#job;
    if (current !== null) {
      this.#link.done(id, {
        kind: "failed",
        type: "RuntimeError",
        message: `the booth tab is still running job ${current.id}, which it started before the connection dropped. ` +
          "Wait for it to end, or ask the user to press Stop script in the booth tab's Agent menu.",
        traceback: "",
      });
      return;
    }
    const wire = new JobWire(id, this.#link, this.#schedule, (progress) => {
      const { running } = this.state.get();
      if (running?.job === id && running.progress !== progress) this.#patch({ running: { job: id, progress } });
    });
    this.#patch({ running: { job: id, progress: null } });
    this.#job = { id, sent: this.#execute(id, code, wire) };
  }

  async #execute(id: JobId, code: string, wire: JobWire): Promise<void> {
    const outcome = await this.#deps.runtime.run(code, wire.io).catch(
      (error: unknown): ScriptOutcome => ({ kind: "failed", type: "RuntimeError", message: errorText(error), traceback: "" }),
    );
    await wire.finish(outcome);
    if (this.#job?.id === id) this.#job = null;
    this.#patch({ running: null });
  }

  #remember(settings: AgentSettings): void {
    this.#patch({ settings });
    try {
      this.#deps.storage.setItem(AGENT_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private windows and full quotas refuse writes: the page keeps working on what it holds.
    }
  }

  #patch(patch: Partial<AgentState>): void {
    this.state.set({ ...this.state.get(), ...patch });
  }
}
