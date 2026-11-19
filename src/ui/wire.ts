/**
 * wire.ts: the connections between Booth, the viewport and the UI store.
 * main.tsx uses them with the real parts and dev/panels.tsx with stand-ins,
 * so the page the tests drive is wired the way the app is.
 */
import type { Booth } from "../booth";
import { m } from "../document";
import { focusAt } from "../edits";
import { cyclesEngine, type CyclesEngineOptions } from "../photo/cycles";
import { PhotoDesk, type PhotoTools } from "../photo/photo";
import { rasterEngine } from "../photo/raster";
import type { BeadMesh, LoadedPrint } from "../print";
import type { Viewport, ViewportEvents } from "../viewport/viewport";
import type { Scene } from "../scene";
import type { Ui } from "./store";

/** What the app asks of a viewport. The real Viewport and the stand-in both have it. */
export interface ViewportLike {
  show(scene: Scene): void;
  setFocusTool(active: boolean): void;
  /** The cheaper mesh of the part on show, for moving frames on a slow GPU. */
  setLiteMesh(mesh: BeadMesh | null): void;
}

/**
 * The photo desk: Cycles first, then the raster engine on the live preview's
 * renderer. Without a preview there is no raster engine, so a machine that
 * cannot run Cycles gets a failed photo that says why.
 */
export function photoDesk(viewport: Pick<Viewport, "accumulate"> | null, tools?: PhotoTools, cycles?: CyclesEngineOptions): PhotoDesk {
  return new PhotoDesk(viewport === null ? [cyclesEngine(cycles)] : [cyclesEngine(cycles), rasterEngine(viewport)], tools);
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

/**
 * Keeps a viewport showing the booth's scene, the lite mesh of the part on
 * show and the focus tool. Returns the function that disconnects it.
 */
export function connectViewport(booth: Booth, ui: Ui, viewport: ViewportLike): () => void {
  let liteAskedFor: LoadedPrint | null = null;
  const show = () => {
    const scene = booth.scene;
    viewport.show(scene);
    const p = booth.print;
    const loaded = p.status === "ready" || p.status === "error" ? p.loaded : null;
    if (loaded === null || loaded === liteAskedFor || loaded.mesh !== scene.part?.mesh) return;
    liteAskedFor = loaded;
    // A failed or superseded lite build costs only smooth motion on a slow GPU: the full mesh moves instead.
    loaded.liteMesh().then((lite) => { if (booth.scene.part?.mesh === loaded.mesh) viewport.setLiteMesh(lite); }, () => {});
  };
  show();
  viewport.setFocusTool(ui.state.get().focusTool);
  let focusTool = ui.state.get().focusTool;
  const stopBooth = booth.subscribe(show);
  const stopUi = ui.state.subscribe(() => {
    const next = ui.state.get().focusTool;
    if (next === focusTool) return;
    focusTool = next;
    viewport.setFocusTool(next);
  });
  return () => { stopBooth(); stopUi(); };
}
