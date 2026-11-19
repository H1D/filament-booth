/**
 * mappings.ts: how a value maps onto a range input, and how far a typed value
 * may go. Pure, so it is tested without a DOM.
 */
import type { Bounds } from "../document";

/**
 * How a value maps onto the range input, and how far a typed value may go.
 * A slider spans the useful range. The typed field accepts the whole valid
 * range, so a value past the slider's end pins the thumb and still counts.
 */
export interface Mapping {
  readonly range: { readonly min: number; readonly max: number; readonly step: number };
  readonly toRange: (value: number) => number;
  readonly fromRange: (position: number) => number;
  /** What a typed value is clamped to. */
  readonly limits: { readonly min: number; readonly max: number };
  /** The value one arrow press in the number field moves to. */
  readonly nudge: (value: number, direction: 1 | -1, big: boolean) => number;
  /** Decimals to show. */
  readonly digits: number;
  readonly int: boolean;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const decimalsOf = (step: number): number => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)));

function sliderSpan(b: Bounds): { min: number; max: number; step: number } {
  const step = b.step ?? 1;
  const min = b.slider?.min ?? b.min ?? (b.gt !== undefined ? b.gt + step : Number.NaN);
  const max = b.slider?.max ?? b.max ?? Number.NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("a slider needs a finite range in BOUNDS");
  return { min, max, step };
}

function typedLimits(b: Bounds, step: number): { min: number; max: number } {
  return { min: b.min ?? (b.gt !== undefined ? b.gt + step : -Infinity), max: b.max ?? Infinity };
}

/** Evenly spaced between the slider's ends, as the browser spaces a range input. */
export function linear(b: Bounds): Mapping {
  const span = sliderSpan(b);
  const limits = typedLimits(b, span.step);
  return {
    range: span,
    toRange: (v) => clamp(v, span.min, span.max),
    fromRange: (p) => p,
    limits,
    nudge: (v, dir, big) => clamp(v + dir * span.step * (big ? 10 : 1), limits.min, limits.max),
    digits: decimalsOf(span.step),
    int: b.int === true,
  };
}

const LOG_POSITIONS = 1000;

/** Equal distance per doubling, for values like samples where each step up matters less. */
export function logarithmic(b: Bounds): Mapping {
  const span = sliderSpan(b);
  const limits = typedLimits(b, span.step);
  const ratio = Math.log(span.max / span.min);
  return {
    range: { min: 0, max: LOG_POSITIONS, step: 1 },
    toRange: (v) => Math.round(clamp(Math.log(Math.max(v, span.min) / span.min) / ratio, 0, 1) * LOG_POSITIONS),
    fromRange: (p) => {
      const v = span.min * Math.exp((p / LOG_POSITIONS) * ratio);
      return b.int === true ? Math.round(v) : v;
    },
    limits,
    nudge: (v, dir, big) => clamp(v + dir * span.step * (big ? 10 : 1), limits.min, limits.max),
    digits: decimalsOf(span.step),
    int: b.int === true,
  };
}

/** A fixed ladder of values, like the f-stop scale. The thumb snaps to the nearest rung. */
export function ladder(rungs: readonly number[], b: Bounds): Mapping {
  const last = rungs.length - 1;
  const nearest = (v: number): number => {
    let best = 0;
    for (let i = 1; i <= last; i++) if (Math.abs(Math.log(rungs[i] / v)) < Math.abs(Math.log(rungs[best] / v))) best = i;
    return best;
  };
  return {
    range: { min: 0, max: last, step: 1 },
    toRange: (v) => nearest(v),
    fromRange: (p) => rungs[clamp(Math.round(p), 0, last)],
    limits: typedLimits(b, 0.1),
    nudge: (v, dir) => rungs[clamp(nearest(v) + dir, 0, last)],
    digits: 1,
    int: false,
  };
}


const NUMBER_JUNK = /[^0-9eE+\-.,]/g;

/** NaN when there is no digit to read: Number("") is 0, and "abc" must not become a zero. */
export function parseTyped(text: string): number {
  const cleaned = text.replace(NUMBER_JUNK, "").replace(",", ".");
  return /\d/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

export function formatValue(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return digits > 0 ? text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : text;
}

