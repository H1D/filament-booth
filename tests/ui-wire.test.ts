import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { defaultDocument } from "../src/document";
import { parseManifest } from "../src/film";
import type { PhotoTools } from "../src/photo/photo";
import { compileScene } from "../src/scene";
import { photoDesk } from "../src/ui/wire";

const scene = compileScene(defaultDocument(), null, 1);
const manifest = parseManifest(JSON.parse(readFileSync(new URL("../public/lut/manifest.json", import.meta.url), "utf8")));
const tools: PhotoTools = {
  loadAgx: async (look) => ({ look, manifest, base: new Float32Array(0), pre: null }),
  quickLook: () => ({ width: 1, height: 1, close() {} }),
  develop: async () => new Blob(["png"]),
  now: () => 0,
};

// Node is not cross-origin isolated, so Cycles reports that it does not fit and the desk goes on to the next engine.
test("the photo desk renders on the preview when Cycles cannot run here", async () => {
  const accumulate = vi.fn((_scene: unknown, _onPass: unknown, signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => { reject(signal.reason); }); }));
  const run = photoDesk({ accumulate }, tools).take(scene, "part");
  await vi.waitFor(() => { expect(accumulate).toHaveBeenCalledTimes(1); });
  expect(accumulate.mock.calls[0][0]).toBe(scene);
  run.cancel();
  await run.result.catch(() => {});
});

test("with no preview the desk has Cycles alone, and the photo fails saying why", async () => {
  const run = photoDesk(null, tools).take(scene, "part");
  await expect(run.result).rejects.toThrow(/cross-origin isolated/);
});
