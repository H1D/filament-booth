import { useId, useRef, useState } from "react";
import { defaultDocument } from "../document";
import { framePart } from "../scene";
import { encodeShareUrl } from "../share";
import { downloadAs } from "./download";
import { describeError, useEdit, useHost } from "./hooks";
import { Icon } from "./icons";

const SETUP_FILE = "booth-setup.json";

export function SetupPanel() {
  const { booth, ui } = useHost();
  const edit = useEdit();
  const input = useRef<HTMLInputElement>(null);
  const confirm = useRef<HTMLDivElement>(null);
  const confirmId = useId();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      const base = `${location.origin}${location.pathname}`;
      const url = await encodeShareUrl(base, booth.doc, booth.partMeta);
      history.replaceState(null, "", new URL(url).hash);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1800);
      ui.setNotice(null);
    } catch (e) {
      ui.setNotice(`Could not copy share link. ${describeError(e)}`);
    }
  };

  const importFile = async (file: File) => {
    try {
      booth.importJson(await file.text());
      ui.setNotice(null);
    } catch (e) {
      ui.setNotice(`Could not import ${file.name}. ${describeError(e)}`);
    }
  };

  /** Defaults for every setting. The open part is framed again, since the default camera knows nothing about its size. */
  const resetAll = () => {
    const mesh = booth.scene.part?.mesh ?? null;
    edit((draft) => {
      Object.assign(draft, defaultDocument());
      if (mesh !== null) Object.assign(draft.camera, framePart(mesh, draft.camera, draft.output.aspect));
    });
    confirm.current?.hidePopover();
  };

  return (
    <>
      <div className="actions">
        <button type="button" className="btn" onClick={() => { void copyLink(); }}>
          <Icon name="link" />{copied ? "Copied link" : "Copy link"}
        </button>
        <button type="button" className="btn" onClick={() => { downloadAs(SETUP_FILE, new Blob([booth.exportJson()], { type: "application/json" })); }}>
          <Icon name="save" />Export JSON
        </button>
        <button type="button" className="btn" onClick={() => { input.current?.click(); }}>
          <Icon name="upload" />Import JSON
        </button>
        <input ref={input} type="file" accept="application/json,.json" hidden aria-label="Import a setup file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file !== undefined) void importFile(file);
          }} />
      </div>
      <p className="note">Every setting encodes into the URL hash for sharing and saves in this browser. Big 3D models stay in this browser's local cache; on another machine, drop the model file to keep the link's exact camera.</p>
      <div className="actions">
        <button type="button" className="btn danger reset-all" popoverTarget={confirmId} popoverTargetAction="toggle">
          Reset everything
        </button>
      </div>
      <div id={confirmId} ref={confirm} popover="auto" className="confirm" role="alertdialog" aria-label="Reset everything">
        <p>Put every setting back to its default? The open part stays.</p>
        <div className="actions">
          <button type="button" className="btn" popoverTarget={confirmId} popoverTargetAction="hide">Keep my settings</button>
          <button type="button" className="btn primary" onClick={resetAll}>Reset everything</button>
        </div>
      </div>
    </>
  );
}
