import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AgentControl } from "./agent/agent";
import { parsePairingHash } from "./agent/protocol";
import App from "./App";
import { Booth } from "./booth";
import "./index.css";
import type { RenderStats } from "./photo/cycles-worker";
import { PrintPipeline } from "./print";
import { PhotoSession } from "./ui/photo-session";
import { Ui } from "./ui/store";
import { agentControl, connectViewport, photoDesk, viewportEvents } from "./ui/wire";
import { Viewport } from "./viewport/viewport";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

const ui = new Ui();
const canvas = document.createElement("canvas");

const booth = new Booth({
  storage: localStorage,
  print: new PrintPipeline(() => new Worker(new URL("./print/worker.ts", import.meta.url), { type: "module" })),
  takePhoto: (scene, partName) => desk.take(scene, partName),
});
const photos = new PhotoSession(() => booth.takePhoto());

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
