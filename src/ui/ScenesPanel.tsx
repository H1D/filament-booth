import { useState } from "react";
import { downloadAs } from "./download";
import { describeError, useHost, usePhotoSession, usePrint, useScenes } from "./hooks";
import { Icon } from "./icons";
import { uniqueNames, zipStored } from "./zip";

/**
 * Scenes: whole setups for the one part, each with its own lights, camera,
 * props and output. One is on show and every control edits it. "Render all"
 * queues a photo of every scene, and "Download all" saves the newest photo of
 * each in one ZIP.
 */
export function ScenesPanel() {
  const { booth, photos, ui } = useHost();
  const { scenes, activeId } = useScenes();
  const { run, byScene, queued, sceneId: rendering, batchSize } = usePhotoSession();
  const print = usePrint();
  const [saving, setSaving] = useState(false);
  const hasPart = print.status === "ready" || (print.status === "error" && print.loaded !== null);
  const running = run.phase === "running";
  const active = scenes.find((s) => s.id === activeId);
  const photographed = scenes.filter((s) => byScene.has(s.id));
  const queuePosition = batchSize - queued.length;

  const attempt = (action: () => void) => {
    try {
      action();
      ui.setNotice(null);
    } catch (e) {
      ui.setNotice(describeError(e));
    }
  };

  const downloadAll = async () => {
    setSaving(true);
    try {
      const shots = photographed.flatMap((s) => { const p = byScene.get(s.id); return p === undefined ? [] : [p]; });
      const names = uniqueNames(shots.map((p) => p.fileName));
      const zip = await zipStored(shots.map((p, i) => ({ name: names[i], data: p.png })));
      downloadAs(`${booth.partName ?? "photos"} scenes.zip`, zip);
    } catch (e) {
      ui.setNotice(`Could not save the photos. ${describeError(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ul className="scenes" aria-label="Scenes">
        {scenes.map((scene, i) => {
          const state = scene.id === rendering ? "rendering"
            : queued.includes(scene.id) ? "queued"
              : byScene.has(scene.id) ? "photo" : null;
          return (
            <li key={scene.id}>
              <button type="button" className="btn scene" aria-pressed={scene.id === activeId}
                onClick={() => { attempt(() => { booth.switchScene(scene.id); }); }}>
                <span className="scene-index" aria-hidden="true">{i + 1}</span>
                <span className="scene-name">{scene.name}</span>
                {state === null ? null : (
                  <span className="tag" data-tone={state === "photo" ? undefined : "accent"} data-state={state}>
                    {state === "photo" ? "photo" : state === "queued" ? "queued" : "rendering"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {active === undefined ? null : (
        <div className="row">
          <label className="row-label" htmlFor="scene-name">Name</label>
          {/* Keyed by scene, so switching scenes resets the draft. A refused name stays in the box with the notice. */}
          <input key={active.id} id="scene-name" type="text" className="text" spellCheck={false} defaultValue={active.name} maxLength={60}
            onBlur={(e) => { if (e.target.value !== active.name) attempt(() => { booth.renameScene(active.id, e.target.value); }); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn add-scene" onClick={() => { attempt(() => { booth.addScene(); }); }}
          title="A copy of this scene, to change from here">
          <Icon name="plus" />Add scene
        </button>
        <button type="button" className="btn quiet danger remove-scene" disabled={scenes.length === 1}
          onClick={() => { attempt(() => { booth.removeScene(activeId); }); }}>
          <Icon name="remove" />Remove
        </button>
      </div>

      <div className="actions">
        <button type="button" className="btn render-all" disabled={!hasPart || running}
          title={!hasPart ? "Open a part first" : running ? "A photo is rendering" : "Render a photo of every scene, one after another"}
          onClick={() => { photos.takeAll(scenes.map((s) => s.id)); }}>
          <Icon name="camera" />Render all
        </button>
        <button type="button" className="btn download-all" disabled={photographed.length === 0 || saving}
          onClick={() => { void downloadAll(); }}>
          <Icon name="save" />Download all{photographed.length > 0 ? ` (${photographed.length})` : ""}
        </button>
      </div>
      {batchSize > 0 && running
        ? <p className="note" role="status">Rendering scene {queuePosition} of {batchSize}. Cancel in the photo card stops the rest.</p>
        : <p className="note">Each scene keeps its own lights, camera, props and output. Download all saves the newest photo of each scene in one ZIP.</p>}
    </>
  );
}
