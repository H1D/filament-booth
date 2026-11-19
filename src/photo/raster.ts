/**
 * raster.ts: the photo engine that works wherever the preview works. It lends
 * the live viewport's renderer to the desk for the length of one photo, so the
 * preview is paused while a raster photo runs.
 */
import type { Viewport } from "../viewport/viewport";
import type { PhotoEngine } from "./photo";

export function rasterEngine(viewport: Pick<Viewport, "accumulate">): PhotoEngine {
  return {
    id: "raster",
    fits: async () => true,
    render: (scene, onPass, signal) => viewport.accumulate(scene, onPass, signal),
  };
}
