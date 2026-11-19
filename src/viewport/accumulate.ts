/**
 * accumulate.ts: the supersampled still and the raster photo share one
 * accumulator and one jitter sequence.
 *
 * Every sample weighs 1 (the pixel filter is drawn by Box-Muller, not
 * weighted), so the accumulator holds a plain sum of premultiplied RGBA and
 * the count divides it at display and readback. Alpha is coverage, which a
 * transparent film needs.
 */
import { FloatType, NearestFilter, RenderTarget, Texture, type WebGPURenderer } from "three/webgpu";
import { texture, uniform } from "three/tsl";
import type { Node } from "three/webgpu";
import type { RadianceFrame } from "../film";

// Sample i of a 4D low-discrepancy (R4) sequence: pixel jitter drawn from the Gaussian pixel filter
// (Box-Muller, so every sample weighs 1), and a point on the aperture.
const R4 = [0.856674883854503, 0.733891856627126, 0.6287067210378087, 0.5385972572236101] as const;
// The soft key wanders over its softbox on a 2D (R2) sequence of its own.
const R2 = [0.7548776662466927, 0.5698402909980532] as const;
/** px. Calibration knob: smaller = sharper, more moire. 0.2 mm layers often land just past 0.5 cycle/px,
 *  where they fold back as wood-grain arcs: Mitchell passes 20 % at 0.6 cycle/px, this Gaussian 8 %. */
export const PIXEL_SIGMA = 0.6;

export interface JitterSample {
  /** Pixel offset, Gaussian with sigma PIXEL_SIGMA. */
  readonly pixel: readonly [number, number];
  /** A point on the unit disc, uniform by area. */
  readonly lens: readonly [number, number];
  /** A point on the unit square, centred on 0. */
  readonly key: readonly [number, number];
}

export function jitterSample(i: number): JitterSample {
  const u = R4.map((a) => (0.5 + a * (i + 1)) % 1);
  const jr = PIXEL_SIGMA * Math.sqrt(-2 * Math.log(1 - u[2]));
  const lr = Math.sqrt(u[0]), la = 2 * Math.PI * u[1];
  return {
    pixel: [jr * Math.cos(2 * Math.PI * u[3]), jr * Math.sin(2 * Math.PI * u[3])],
    lens: [lr * Math.cos(la), lr * Math.sin(la)],
    key: [((0.5 + R2[0] * (i + 1)) % 1) - 0.5, ((0.5 + R2[1] * (i + 1)) % 1) - 0.5],
  };
}

/** Two float targets ping-ponged: each sample reads the other's sum and writes sum + sample. */
export class Accumulator {
  readonly #targets = [newTarget(), newTarget()] as const;
  readonly #prev = texture(this.#targets[1].texture);
  readonly #keep = uniform(0);
  #ping = 0;
  /** Samples in the latest sum. */
  count = 0;

  /** The node a pipeline writes: the previous sum (unless this is the first sample) plus `sample`. */
  sum(sample: Node<"vec4">) {
    return this.#prev.mul(this.#keep).add(sample);
  }

  setSize(width: number, height: number): void {
    for (const t of this.#targets) t.setSize(width, height);
    this.count = 0;
  }

  get width(): number { return this.#targets[0].width; }
  get height(): number { return this.#targets[0].height; }

  /** Point the pipeline at the target this sample writes. `first` restarts the sum. */
  begin(first: boolean): RenderTarget {
    if (first) this.count = 0;
    this.#keep.value = first ? 0 : 1;
    this.#prev.value = this.#targets[this.#ping ^ 1].texture;
    return this.#targets[this.#ping];
  }

  /** After the sample rendered: the target holding the new sum. */
  end(): RenderTarget {
    const written = this.#targets[this.#ping];
    this.count++;
    this.#ping ^= 1;
    return written;
  }

  /** The target holding the latest sum. */
  get latest(): RenderTarget {
    return this.#targets[this.#ping ^ 1];
  }

  get latestTexture(): Texture {
    return this.latest.texture;
  }

  dispose(): void {
    for (const t of this.#targets) t.dispose();
  }
}

function newTarget(): RenderTarget {
  return new RenderTarget(1, 1, { type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
}

/** The accumulator's mean, top row first. `bottomUp` for a backend that reads rows bottom up, as WebGL does. */
export async function readMean(renderer: WebGPURenderer, acc: Accumulator, bottomUp: boolean): Promise<RadianceFrame> {
  const target = acc.latest, n = acc.count, w = target.width, h = target.height;
  const raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h);
  if (!(raw instanceof Float32Array)) throw new Error("the accumulator did not read back as float32");
  const rgba = new Float32Array(w * h * 4), row = w * 4, k = 1 / n;
  for (let y = 0; y < h; y++) {
    const from = (bottomUp ? h - 1 - y : y) * row, to = y * row;
    for (let i = 0; i < row; i++) rgba[to + i] = raw[from + i] * k;
  }
  return { width: w, height: h, samples: n, rgba };
}
