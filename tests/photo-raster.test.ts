import { describe, expect, test } from "vitest";
import type { RadianceFrame } from "../src/film";
import { defaultDocument } from "../src/document";
import { compileScene } from "../src/scene";
import { rasterEngine } from "../src/photo/raster";

const scene = compileScene(defaultDocument(), null, 1);

function frame(samples: number): RadianceFrame {
  return { width: 2, height: 1, samples, rgba: new Float32Array(8) };
}

describe("rasterEngine", () => {
  test("fits every scene", async () => {
    const engine = rasterEngine({ accumulate: () => Promise.reject(new Error("unused")) });
    expect(engine.id).toBe("raster");
    expect(await engine.fits(scene)).toBe(true);
  });

  test("renders by lending the scene to the viewport and returns its frame", async () => {
    const lent: unknown[] = [];
    const final = frame(64);
    const engine = rasterEngine({
      accumulate: async (s, onPass) => {
        lent.push(s);
        onPass(frame(16), 0.25);
        return final;
      },
    });
    const passes: number[] = [];
    const result = await engine.render(scene, (_f, fraction) => passes.push(fraction), new AbortController().signal);
    expect(result).toBe(final);
    expect(lent).toEqual([scene]);
    expect(passes).toEqual([0.25]);
  });

  test("the viewport sees the caller's abort, including its reason", async () => {
    const controller = new AbortController();
    const engine = rasterEngine({
      accumulate: (_s, _onPass, signal) =>
        new Promise<RadianceFrame>((resolve, reject) => {
          signal.addEventListener("abort", () => (signal.reason === "finish" ? resolve(frame(8)) : reject(new Error("stopped"))));
        }),
    });
    const running = engine.render(scene, () => {}, controller.signal);
    controller.abort("finish");
    expect((await running).samples).toBe(8);
  });

  test("a viewport failure reaches the desk as a rejection", async () => {
    const engine = rasterEngine({ accumulate: () => Promise.reject(new Error("WebGL context lost")) });
    await expect(engine.render(scene, () => {}, new AbortController().signal)).rejects.toThrow("WebGL context lost");
  });
});
