import { useCallback, useEffect, useState } from "react";
import { useHost, useUi, type Host } from "./ui/hooks";
import { HostProvider } from "./ui/host";
import { Rail } from "./ui/Rail";
import { Stage } from "./ui/Stage";
import { StatusLine } from "./ui/StatusLine";
import { TopBar } from "./ui/TopBar";

const ACCEPTED = /\.(stl|gcode|3mf)$/i;

/** True while a file is being dragged over the window. Dropping anywhere opens it. */
function useFileDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const carriesFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes("Files") === true;
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      const file = files.find((f) => ACCEPTED.test(f.name)) ?? files[0];
      if (file !== undefined) onFile(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFile]);

  return dragging;
}

function Shell({ canvas }: { canvas: HTMLCanvasElement }) {
  const { booth, ui } = useHost();
  const { focusTool, missingPart } = useUi();
  const open = useCallback((file: File) => { void booth.open(file); }, [booth]);
  const dragging = useFileDrop(open);

  useEffect(() => {
    if (!focusTool && missingPart === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (focusTool) ui.setFocusTool(false);
      else if (missingPart !== null) ui.setMissingPart(null);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [focusTool, missingPart, ui]);

  return (
    <div className="app">
      <TopBar />
      <Stage canvas={canvas} />
      <Rail />
      <StatusLine />
      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <p>Drop to open</p>
        </div>
      ) : null}
    </div>
  );
}

export default function App({ host, canvas }: { host: Host; canvas: HTMLCanvasElement }) {
  return (
    <HostProvider host={host}>
      <Shell canvas={canvas} />
    </HostProvider>
  );
}
