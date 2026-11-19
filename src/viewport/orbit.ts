/**
 * orbit.ts: the three.js camera and the OrbitControls that edit it.
 *
 * The scene's CameraSection is the truth. The controls are an editor for
 * its four orbit numbers: a user drag reports them in the document's
 * convention, and a scene that brings back numbers this rig reported is an
 * echo, which never moves the camera (a stale echo would yank a drag back).
 */
import { PerspectiveCamera, Vector3 } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CameraSection } from "../scene";
import type { JitterSample } from "./accumulate";
import { canvasFovY, fromViewer, orbitOf, pxPerMetreAt, sameOrbit, toViewer, type Crop, type Orbit } from "./frame";

const FAR_M = 60;
const MAX_ECHOES = 64;
const RAD = 180 / Math.PI;

export class CameraRig {
  readonly camera = new PerspectiveCamera(30, 1, 0.01, FAR_M);
  readonly controls: OrbitControls;
  #section: CameraSection | null = null;
  /** Orbits reported and not yet seen back in a scene, oldest first. */
  #echoes: Orbit[] = [];
  readonly #onEdit: (orbit: Orbit) => void;
  /** Where the camera rests while a jittered sample moves it over the lens. */
  readonly #rest = new Vector3();

  constructor(dom: HTMLElement, onEdit: (orbit: Orbit) => void, onChange: () => void) {
    this.#onEdit = onEdit;
    const c = new OrbitControls(this.camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.2; // three's 0.05 glides ~3.5 s after release (and TRAA smears all through it); 0.2: ~0.7 s
    // The document allows any elevation and distance; a tighter clamp would move a camera it shows.
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.minDistance = 0;
    c.maxDistance = 100;
    c.addEventListener("change", () => {
      onChange();
      this.#report();
    });
    this.controls = c;
  }

  get section(): CameraSection | null {
    return this.#section;
  }

  /** Moves to the scene's camera unless it is the camera already shown or an echo. True when it moved. */
  apply(section: CameraSection): boolean {
    this.#section = section;
    const orbit = orbitOf(section.position, section.target);
    const echo = this.#echoes.findIndex((o) => sameOrbit(o, orbit));
    if (echo >= 0) {
      this.#echoes.splice(0, echo + 1);
      return false;
    }
    this.#echoes = [];
    if (sameOrbit(this.#current(), orbit)) return false;
    this.camera.position.set(...toViewer(section.position));
    this.controls.target.set(...toViewer(section.target));
    this.controls.update();
    return true;
  }

  /** Exactly the scene's camera, echoes or not: a photo renders what its scene says. */
  hold(section: CameraSection): void {
    this.#section = section;
    this.#echoes = [];
    this.camera.position.set(...toViewer(section.position));
    this.controls.target.set(...toViewer(section.target));
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
  }

  /** Projection for the live canvas: the film's view fills the crop. */
  frameCanvas(width: number, height: number, crop: Crop): void {
    const s = this.#section;
    this.camera.aspect = width / height;
    if (s) {
      this.camera.fov = canvasFovY(s.fovYRad, height, crop) * RAD;
      this.camera.near = s.clipStartM;
    }
    this.camera.updateProjectionMatrix();
  }

  /** Projection for a photo: the film's own aspect and field of view. */
  frameFilm(section: CameraSection, width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.fov = section.fovYRad * RAD;
    this.camera.near = section.clipStartM;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Moves the camera for one supersampling sample: the pixel filter's offset
   * and, with `lens`, a point on the aperture with the frustum sheared so the
   * plane of focus stays put. `release` must follow before the controls update.
   */
  jitter(sample: JitterSample, widthPx: number, heightPx: number, lens: boolean): void {
    const cam = this.camera, s = this.#section;
    this.#rest.copy(cam.position);
    let sx = 0, sy = 0;
    if (lens && s && s.apertureRadiusM > 0) {
      cam.updateMatrixWorld();
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const lx = sample.lens[0] * s.apertureRadiusM, ly = sample.lens[1] * s.apertureRadiusM;
      cam.position.addScaledVector(right, lx).addScaledVector(up, ly);
      const pxPerM = pxPerMetreAt(s.focusDistanceM, (cam.fov / RAD), heightPx);
      sx = -lx * pxPerM;
      sy = ly * pxPerM;
    }
    cam.setViewOffset(widthPx, heightPx, sample.pixel[0] + sx, sample.pixel[1] + sy, widthPx, heightPx);
    cam.updateMatrixWorld();
  }

  release(): void {
    this.camera.clearViewOffset();
    this.camera.position.copy(this.#rest);
    this.camera.updateMatrixWorld();
  }

  /** Blender frame: the camera's position and its unit view direction. */
  pose(): { position: [number, number, number]; forward: [number, number, number] } {
    const d = this.camera.getWorldDirection(new Vector3());
    return { position: fromViewer(this.camera.position.toArray()), forward: fromViewer(d.toArray()) };
  }

  dispose(): void {
    this.controls.dispose();
  }

  #current(): Orbit {
    return orbitOf(fromViewer(this.camera.position.toArray()), fromViewer(this.controls.target.toArray()));
  }

  #report(): void {
    const now = this.#current();
    const s = this.#section;
    // What the document will hold once every report lands: the latest report, else the scene's camera.
    const known = this.#echoes.at(-1) ?? (s ? orbitOf(s.position, s.target) : null);
    if (known && sameOrbit(known, now)) return;
    this.#echoes.push(now);
    if (this.#echoes.length > MAX_ECHOES) this.#echoes.shift();
    this.#onEdit(now);
  }
}
