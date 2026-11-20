/**
 * The booth's own shell and panels, wired as main.tsx wires them, but with a
 * fake print port, a fake photo run and a stand-in viewport. Open it with
 * `bun run dev` at /dev/panels.html. tools/ui/drive.ts drives this page.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { Booth } from "../src/booth";
import "../src/index.css";
import { PhotoSession } from "../src/ui/photo-session";
import { Ui } from "../src/ui/store";
import { agentControl, connectViewport, viewportEvents } from "../src/ui/wire";
import { FakePrint, StandInViewport, fakeTakePhoto, type StandInReadout } from "./fakes";

declare global {
  interface Window {
    /** The stand-in's last readout, for a test to read. */
    standIn: () => StandInReadout | null;
  }
}

const root = document.getElementById("root");
if (root === null) throw new Error("panels.html has no #root");

const ui = new Ui();
const canvas = document.createElement("canvas");
const booth = new Booth({ storage: localStorage, print: new FakePrint(), takePhoto: fakeTakePhoto });
const photos = new PhotoSession((sceneId) => booth.takePhoto(sceneId), undefined, () => booth.activeSceneId);
const agent = agentControl({ booth, photos, viewport: null, storage: localStorage });
const standIn = new StandInViewport(canvas, viewportEvents(booth, ui));
connectViewport(booth, ui, standIn);
window.standIn = () => standIn.readout;

createRoot(root).render(
  <StrictMode>
    <App host={{ booth, ui, photos, agent }} canvas={canvas} />
  </StrictMode>,
);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") booth.flush();
});
window.addEventListener("pagehide", () => { booth.flush(); });
