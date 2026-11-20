import { expect, test } from "vitest";
import type { Photo, PhotoRun } from "../src/photo/photo";
import type { LoadedPrint } from "../src/print";
import { PhotoSession } from "../src/ui/photo-session";
import { connectPhotos } from "../src/ui/wire";
import { boothWith, ScriptedRun } from "./ui-fixtures";

const photo: Photo = {
  png: new Blob(["p"]), fileName: "p.png", width: 1, height: 1, samples: 1, targetSamples: 1,
  stoppedBy: { kind: "samples" }, denoising: { kind: "off" }, engine: "cycles", docRev: 1,
};

function partOfHeight(h: number): LoadedPrint {
  const mesh = {
    position: new Float32Array(9), normal: new Int16Array(9), tangent: new Int16Array(9), word: new Float32Array(3), index: new Uint32Array(3),
    tris: 1, layerCount: 1, layerHeightM: 2e-4, vRefMmS: 100, bboxM: { min: [-0.01, -0.01, 0], max: [0.01, 0.01, h] },
  } as LoadedPrint["mesh"];
  return { source: { kind: "bin", url: `/p${h}.bin` }, sliced: { settings: {}, settingsSource: "file", layerHeightMm: 0.2, layerTimeS: new Float32Array(2), layerFan: new Float32Array(2), filamentName: null, bedFromFile: null, note: null } as unknown as LoadedPrint["sliced"], mesh, liteMesh: async () => mesh };
}

test("Download all forgets a removed scene's photo, and every photo once another part opens", async () => {
  const parts = [partOfHeight(0.05), partOfHeight(0.08)];
  const runs: ScriptedRun[] = [];
  const { booth } = boothWith({
    print: { open: async () => parts.shift() ?? partOfHeight(1), reslice: () => Promise.reject(new Error("no")), dispose: () => {} },
    takePhoto: (): PhotoRun => { const r = new ScriptedRun(); runs.push(r); return r; },
  });
  await booth.openSample("/a.bin");
  const photos = new PhotoSession((id) => booth.takePhoto(id), { create: () => "u", revoke: () => {} }, () => booth.activeSceneId);
  connectPhotos(booth, photos);
  const first = booth.activeSceneId;
  const second = booth.addScene();
  photos.takeAll([first, second]);
  runs[0].emit({ state: "done", photo });
  runs[1].emit({ state: "done", photo });
  expect([...photos.state.get().byScene.keys()]).toEqual([first, second]);
  booth.update((d) => { d.camera.fStop = 4; });
  expect(photos.state.get().byScene.size).toBe(2);
  booth.removeScene(second);
  expect([...photos.state.get().byScene.keys()]).toEqual([first]);
  await booth.openSample("/b.bin");
  expect(photos.state.get().byScene.size).toBe(0);
});
