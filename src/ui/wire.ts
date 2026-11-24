/**
 * wire.ts: the connections between Booth, the viewport and the UI store.
 * main.tsx uses them with the real parts and dev/panels.tsx with stand-ins,
 * so the page the tests drive is wired the way the app is.
 */
import { AgentControl } from "../agent/agent";
import { AgentHost, jpegThumbnail } from "../agent/host";
import { BOOTH_URL } from "../agent/protocol";
import { PythonRuntime, pythonUnavailable } from "../agent/python";
import type { Booth } from "../booth";
import { m } from "../document";
import { focusAt } from "../edits";
import { develop } from "../film";
import { cyclesEngine, type CyclesEngineOptions } from "../photo/cycles";
import { PhotoDesk, type PhotoTools } from "../photo/photo";
import { rasterEngine } from "../photo/raster";
import { webgpuEngine, type WebGpuEngineOptions } from "../photo/webgpu";
import type { BeadMesh, LoadedPrint } from "../print";
import type { Viewport, ViewportEvents } from "../viewport/viewport";
import type { Scene } from "../scene";
import { encodeShareUrl } from "../share";
import type { PhotoSession } from "./photo-session";
import type { Ui } from "./store";

/** What the app asks of a viewport. The real Viewport and the stand-in both have it. */
export interface ViewportLike {
  show(scene: Scene): void;
  setFocusTool(active: boolean): void;
  /** The cheaper mesh of the part on show, for moving frames on a slow GPU. */
  setLiteMesh(mesh: BeadMesh | null): void;
}

/**
 * The photo desk: WebGPU path tracer first, then Cycles, then the raster engine
 * on the live preview's renderer. Without a preview there is no raster engine,
 * so a machine that cannot run WebGPU or Cycles gets a failed photo that says why.
 */
export function photoDesk(viewport: Pick<Viewport, "accumulate"> | null, tools?: PhotoTools, cycles?: CyclesEngineOptions, webgpu?: WebGpuEngineOptions): PhotoDesk {
  return new PhotoDesk(viewport === null ? [webgpuEngine(webgpu), cyclesEngine(cycles)] : [webgpuEngine(webgpu), cyclesEngine(cycles), rasterEngine(viewport)], tools);
}

/**
 * Agent control over the real parts: the host that interprets bpy against the
 * booth, the Python worker, and the switch. The preview port is the raster
 * engine on the live preview, and null where the page has none. Nothing starts
 * until the user turns the switch on.
 */
export function agentControl(
  parts: {
    readonly booth: Booth;
    readonly photos: PhotoSession;
    readonly viewport: Pick<Viewport, "accumulate"> | null;
    readonly storage: Pick<Storage, "getItem" | "setItem">;
  },
): AgentControl {
  const { booth, photos, viewport, storage } = parts;
  const shareUrl = (partUrl?: string | null): Promise<string> => {
    const base = typeof location !== "undefined" && (location.protocol === "http:" || location.protocol === "https:")
      ? `${location.origin}${location.pathname}`
      : BOOTH_URL;
    const meta = booth.partMeta;
    const part = partUrl ? { ...(meta ?? {}), url: partUrl } : meta;
    return encodeShareUrl(base, booth.doc, part);
  };
  const host = new AgentHost({
    booth, photos, develop, thumbnail: jpegThumbnail,
    raster: viewport === null ? null : rasterEngine(viewport),
    shareUrl,
  });
  const runtime = new PythonRuntime(host, () => new Worker(new URL("../agent/py-worker.ts", import.meta.url), { type: "module" }));
  return new AgentControl({
    storage, runtime, unavailable: pythonUnavailable, pageId: crypto.randomUUID(),
    shareUrl: () => shareUrl(),
  });
}

/**
 * Keeps the photos Download all saves in step with the booth: a removed
 * scene's photo goes, and a different part (an open or a re-slice) drops them
 * all, since they show a part that is no longer there.
 */
export function connectPhotos(booth: Booth, photos: PhotoSession): () => void {
  let part = booth.scene.part?.mesh;
  return booth.subscribe(() => {
    const now = booth.scene.part?.mesh;
    photos.keepScenePhotos(now === part ? booth.scenes.map((s) => s.id) : []);
    part = now;
  });
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
