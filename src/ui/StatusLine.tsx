import { useHost, usePrint, useScene, useUi } from "./host";
import { sourceName, stageLabel } from "./model";

/** One line at the foot of the window: what the booth is doing, then what the viewport says, then the film size. */
export function StatusLine() {
  const { ui } = useHost();
  const print = usePrint();
  const scene = useScene();
  const state = useUi();

  const what = (() => {
    switch (print.status) {
      case "empty": return "No part open";
      case "loading": return `${stageLabel(print.stage)}, ${sourceName(print.source)}`;
      case "ready": return `${sourceName(print.loaded.source)} ready`;
      case "error": return print.message;
    }
  })();

  return (
    <footer className="statusline" role="status" aria-live="polite">
      <span className="status-main" data-tone={print.status === "error" ? "warn" : undefined}>{what}</span>
      {state.notice === null ? null : (
        <span className="status-notice" data-tone="warn">
          {state.notice}
          <button type="button" className="link" onClick={() => { ui.setNotice(null); }}>Dismiss</button>
        </span>
      )}
      <span className="spacer" />
      {state.viewportStatus === "" ? null : <span className="status-viewport">{state.viewportStatus}</span>}
      <span className="status-film">{scene.film.width} by {scene.film.height} px, {scene.film.samples} samples</span>
    </footer>
  );
}
