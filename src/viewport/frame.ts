/**
 * frame.ts: the viewport's coordinate and framing math, pure numbers.
 *
 * Blender (x, y, z) is three.js (x, z, -y). BLENDER_TO_VIEWER sits on one
 * root group; every other conversion here exists for the camera, which lives
 * outside that group because OrbitControls drives it in three.js's frame.
 */
import { deg, m, type Degrees, type Metres, type Vec3 } from "../document";

export type V3 = readonly [number, number, number];

/** Column-major. Columns are the viewer images of Blender's x, y and z axes. */
export const BLENDER_TO_VIEWER: readonly number[] = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

export const toViewer = (v: V3): [number, number, number] => [v[0], v[2], -v[1]];
export const fromViewer = (v: V3): [number, number, number] => [v[0], -v[2], v[1]];

interface Frame {
  readonly centre: V3;
  readonly xAxis: V3;
  readonly yAxis: V3;
  readonly normal: V3;
}

/** Column-major, Blender frame: a unit card scaled to w x h on an emitter's frame, +Z along its normal. */
export function cardMatrix(e: Frame, w: number, h: number): number[] {
  const { xAxis: x, yAxis: y, normal: n, centre: c } = e;
  return [x[0] * w, x[1] * w, x[2] * w, 0, y[0] * h, y[1] * h, y[2] * h, 0, n[0], n[1], n[2], 0, c[0], c[1], c[2], 1];
}

/** As cardMatrix for a three.js light, which shines along its -Z: x flips with z to stay right-handed. */
export function lightMatrix(e: Frame): number[] {
  const { xAxis: x, yAxis: y, normal: n, centre: c } = e;
  return [-x[0], -x[1], -x[2], 0, y[0], y[1], y[2], 0, -n[0], -n[1], -n[2], 0, c[0], c[1], c[2], 1];
}

/** The four numbers OrbitControls edits, in the azimuth convention of document.ts. */
export interface Orbit {
  readonly azimuth: Degrees;
  readonly elevation: Degrees;
  readonly distance: Metres;
  readonly target: Vec3;
}

const DEG = 180 / Math.PI;

/** The inverse of scene.ts's sphericalOffset: a Blender-frame camera position about its target. */
export function orbitOf(position: V3, target: V3): Orbit {
  const x = position[0] - target[0], y = position[1] - target[1], z = position[2] - target[2];
  return {
    azimuth: deg(Math.atan2(x, -y) * DEG),
    elevation: deg(Math.atan2(z, Math.hypot(x, y)) * DEG),
    distance: m(Math.hypot(x, y, z)),
    target: [m(target[0]), m(target[1]), m(target[2])],
  };
}

/** Blender-frame camera position of an orbit: scene.ts's sphericalOffset about the target. */
export function orbitPosition(o: Orbit): [number, number, number] {
  const az = o.azimuth / DEG, el = o.elevation / DEG, d = o.distance;
  return [
    o.target[0] + d * Math.sin(az) * Math.cos(el),
    o.target[1] - d * Math.cos(az) * Math.cos(el),
    o.target[2] + d * Math.sin(el),
  ];
}

/** The same camera to well under a micrometre: compared as positions, so 180 and -180 degrees agree. */
export function sameOrbit(a: Orbit, b: Orbit): boolean {
  const near = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-7;
  return near(a.target, b.target) && near(orbitPosition(a), orbitPosition(b));
}

/** The photo's frame inside the canvas, in canvas pixels, origin top-left. */
export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The crop fills this share of the canvas's tighter side, so a band of dimmed context stays around it. */
export const CROP_FILL = 0.9;

export function cropRect(canvasW: number, canvasH: number, filmW: number, filmH: number): Crop {
  const scale = CROP_FILL * Math.min(canvasW / filmW, canvasH / filmH);
  const width = filmW * scale, height = filmH * scale;
  return { x: (canvasW - width) / 2, y: (canvasH - height) / 2, width, height };
}

/** The canvas's vertical field of view that shows the film's `filmFovY` across the crop's height. */
export function canvasFovY(filmFovY: number, canvasH: number, crop: Crop): number {
  return 2 * Math.atan(Math.tan(filmFovY / 2) * (canvasH / crop.height));
}

/** Pixels per metre on the plane `depth` metres in front of a camera whose `heightPx` spans `fovY`. */
export function pxPerMetreAt(depth: number, fovY: number, heightPx: number): number {
  return heightPx / (2 * depth * Math.tan(fovY / 2));
}
