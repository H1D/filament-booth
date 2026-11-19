/**
 * focus.ts: the focus tool. While it is on, a click on the part reports the
 * part-local point under it, and a small marker shows where the camera
 * focuses: on the picked point while the scene's focus distance is that
 * point's depth, otherwise on the view axis at the focus distance.
 */
import { Vector2, type WebGPURenderer } from "three/webgpu";
import { transformPoint, type Scene } from "../scene";
import { pxPerMetreAt, type V3 } from "./frame";
import type { CameraRig } from "./orbit";
import type { Stage } from "./stage";

const CLICK_SLOP_PX = 4;
const FOCUS_MATCH_M = 1e-3;

export interface FocusHost {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly stage: Stage;
  readonly rig: CameraRig;
  onPicked(point: V3): void;
  /** True while clicks must not pick, as during a photo. */
  busy(): boolean;
}

export class FocusTool {
  active = false;
  #picked: V3 | null = null;
  readonly #host: FocusHost;
  readonly #stop: () => void;

  constructor(host: FocusHost) {
    this.#host = host;
    const canvas = host.canvas;
    let down: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => { down = e.button === 0 ? { x: e.offsetX, y: e.offsetY, id: e.pointerId } : null; };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || !this.active || host.busy() || d.id !== e.pointerId) return;
      if (Math.hypot(e.offsetX - d.x, e.offsetY - d.y) > CLICK_SLOP_PX) return;
      void this.#pickAt(e.offsetX, e.offsetY);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    this.#stop = () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }

  /** Puts the marker where the camera focuses in `scene`, or hides it while the tool is off. */
  place(scene: Scene | null): void {
    const { stage, rig, renderer, canvas } = this.#host;
    const cam = scene?.camera;
    if (!this.active || !scene || !cam) {
      stage.setMarker(null, 1);
      return;
    }
    const { position, forward } = rig.pose();
    const depthOf = (p: V3) => (p[0] - position[0]) * forward[0] + (p[1] - position[1]) * forward[1] + (p[2] - position[2]) * forward[2];
    const picked = this.#picked && scene.part ? transformPoint(scene.part.toWorld, this.#picked) : null;
    const f = cam.focusDistanceM;
    const point: V3 = picked && Math.abs(depthOf(picked) - f) < FOCUS_MATCH_M
      ? picked
      : [position[0] + forward[0] * f, position[1] + forward[1] * f, position[2] + forward[2] * f];
    const size = renderer.getDrawingBufferSize(new Vector2());
    const cssPerPx = Math.max(1, canvas.clientHeight) / size.y;
    stage.setMarker(point, pxPerMetreAt(depthOf(point), (rig.camera.fov * Math.PI) / 180, size.y) * cssPerPx);
  }

  dispose(): void {
    this.#stop();
  }

  async #pickAt(cssX: number, cssY: number): Promise<void> {
    const { renderer, canvas, stage, rig } = this.#host;
    const size = renderer.getDrawingBufferSize(new Vector2());
    const k = size.x / Math.max(1, canvas.clientWidth);
    const hit = await stage.pick(renderer, rig.camera, Math.floor(cssX * k), Math.floor(cssY * k), size.x, size.y);
    if (hit === null) return;
    this.#picked = hit;
    this.#host.onPicked(hit);
  }
}
