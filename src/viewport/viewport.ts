/**
 * viewport.ts: the live preview. three.js on WebGPU, WebGL2 as fallback.
 *
 * It owns everything ephemeral: the renderer, the pipelines (TRAA while
 * moving, a supersampled still after), the quality ladder and lite mesh
 * swap, the reflection bake and the crop frame. It owns no document state:
 * `show` could be called with the same scene forever and nothing would move.
 *
 * Frame rule: a Scene is Blender Z-up. This scene graph has one root group
 * with BLENDER_TO_VIEWER applied, holding part, sweep and light helpers.
 * That matrix is the only axis swap in the app.
 *
 * The preview approximates Cycles. Every shortcut is listed in
 * PREVIEW_APPROXIMATIONS so parity work argues from a list.
 */
import type { CameraSetup } from "../document";
import type { RadianceFrame } from "../film";
import type { BeadMesh } from "../print";
import type { Scene } from "../scene";

export const PREVIEW_APPROXIMATIONS = [
  "the part is lit by a cube map baked from emissive quads, not by shadowed direct light",
  "the backdrop is lit by RectAreaLights in the bake plus one live shadow-casting key",
  "a spread under 180 degrees boosts baked radiance by 1 / sin^2(spread / 2); the live key ignores spread",
  "GTAO at radius 0.03 m stands in for contact shadowing and bounce light",
  "BAKE_GAIN scales the baked emitters to match the Cycles reference stills",
] as const;

export interface ViewportEvents {
  /** The user orbited or zoomed. Booth writes the numbers into the document. */
  onCameraEdited(camera: Pick<CameraSetup, "azimuth" | "elevation" | "distance" | "target">): void;
  /** A click with the focus tool: a part-local point. */
  onFocusPicked(partPoint: readonly [number, number, number]): void;
  /** Frame rate, quality level, refining. Display only. */
  onStatus(text: string): void;
}

export class Viewport {
  static create(canvas: HTMLCanvasElement, events: ViewportEvents): Promise<Viewport> {
    throw new Error("not implemented");
  }

  /**
   * Idempotent. Compares sections with `===`: new lights, backdrop or world
   * re-bake in the background while the stale bake stays up; a new material
   * updates uniforms and the layer texture; a new camera moves the controls
   * without echoing the same numbers back as an edit.
   */
  show(scene: Scene): void {
    throw new Error("not implemented");
  }

  /** The cheaper mesh shown only while moving on a slow GPU. Null clears it. */
  setLiteMesh(mesh: BeadMesh | null): void {
    throw new Error("not implemented");
  }

  setFocusTool(active: boolean): void {
    throw new Error("not implemented");
  }

  /**
   * The raster photo engine's lease on the renderer: pauses the live loop,
   * renders `scene` at its film size with jittered samples (pixel filter,
   * aperture, soft key), returns the linear accumulator, and restores the
   * live state even on abort.
   */
  accumulate(scene: Scene, onPass: (frame: RadianceFrame, fraction: number) => void, signal: AbortSignal): Promise<RadianceFrame> {
    throw new Error("not implemented");
  }

  dispose(): void {
    throw new Error("not implemented");
  }
}
