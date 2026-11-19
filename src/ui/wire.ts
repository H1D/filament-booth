/**
 * wire.ts: the connections between Booth, the viewport and the UI store.
 * main.tsx uses them with the real parts and dev/panels.tsx with stand-ins,
 * so the page the tests drive is wired the way the app is.
 */
import type { Booth } from "../booth";
import { m } from "../document";
import { focusAt } from "../edits";
import type { ViewportEvents } from "../viewport/viewport";
import type { Scene } from "../scene";
import type { Ui } from "./store";

/** What the app asks of a viewport. The real Viewport and the stand-in both have it. */
export interface ViewportLike {
  show(scene: Scene): void;
  setFocusTool(active: boolean): void;
}

/** Orbiting and focus picks become document edits. A pick ends the focus tool, so the next click orbits again. */
export function viewportEvents(booth: Booth, ui: Ui): ViewportEvents {
  return {
    onCameraEdited: (camera) => {
      booth.update((draft) => { Object.assign(draft.camera, camera); });
    },
    onFocusPicked: (point) => {
      booth.update(focusAt([m(point[0]), m(point[1]), m(point[2])]));
      ui.setFocusTool(false);
    },
    onStatus: (text) => { ui.setViewportStatus(text); },
  };
}

/** Keeps a viewport showing the booth's scene and the focus tool. Returns the function that disconnects it. */
export function connectViewport(booth: Booth, ui: Ui, viewport: ViewportLike): () => void {
  viewport.show(booth.scene);
  viewport.setFocusTool(ui.state.get().focusTool);
  let focusTool = ui.state.get().focusTool;
  const stopBooth = booth.subscribe(() => { viewport.show(booth.scene); });
  const stopUi = ui.state.subscribe(() => {
    const next = ui.state.get().focusTool;
    if (next === focusTool) return;
    focusTool = next;
    viewport.setFocusTool(next);
  });
  return () => { stopBooth(); stopUi(); };
}
