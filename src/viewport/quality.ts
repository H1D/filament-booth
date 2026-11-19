/**
 * quality.ts: the moving view's quality ladder, ported from the old viewer.
 * The measured frame time picks a level: half-resolution AO first, then a
 * lower render scale, and if even the lowest scale is too slow (the GPU is
 * slow on triangles, not pixels) the lite mesh. Stills and photos always
 * render at full quality.
 */

/** [render scale, AO scale]: each step is about 0.7x the frame. */
export const LEVELS: readonly (readonly [number, number])[] = [
  [1, 1], [1, 0.5], [0.85, 0.5], [0.7, 0.5], [0.6, 0.5], [0.5, 0.5], [0.42, 0.5], [0.35, 0.5], [0.3, 0.5],
];
/** ms. Calibration knob: step down under 24 fps, back up over 48 (no step costs 2x: no ping-pong). */
export const BUDGET_MS = 1000 / 24;
const WINDOW = 30;
const STEP = 0.7;
const SLOW_START_LEVEL = 5;

/** Phones, tablets and integrated or mobile GPUs other than Apple's start at half scale on the lite mesh. */
export function looksSlow(gpuName: string, coarsePointer: boolean): boolean {
  return coarsePointer || /intel|\barm\b|qualcomm|adreno|mali|powervr|swiftshader|llvmpipe|basic render/i.test(gpuName);
}

export interface QualitySetting {
  readonly renderScale: number;
  readonly aoScale: number;
  readonly lite: boolean;
}

export class QualityState {
  level: number;
  /** Latched for the session once the lowest scale is still too slow. */
  lite: boolean;
  #times: number[] = [];

  constructor(slowDevice: boolean) {
    this.lite = slowDevice;
    this.level = slowDevice ? SLOW_START_LEVEL : 0;
  }

  /** `dtMs`: wall time between two moving frames, the GPU's pace once it is the bottleneck. */
  adapt(dtMs: number): void {
    const times = [...this.#times.slice(-(WINDOW - 1)), dtMs];
    this.#times = times;
    const n = times.length;
    if (n < 4) return;
    // The mean without the slowest eighth: a hitch does not count.
    const k = n - Math.ceil(n / 8);
    const mean = times.toSorted((a, b) => a - b).slice(0, k).reduce((s, x) => s + x, 0) / k;
    const last = LEVELS.length - 1;
    if (mean > BUDGET_MS) {
      if (this.level === last) this.lite = true;
      this.level = Math.min(last, this.level + Math.ceil(Math.log(mean / BUDGET_MS) / Math.log(1 / STEP)));
    } else if (n >= WINDOW && mean < BUDGET_MS / 2 && this.level > 0) {
      this.level--;
    } else {
      return;
    }
    this.#times = [];
  }

  setting(moving: boolean): QualitySetting {
    const [renderScale, aoScale] = LEVELS[moving ? this.level : 0];
    return { renderScale, aoScale, lite: moving && this.lite };
  }

  describe(): string {
    const [s, a] = LEVELS[this.level];
    return [`level ${this.level}`, s < 1 ? `${Math.round(s * 100)}% res` : "", a < 1 ? "AO 1/2" : "", this.lite ? "lite mesh" : ""]
      .filter(Boolean).join(", ");
  }
}
