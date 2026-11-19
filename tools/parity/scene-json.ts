/**
 * The sceneToJson format (src/scene.ts), written for the parity fixtures: the Scene as JSON with
 * every typed array replaced by { "buffer": name, "length": n }, the arrays as raw
 * little-endian files named <name>.bin next to scene.json. The buffer name is the array's path
 * in the scene, so tools/blender/render_scene.py knows each element type from the name.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scene } from "../../src/scene";

type Typed = Float32Array | Int16Array | Uint32Array;

function isTyped(value: unknown): value is Typed {
  return value instanceof Float32Array || value instanceof Int16Array || value instanceof Uint32Array;
}

export function sceneToJsonWithBuffers(scene: Scene): { json: string; buffers: Map<string, Typed> } {
  const buffers = new Map<string, Typed>();
  const walk = (value: unknown, path: string): unknown => {
    if (isTyped(value)) {
      buffers.set(path, value);
      return { buffer: path, length: value.length };
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}.${i}`));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k)]));
    }
    return value;
  };
  return { json: JSON.stringify(walk(scene, ""), null, 1), buffers };
}

export function writeScene(scene: Scene, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const { json, buffers } = sceneToJsonWithBuffers(scene);
  for (const [name, data] of buffers) {
    writeFileSync(join(dir, `${name}.bin`), new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  const file = join(dir, "scene.json");
  writeFileSync(file, json);
  return file;
}
