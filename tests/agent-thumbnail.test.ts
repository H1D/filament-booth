import { afterEach, describe, expect, test, vi } from "vitest";
import { jpegThumbnail } from "../src/agent/host";

/**
 * A browser whose accelerated 2D canvas reads back black, as the hardware-GPU
 * Chromium of tools/e2e/session.ts does: only a canvas asked to stay on the
 * CPU (`willReadFrequently`) keeps what was drawn on it.
 */
function browserWithBlackAcceleratedCanvas(width: number, height: number) {
  const canvases: { readonly width: number; readonly height: number }[] = [];
  vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width, height, close() {} }));
  vi.stubGlobal("OffscreenCanvas", class {
    readonly width: number;
    readonly height: number;
    #onCpu = false;

    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      canvases.push(this);
    }

    getContext(_kind: string, options?: { willReadFrequently?: boolean }) {
      this.#onCpu = options?.willReadFrequently === true;
      return { drawImage: () => {} };
    }

    convertToBlob(): Promise<Blob> {
      return Promise.resolve(new Blob([this.#onCpu ? "pixels" : "black"]));
    }
  });
  return { canvases };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("the agent's JPEG thumbnail", () => {
  test("it is drawn on a CPU canvas, so a browser with a broken accelerated canvas still gives the agent a picture", async () => {
    browserWithBlackAcceleratedCanvas(1600, 2000);
    const thumbnail = await jpegThumbnail(new Blob(["png"]), 768);
    expect(await thumbnail.blob.text()).toBe("pixels");
  });

  test("the long edge is 768 px and a smaller photo is not enlarged", async () => {
    const big = browserWithBlackAcceleratedCanvas(1600, 2000);
    expect(await jpegThumbnail(new Blob(["png"]), 768)).toMatchObject({ width: 614, height: 768 });
    expect(big.canvases[0]).toMatchObject({ width: 614, height: 768 });

    browserWithBlackAcceleratedCanvas(160, 200);
    expect(await jpegThumbnail(new Blob(["png"]), 768)).toMatchObject({ width: 160, height: 200 });
  });
});
