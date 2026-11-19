import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Booth } from "./booth";
import "./index.css";
import { PhotoDesk, type PhotoEngine } from "./photo/photo";
import { PrintPipeline } from "./print";
import { PhotoSession } from "./ui/photo-session";
import { Ui } from "./ui/store";
import { connectViewport, viewportEvents } from "./ui/wire";
import { Viewport } from "./viewport/viewport";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

const ui = new Ui();
const canvas = document.createElement("canvas");
let viewport: Viewport | null = null;

/** Renders on the live viewport's renderer, so it is only ready once the viewport exists. */
const raster: PhotoEngine = {
  id: "raster",
  fits: async () => (viewport === null ? { reason: "The preview is not running" } : true),
  render: (scene, onPass, signal) =>
    viewport === null ? Promise.reject(new Error("The preview is not running")) : viewport.accumulate(scene, onPass, signal),
};
const desk = new PhotoDesk([raster]);

const booth = new Booth({
  storage: localStorage,
  print: new PrintPipeline(() => new Worker(new URL("./print/worker.ts", import.meta.url), { type: "module" })),
  takePhoto: (scene, partName) => desk.take(scene, partName),
});
const photos = new PhotoSession(() => booth.takePhoto());

createRoot(root).render(
  <StrictMode>
    <App host={{ booth, ui, photos }} canvas={canvas} />
  </StrictMode>,
);

Viewport.create(canvas, viewportEvents(booth, ui)).then(
  (created) => {
    viewport = created;
    connectViewport(booth, ui, created);
  },
  (e: unknown) => {
    ui.setNotice(`The preview could not start. ${e instanceof Error ? e.message : String(e)}`);
  },
);

// Saving is debounced, so a closing tab writes what is pending.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") booth.flush();
});
