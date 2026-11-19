import { useEffect, useRef } from "react";
import { PhotoCard } from "./PhotoCard";
import { useHost, usePrint, useScene, useUi } from "./host";
import { Icon } from "./icons";
import { sourceName, stageLabel } from "./model";
import { ACCEPTED_FILES } from "./TopBar";

/**
 * The preview and everything laid over it. The canvas belongs to whoever
 * made it (the viewport, or a stand-in): this only gives it a place.
 */
export function Stage({ canvas }: { canvas: HTMLCanvasElement }) {
  const { booth, ui } = useHost();
  const print = usePrint();
  const scene = useScene();
  const state = useUi();
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Studio preview of the part");
    slot.current?.append(canvas);
    return () => { canvas.remove(); };
  }, [canvas]);

  const picker = useRef<HTMLInputElement>(null);
  const showError = print.status === "error" && state.dismissedPrint !== print;
  const loading = print.status === "loading" ? print : null;

  return (
    <main className="stage" aria-label="Preview" data-focus-tool={state.focusTool || undefined}>
      <div className="canvas-slot" ref={slot} />

      {print.status === "empty" ? (
        <div className="empty">
          <div className="empty-card">
            <Icon name="upload" />
            <h2>Drop a print to photograph it</h2>
            <p>An <b>.stl</b> is sliced here with the settings on the right. A <b>.gcode</b> or <b>.gcode.3mf</b> keeps the slicing it was made with.</p>
            <button type="button" className="btn primary" onClick={() => { picker.current?.click(); }}>Choose a file</button>
            <input ref={picker} type="file" accept={ACCEPTED_FILES} hidden aria-label="Choose an STL or G-code file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file !== undefined) void booth.open(file);
              }} />
          </div>
        </div>
      ) : null}

      <div className="overlays">
        {loading !== null ? (
          <div className="pill" role="status">
            <span className="busy-bar" aria-hidden="true" />
            <span>{sourceName(loading.source)}: {scene.part !== null && loading.stage === "slicing" ? "re-slicing" : stageLabel(loading.stage).toLowerCase()}</span>
          </div>
        ) : null}
        {showError ? (
          <div className="banner" role="alert">
            <p>
              <b>{print.loaded === null ? "Could not open the file." : "That did not work."}</b> {print.message}
              {print.loaded === null ? "" : " The last part is still on show."}
            </p>
            <button type="button" className="icon-btn" aria-label="Dismiss the error" title="Dismiss" onClick={() => { ui.dismissPrintError(print); }}>
              <Icon name="close" />
            </button>
          </div>
        ) : null}
        {state.focusTool ? <div className="pill" role="status">Click the part to focus on a point. Escape cancels.</div> : null}
      </div>

      <PhotoCard />
    </main>
  );
}
