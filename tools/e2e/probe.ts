/**
 * probe.ts: measurements the driver takes inside the page, loaded as a module
 * script by tools/e2e/drive.ts. It reads the scene the app is showing through
 * the development hook in main.tsx and never changes anything.
 */
import { exportScene, type Scene } from "../../src/scene";

function scene(): Scene {
  const dev = window.boothDev;
  if (dev === undefined) throw new Error("no boothDev hook: is this a development build?");
  return dev.booth.scene;
}

type P3 = readonly [number, number, number];

/** Blender-frame world point to film coordinates in 0..1, origin top-left, with the scene's own camera model. */
function projector(s: Scene): (p: P3) => [number, number] {
  const cam = s.camera, P = cam.position;
  const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: P3): P3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fwd = norm(sub(cam.target, P)), right = norm(cross(fwd, cam.up)), up = cross(right, fwd);
  const ty = Math.tan(cam.fovYRad / 2), tx = ty * (s.film.width / s.film.height);
  return (p) => {
    const d = sub(p, P), z = dot(d, fwd);
    return [(dot(d, right) / (z * tx) + 1) * 0.5, (1 - dot(d, up) / (z * ty)) * 0.5];
  };
}

function toWorld(s: Scene, x: number, y: number, z: number): P3 {
  const t = s.part?.toWorld;
  if (!t) throw new Error("no part");
  return [t[0] * x + t[4] * y + t[8] * z + t[12], t[1] * x + t[5] * y + t[9] * z + t[13], t[2] * x + t[6] * y + t[10] * z + t[14]];
}

/**
 * The part's silhouette at `width` x `height` (the film's aspect), from every
 * vertex projected with the scene camera, closed over small holes and eroded
 * by `erodePx` so edge pixels, where two renderers disagree most, do not count.
 * One byte per pixel, base64.
 */
function partMask(width: number, height: number, erodePx: number): string {
  const s = scene();
  const part = s.part;
  if (!part) throw new Error("no part");
  const project = projector(s), p = part.mesh.position;
  let mask = new Uint8Array(width * height);
  for (let i = 0; i < p.length; i += 3) {
    const [u, v] = project(toWorld(s, p[i], p[i + 1], p[i + 2]));
    const x = Math.floor(u * width), y = Math.floor(v * height);
    if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1;
  }
  const pass = (src: Uint8Array, r: number, dilate: boolean, stride: number, count: number, lines: number, lineStride: number) => {
    const out = new Uint8Array(src.length);
    for (let l = 0; l < lines; l++) for (let i = 0; i < count; i++) {
      let v = dilate ? 0 : 1;
      for (let k = Math.max(0, i - r); k <= Math.min(count - 1, i + r); k++) {
        const x = src[l * lineStride + k * stride];
        if (dilate ? x === 1 : x === 0) { v = dilate ? 1 : 0; break; }
      }
      if (!dilate && (i - r < 0 || i + r > count - 1)) v = 0;
      out[l * lineStride + i * stride] = v;
    }
    return out;
  };
  const morph = (src: Uint8Array, r: number, dilate: boolean) => pass(pass(src, r, dilate, 1, width, height, width), r, dilate, width, height, width, 1);
  mask = morph(morph(mask, 2, true), 2 + erodePx, false);
  let s64 = "";
  for (let i = 0; i < mask.length; i += 0x8000) s64 += String.fromCharCode(...mask.subarray(i, i + 0x8000));
  return btoa(s64);
}

/** Film coordinates (0..1) of the middle of the part's top front edge and top back edge, as the camera sees them. */
function topEdges(): { near: [number, number]; far: [number, number]; nearDepthM: number; farDepthM: number } {
  const s = scene();
  const b = s.part?.worldBounds;
  if (!b) throw new Error("no part");
  const project = projector(s), P = s.camera.position;
  const cx = (b.min[0] + b.max[0]) / 2;
  // The camera sits towards -Y at azimuth 0; take whichever face of the box is nearer to it.
  const ends: [P3, P3] = [[cx, b.min[1], b.max[2]], [cx, b.max[1], b.max[2]]];
  const depth = (p: P3) => Math.hypot(p[0] - P[0], p[1] - P[1], p[2] - P[2]);
  const [near, far] = depth(ends[0]) < depth(ends[1]) ? ends : [ends[1], ends[0]];
  return { near: project(near), far: project(far), nearDepthM: depth(near), farDepthM: depth(far) };
}

let exported: Map<string, Uint8Array> | null = null;

/** Writes the scene on show with exportScene and keeps its buffers for `chunk`. */
function sceneFile(): { json: string; buffers: { name: string; bytes: number }[] } {
  const file = exportScene(scene());
  exported = new Map([...file.buffers].map(([name, data]) => [name, new Uint8Array(data.buffer, data.byteOffset, data.byteLength)]));
  return { json: file.json, buffers: [...exported].map(([name, bytes]) => ({ name, bytes: bytes.byteLength })) };
}

function chunk(name: string, start: number, end: number): string {
  const bytes = exported?.get(name);
  if (!bytes) throw new Error(`no buffer ${name}`);
  const part = bytes.subarray(start, end);
  let s = "";
  for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode(...part.subarray(i, i + 0x8000));
  return btoa(s);
}

const probe = { partMask, topEdges, sceneFile, chunk };
export type Probe = typeof probe;
declare global { interface Window { boothProbe?: Probe } }
window.boothProbe = probe;
