import { useRef } from "react";
import { LOOK_IDS } from "../document";
import { applyLook } from "../edits";
import { LOOK_PRESETS } from "../presets";
import { AgentBadge } from "./AgentPanel";
import { useDoc, useEdit, useHost, useLookModified, usePhotoSession, usePrint } from "./hooks";
import { Icon, Mark } from "./icons";

export const ACCEPTED_FILES = ".stl,.gcode,.3mf";

export function TopBar() {
  const { booth, photos } = useHost();
  const doc = useDoc();
  const print = usePrint();
  const edit = useEdit();
  const modified = useLookModified();
  const { run } = usePhotoSession();
  const picker = useRef<HTMLInputElement>(null);
  const hasPart = print.status === "ready" || (print.status === "error" && print.loaded !== null);
  const rendering = run.phase === "running";

  return (
    <header className="topbar">
      <div className="brand"><Mark /><span>Filament Booth</span></div>

      <button type="button" className="btn" onClick={() => { picker.current?.click(); }}>
        <Icon name="open" />Open file
      </button>
      <input ref={picker} type="file" accept={ACCEPTED_FILES} hidden aria-label="Open an STL or G-code file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file !== undefined) void booth.open(file);
        }} />

      <div className="look-pick">
        <label htmlFor="look-select">Look</label>
        <select id="look-select" value={doc.lookBase ?? ""}
          onChange={(e) => {
            const id = LOOK_IDS.find((l) => l === e.target.value);
            if (id !== undefined) edit(applyLook(id));
          }}>
          {doc.lookBase === null ? <option value="" disabled>Custom</option> : null}
          {LOOK_IDS.map((id) => <option key={id} value={id}>{LOOK_PRESETS[id].label}</option>)}
        </select>
        {modified ? <span className="tag" data-tone="accent" title="The studio no longer matches this look">modified</span> : null}
      </div>

      <div className="spacer" />

      <AgentBadge />

      <button type="button" className="photo" disabled={!hasPart || rendering}
        title={!hasPart ? "Open a part first" : rendering ? "A photo is rendering" : "Render a photo of what the preview shows"}
        onClick={() => { photos.take(); }}>
        <Icon name="camera" />PHOTO
      </button>
    </header>
  );
}
