// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { CLOSE, DEFAULT_PORT, type JobId } from "../src/agent/protocol";
import { AgentPanel } from "../src/ui/AgentPanel";
import { Rail } from "../src/ui/Rail";
import { TopBar } from "../src/ui/TopBar";
import { HostProvider } from "../src/ui/host";
import { PhotoSession } from "../src/ui/photo-session";
import { Ui } from "../src/ui/store";
import { agentWith, boothWith } from "./ui-fixtures";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "9c1e47a0d2b35f86e4a1";
const SWITCH = "Allow a local agent to control this tab";
const tick = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

function mount(node: ReactNode, options: Parameters<typeof agentWith>[0] = {}) {
  const { booth } = boothWith();
  const rig = agentWith(options);
  const ui = new Ui();
  const photos = new PhotoSession(() => booth.takePhoto());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const container = host;
  const render = (): void => { act(() => { root?.render(<HostProvider host={{ booth, ui, photos, agent: rig.agent }}>{node}</HostProvider>); }); };
  render();
  return { container, ui, ...rig };
}

const inputByLabel = (container: HTMLElement, text: string): HTMLInputElement => {
  const label = [...container.querySelectorAll("label")].find((l) => l.textContent === text);
  const el = label === undefined ? null : container.querySelector(`#${CSS.escape(label.htmlFor)}`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no field labelled ${text}`);
  return el;
};

const switchInput = (container: HTMLElement): HTMLInputElement => {
  const el = container.querySelector(`input[aria-label="${SWITCH}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error("no agent switch");
  return el;
};

function typeInto(el: HTMLInputElement, value: string, key = "Enter"): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

const statusOf = (container: HTMLElement): string => container.querySelector(".agent-status")?.textContent ?? "";
const commandOf = (container: HTMLElement): string => container.querySelector(".agent-command code")?.textContent ?? "";

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  if (el === undefined) throw new Error(`no button ${name}`);
  return el;
}

describe("the Agent section", () => {
  test("a fresh page shows the one command to run, with its own token, and the switch off but available", () => {
    const { container, runtime } = mount(<AgentPanel />);
    expect(switchInput(container).checked).toBe(false);
    expect(switchInput(container).disabled).toBe(false);
    expect(statusOf(container)).toBe("Off. Run the command below, then turn the switch on");
    expect(commandOf(container)).toBe("claude mcp add booth -- npx -y filament-booth --token fresh-token-0001 --app " + location.origin);
    expect(inputByLabel(container, "Port").value).toBe(String(DEFAULT_PORT));
    expect(runtime.starts).toBe(0);
  });

  test("the command carries a port that is not the default", () => {
    const { container, agent } = mount(<AgentPanel />);
    act(() => { agent.setPort(5000); });
    expect(commandOf(container)).toContain("--token fresh-token-0001 --port 5000");
  });

  test("with the token cleared there is no command and the switch cannot be turned on", () => {
    const { container, agent } = mount(<AgentPanel />);
    act(() => { agent.setToken(""); });
    expect(container.querySelector(".agent-command")).toBeNull();
    expect(switchInput(container).disabled).toBe(true);
    expect(statusOf(container)).toBe("Off. Enter a token under Port and token");
  });

  test("a pairing fills the port and a masked token and leaves the switch off but available", () => {
    const { container, agent, runtime, sockets } = mount(<AgentPanel />);
    act(() => { agent.pair(5000, TOKEN); });
    expect(inputByLabel(container, "Port").value).toBe("5000");
    expect(inputByLabel(container, "Token").value).toBe(TOKEN);
    expect(inputByLabel(container, "Token").type).toBe("password");
    expect(switchInput(container).checked).toBe(false);
    expect(switchInput(container).disabled).toBe(false);
    expect(statusOf(container)).toBe("Off. Run the command below, then turn the switch on");
    expect(commandOf(container)).toContain(`--token ${TOKEN} --port 5000`);
    expect(runtime.starts).toBe(0);
    expect(sockets.all).toHaveLength(0);
  });

  test("the switch loads Python, then waits for the bridge on the port, then is connected", async () => {
    const { container, agent, runtime, sockets } = mount(<AgentPanel />);
    act(() => { agent.pair(5000, TOKEN); });

    act(() => { switchInput(container).click(); });
    expect(switchInput(container).checked).toBe(true);
    expect(statusOf(container)).toBe("Starting Python…");

    runtime.loaded();
    await act(tick);
    expect(statusOf(container)).toBe("Waiting for the bridge on port 5000");

    act(() => { sockets.last.welcome(); });
    expect(statusOf(container)).toBe("Connected. An agent can control this tab");
    expect(container.querySelector(".agent-status")?.getAttribute("data-tone")).toBe("accent");
  });

  test("a port typed and entered changes the port, and a value that is not a port is put back", () => {
    const { container, agent } = mount(<AgentPanel />);
    typeInto(inputByLabel(container, "Port"), "6001");
    expect(agent.settings.port).toBe(6001);
    typeInto(inputByLabel(container, "Port"), "not a port");
    expect(agent.settings.port).toBe(6001);
    expect(inputByLabel(container, "Port").value).toBe("6001");
  });

  test("a token pasted into the field is trimmed and remembered, and it makes the switch available", () => {
    const { container, agent, store } = mount(<AgentPanel />);
    typeInto(inputByLabel(container, "Token"), `  ${TOKEN}\n`);
    expect(agent.settings.token).toBe(TOKEN);
    expect(JSON.parse(store.get("booth.agent") ?? "{}")).toMatchObject({ token: TOKEN });
    expect(switchInput(container).disabled).toBe(false);
  });

  test("a refusal shows the bridge's reason as a warning", async () => {
    const { container, agent, runtime, sockets } = mount(<AgentPanel />);
    act(() => { agent.pair(DEFAULT_PORT, "the-wrong-token"); });
    act(() => { switchInput(container).click(); });
    runtime.loaded();
    await act(tick);
    act(() => {
      sockets.last.open();
      sockets.last.say({ refused: { reason: "wrong token; copy the pairing link" } });
      sockets.last.hangUp(CLOSE.badToken);
    });
    expect(statusOf(container)).toBe("Refused: wrong token; copy the pairing link");
    expect(container.querySelector(".agent-status")?.getAttribute("data-tone")).toBe("warn");
  });

  test("a page that cannot run Python disables the switch and says why", () => {
    const { container } = mount(<AgentPanel />, { unavailable: "this page is not cross-origin isolated" });
    expect(switchInput(container).disabled).toBe(true);
    expect(statusOf(container)).toBe("Unavailable: this page is not cross-origin isolated");
  });

  test("the privacy note says what a connected agent can do and where the page connects", () => {
    const { container } = mount(<AgentPanel />);
    const note = [...container.querySelectorAll(".note")].map((n) => n.textContent).join(" ");
    expect(note).toContain("change every setting");
    expect(note).toContain("open files from the folder it runs in");
    expect(note).toContain("save photos to it");
    expect(note).toContain("only to 127.0.0.1");
  });
});

describe("the rail", () => {
  test("the Agent section comes after Setup, closed until a pairing link asks for it", () => {
    const first = mount(<Rail />);
    const ids = [...first.container.querySelectorAll("details.section")].map((d) => d.getAttribute("data-section"));
    expect(ids.slice(-2)).toEqual(["setup", "agent"]);
    expect(first.container.querySelector('details[data-section="agent"]')?.hasAttribute("open")).toBe(false);
    expect(first.container.querySelector('details[data-section="agent"] h2')?.textContent).toBe("Agent");
  });

  test("a pairing link opens it", () => {
    const first = mount(<Rail />);
    act(() => { first.ui.revealAgent(); });
    expect(first.container.querySelector('details[data-section="agent"]')?.hasAttribute("open")).toBe(true);
  });
});

describe("the top bar badge", () => {
  test("it is not there while the switch is off", () => {
    const { container } = mount(<TopBar />);
    expect(container.querySelector(".agent-badge")).toBeNull();
  });

  test("while on it names the state and opens a native popover that turns agent control off", async () => {
    const { container, agent, runtime, sockets, store } = mount(<TopBar />);
    act(() => { agent.pair(DEFAULT_PORT, TOKEN); agent.enable(); });
    expect(container.querySelector(".agent-badge")?.textContent).toBe("Agent starting");
    runtime.loaded();
    await act(tick);
    act(() => { sockets.last.welcome(); });

    const badge = container.querySelector(".agent-badge");
    const menu = container.querySelector(".agent-menu");
    expect(badge?.textContent).toBe("Agent connected");
    expect(menu?.getAttribute("popover")).toBe("auto");
    expect(badge?.getAttribute("popovertarget")).toBe(menu?.id);
    expect(menu?.textContent).toContain("Connected. An agent can control this tab");
    expect(menu?.textContent).not.toContain("Stop script");

    const off = button(container, "Turn off agent control");
    expect(off.getAttribute("popovertarget")).toBe(menu?.id);
    expect(off.getAttribute("popovertargetaction")).toBe("hide");
    act(() => { off.click(); });
    expect(agent.settings.enabled).toBe(false);
    expect(JSON.parse(store.get("booth.agent") ?? "{}")).toMatchObject({ enabled: false });
    expect(container.querySelector(".agent-badge")).toBeNull();
  });

  test("while a script runs the badge says so and its popover offers Stop script", async () => {
    const { container, agent, runtime, sockets } = mount(<TopBar />);
    act(() => { agent.pair(DEFAULT_PORT, TOKEN); agent.enable(); });
    runtime.loaded();
    await act(tick);
    act(() => { sockets.last.welcome(); });
    act(() => { sockets.last.say({ run: { job: "a1" as JobId, code: "import bpy" } }); });
    act(() => { runtime.script.io.progress("rendering 42%", 0.42); });

    expect(container.querySelector(".agent-badge")?.textContent).toBe("Agent running");
    expect(container.querySelector(".agent-badge")?.hasAttribute("data-running")).toBe(true);
    expect(container.querySelector(".agent-running")?.textContent).toBe("Script running: rendering 42%");

    act(() => { button(container, "Stop script").click(); });
    expect(runtime.cancels).toEqual(["user"]);
    await act(tick);
    expect(container.querySelector(".agent-running")).toBeNull();
    expect(container.querySelector(".agent-badge")?.textContent).toBe("Agent connected");
  });
});
