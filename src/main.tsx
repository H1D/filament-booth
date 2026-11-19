import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Booth } from "./booth";
import "./index.css";
import { PrintPipeline } from "./print";
import { PhotoSession } from "./ui/photo-session";
import { Ui } from "./ui/store";
import { connectViewport, photoDesk, viewportEvents } from "./ui/wire";
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
const desk = photoDesk(viewport);
if (viewport !== null) connectViewport(booth, ui, viewport);

createRoot(root).render(
  <StrictMode>
    <App host={{ booth, ui, photos }} canvas={canvas} />
  </StrictMode>,
);

// Saving is debounced, so a closing tab writes what is pending.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") booth.flush();
});
