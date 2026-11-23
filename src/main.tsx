import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AgentControl } from "./agent/agent";
import { parsePairingHash } from "./agent/protocol";
import App from "./App";
import { Booth } from "./booth";
import "./index.css";
import { createBrowserPartCache } from "./part-cache";
import type { RenderStats } from "./photo/cycles-worker";
import { PrintPipeline } from "./print";
import { decodeShareHash, encodeShareHash, isDefaultDocument, isShareHash } from "./share";
import { PhotoSession } from "./ui/photo-session";
import { Ui } from "./ui/store";
import { agentControl, connectPhotos, connectViewport, photoDesk, viewportEvents } from "./ui/wire";
import { Viewport } from "./viewport/viewport";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

const ui = new Ui();
const canvas = document.createElement("canvas");

const booth = new Booth({
  storage: localStorage,
  partCache: createBrowserPartCache(),
  print: new PrintPipeline(() => new Worker(new URL("./print/worker.ts", import.meta.url), { type: "module" })),
  takePhoto: (scene, partName) => desk.take(scene, partName),
});
const photos = new PhotoSession((sceneId) => booth.takePhoto(sceneId), undefined, () => booth.activeSceneId);
connectPhotos(booth, photos);

async function startViewport(): Promise<Viewport | null> {
  try {
    return await Viewport.create(canvas, viewportEvents(booth, ui));
  } catch (e) {
    ui.setNotice(`The preview could not start. ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// The raster engine renders on the preview's renderer, so the desk is built once the preview exists.
// Nothing can press PHOTO before the render below, so `desk` is set by then.
const viewport = await startViewport();
const cyclesStats: RenderStats[] = [];
const desk = photoDesk(viewport, undefined, import.meta.env.DEV ? { onStats: (s) => { cyclesStats.push(s); } } : {});
if (viewport !== null) connectViewport(booth, ui, viewport);

const agent = agentControl({ booth, photos, viewport, storage: localStorage });

// A pairing link fills the port and token and opens the Agent section. The user's own click on the switch is the opt-in.
const pairing = parsePairingHash(location.hash);
if (pairing !== null) {
  agent.pair(pairing.port, pairing.token);
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  ui.revealAgent();
}

let applyingHash = false;
async function applyShareFromLocation(): Promise<void> {
  if (!isShareHash(location.hash)) return;
  applyingHash = true;
  try {
    const state = await decodeShareHash(location.hash);
    if (state === null) return;
    const outcome = await booth.loadShared(state);
    if (outcome.partStatus === "missing") {
      ui.setMissingPart({
        name: outcome.missingName ?? null,
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
      });
      ui.setNotice(null);
    } else {
      ui.setMissingPart(null);
      ui.setNotice(null);
    }
  } catch (e) {
    ui.setMissingPart(null);
    ui.setNotice(`Could not open the shared link. ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    applyingHash = false;
  }
}

await applyShareFromLocation();
window.addEventListener("hashchange", () => { void applyShareFromLocation(); });

// Auto-dismiss the "please drop XXX.stl" popup as soon as the user opens a file.
let lastPrint = booth.print;
booth.subscribe(() => {
  if (booth.print !== lastPrint) {
    lastPrint = booth.print;
    if (ui.state.get().missingPart !== null && (booth.print.status === "loading" || booth.print.status === "ready")) {
      ui.setMissingPart(null);
    }
  }
});

// Keep the URL hash synced with the live setup (debounced) so the address bar is always shareable.
let hashTimer: ReturnType<typeof setTimeout> | null = null;
let lastDoc = booth.doc;
let lastPartKey = JSON.stringify(booth.partMeta);
const scheduleHashSync = () => {
  if (applyingHash) return;
  const doc = booth.doc;
  const partMeta = booth.partMeta;
  const partKey = JSON.stringify(partMeta);
  if (doc === lastDoc && partKey === lastPartKey) return;
  lastDoc = doc;
  lastPartKey = partKey;
  if (hashTimer !== null) clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    hashTimer = null;
    if (applyingHash) return;
    if (isDefaultDocument(booth.doc) && booth.partMeta === null) {
      if (isShareHash(location.hash)) history.replaceState(null, "", `${location.pathname}${location.search}`);
      return;
    }
    void encodeShareHash(booth.doc, booth.partMeta).then((hash) => {
      if (!applyingHash && location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
    }, () => {});
  }, 500);
};
booth.subscribe(scheduleHashSync);

declare global {
  interface Window {
    /** Development builds only: the live parts, for tools/e2e/drive.ts to read state and measure. */
    boothDev?: {
      readonly booth: Booth; readonly viewport: Viewport | null; readonly ui: Ui; readonly photos: PhotoSession; readonly agent: AgentControl;
      /** One entry per finished Cycles render. */
      readonly cyclesStats: readonly RenderStats[];
    };
  }
}
if (import.meta.env.DEV) window.boothDev = { booth, viewport, ui, photos, agent, cyclesStats };

createRoot(root).render(
  <StrictMode>
    <App host={{ booth, ui, photos, agent }} canvas={canvas} />
  </StrictMode>,
);

// Saving is debounced, so a closing tab writes what is pending.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") booth.flush();
});
