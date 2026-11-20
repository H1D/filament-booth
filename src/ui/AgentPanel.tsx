/**
 * AgentPanel.tsx: the two places agent control shows. The rail section holds
 * the opt-in switch, the pairing fields and the privacy note. The top bar
 * badge exists only while the switch is on, so a connected agent is always
 * visible, and its popover has the two things to do about it: stop the script
 * and turn control off.
 *
 * Both read AgentControl through its store and act only through its methods.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { AgentState } from "../agent/agent";
import { AGENT_PROMPT, TOKEN_PATTERN, bridgeCommand } from "../agent/protocol";
import { Fold, Note, Switch } from "./controls";
import { useAgent, useHost, useUi } from "./hooks";

/** Chrome sets this while DevTools automation (Playwright, Puppeteer, the chrome-devtools MCP) drives the tab. */
const automated = (): boolean => typeof navigator !== "undefined" && navigator.webdriver === true;

const PRIVACY =
  "A connected agent can change every setting, open files from the folder it runs in on this computer and save photos to it. " +
  "This page connects only to 127.0.0.1, so nothing leaves this computer. Turn the switch off to disconnect.";

/** The status as one line, for the rail and for the badge's popover. */
function statusText({ settings, status }: AgentState): string {
  switch (status.kind) {
    case "off":
      return TOKEN_PATTERN.test(settings.token) ? "Off. Run the command below, then turn the switch on" : "Off. Enter a token of 8 to 128 letters, digits, - or _ under Port and token";
    case "starting": return "Starting Python…";
    case "waiting": return `Waiting for the bridge on port ${settings.port}`;
    case "connected": return "Connected. An agent can control this tab";
    case "refused": return `Refused: ${status.reason}`;
    case "unavailable": return `Unavailable: ${status.reason}`;
  }
}

const tone = (state: AgentState): "accent" | "warn" | undefined => {
  switch (state.status.kind) {
    case "connected": return "accent";
    case "refused":
    case "unavailable": return "warn";
    default: return undefined;
  }
};

/** Text to paste somewhere else, the bridge command or the prompt, and a button that copies it. */
function Copyable({ text, kind }: { text: string; kind: "command" | "prompt" }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => { setCopied(false); }, 1500);
    return () => { clearTimeout(timer); };
  }, [copied]);
  return (
    <div className={`agent-${kind}`}>
      {kind === "command" ? <code>{text}</code> : <p>{text}</p>}
      <button type="button" className="btn" aria-label={`Copy ${kind}`} onClick={() => {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); }, () => {});
      }}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** A text field that applies its value on Enter or blur, as the number fields do, so a half-typed port never dials. */
function Field({ label, value, onCommit, secret, numeric }: {
  label: string; value: string; onCommit: (value: string) => void; secret?: boolean; numeric?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    onCommit(draft);
  };
  return (
    <div className="row">
      <label className="row-label" htmlFor={id}>{label}</label>
      <input id={id} className="text" type={secret === true ? "password" : "text"} inputMode={numeric === true ? "numeric" : undefined}
        autoComplete="off" spellCheck={false} value={draft ?? value}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setDraft(null);
        }} />
    </div>
  );
}

export function AgentPanel() {
  const { agent } = useHost();
  const state = useAgent();
  const { showAgent } = useUi();
  const top = useRef<HTMLDivElement>(null);
  const { settings, status } = state;
  const cannotRun = status.kind === "unavailable" && !settings.enabled;
  const needsToken = !settings.enabled && !TOKEN_PATTERN.test(settings.token);

  useEffect(() => {
    if (showAgent) top.current?.scrollIntoView({ block: "nearest" });
  }, [showAgent]);

  return (
    <div className="agent" ref={top}>
      <Switch label="Allow a local agent to control this tab" checked={settings.enabled} disabled={cannotRun || needsToken}
        hint={needsToken ? "Enter a token under Port and token first" : undefined}
        onChange={(on) => { if (on) agent.enable(); else agent.disable(); }} />
      <p className="agent-status" role="status" data-status={status.kind} data-tone={tone(state)}>{statusText(state)}</p>
      {!TOKEN_PATTERN.test(settings.token) ? null : (
        <>
          <Copyable kind="command" text={bridgeCommand({ port: settings.port, token: settings.token, origin: location.origin })} />
          <Note>Run it once in a terminal, then start a new Claude Code session in any folder. A session that was already running does not see the new server. Scripts can read and write the folder the session runs in. It needs Node.js. If booth was added before, run <code>claude mcp remove booth</code> first. When Chrome asks to let this site reach devices on your local network, allow it: the bridge runs on this computer. For another agent, add an MCP server that runs the part after <code>--</code>.</Note>
          <Note>Then ask the agent with this prompt, with your request in place of the part in angle brackets:</Note>
          <Copyable kind="prompt" text={AGENT_PROMPT} />
        </>
      )}
      {automated() ? (
        <Note tone="warn">Browser automation is driving this tab right now. Chrome shows this as "controlled by automated test software". It goes around this switch, which covers only the bridge.</Note>
      ) : null}
      <Fold title="Port and token">
        <Field label="Port" numeric value={String(settings.port)} onCommit={(text) => { agent.setPort(Number(text.trim())); }} />
        <Field label="Token" secret value={settings.token} onCommit={(text) => { agent.setToken(text); }} />
      </Fold>
      <Note>{PRIVACY}</Note>
    </div>
  );
}

const badgeWord = ({ status, running }: AgentState): string => {
  if (running !== null) return "running";
  switch (status.kind) {
    case "starting": return "starting";
    case "waiting": return "waiting";
    case "connected": return "connected";
    case "refused": return "refused";
    case "unavailable": return "unavailable";
    case "off": return "off";
  }
};

/** Shown while the switch is on. Its popover is the native one, anchored under the badge. */
export function AgentBadge() {
  const { agent } = useHost();
  const state = useAgent();
  const menu = useId();
  const { settings, status, running } = state;
  if (!settings.enabled) return null;

  return (
    <>
      <button type="button" className="btn agent-badge" popoverTarget={menu} popoverTargetAction="toggle"
        data-status={status.kind} data-running={running !== null || undefined}>
        <span className="dot" aria-hidden="true" />Agent {badgeWord(state)}
      </button>
      <div id={menu} popover="auto" className="agent-menu" role="dialog" aria-label="Agent control">
        <p className="agent-status" data-status={status.kind} data-tone={tone(state)}>{statusText(state)}</p>
        {running === null ? null : <p className="agent-running">Script running{running.progress === null ? "" : `: ${running.progress}`}</p>}
        <div className="actions">
          {running === null ? null : (
            <button type="button" className="btn" popoverTarget={menu} popoverTargetAction="hide" onClick={() => { agent.stopScript(); }}>
              Stop script
            </button>
          )}
          <button type="button" className="btn danger" popoverTarget={menu} popoverTargetAction="hide" onClick={() => { agent.disable(); }}>
            Turn off agent control
          </button>
        </div>
      </div>
    </>
  );
}
