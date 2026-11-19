/**
 * color.ts: the picker speaks sRGB hex, the document speaks linear RGB
 * (backdrop albedo, light colour). These are the only conversions between
 * them, so a colour round-trips through a panel without drifting.
 */
import { kelvin, type Kelvin, type Rgb } from "../document";
import { kelvinToRgb } from "../scene";

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** `#rrggbb` to linear RGB. Anything else is rejected, so a half-typed value never reaches the document. */
export function hexToLinear(hex: string): Rgb | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const ch = (i: number): number => srgbToLinear(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
  return [ch(0), ch(1), ch(2)];
}

/** Linear RGB to `#rrggbb`. Channels above 1 clip, which is what a picker can show. */
export function linearToHex(rgb: Rgb): string {
  const byte = (c: number): string => Math.round(linearToSrgb(clamp01(c)) * 255).toString(16).padStart(2, "0");
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/** The colour a kelvin value shows as on screen: scaled so the brightest channel is 1, as sRGB hex. */
export function kelvinToHex(k: number): string {
  const rgb = kelvinToRgb(k);
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  return linearToHex([rgb[0] / peak, rgb[1] / peak, rgb[2] / peak]);
}

const SEARCH_STEP_K = 100;
const SEARCH_MIN_K = 1700;
const SEARCH_MAX_K = 25000;

/**
 * The temperature whose colour is closest to `rgb` in chromaticity. Used when
 * a light changes from a picked colour to a temperature, so the light keeps
 * its tint instead of jumping to a fixed value.
 */
export function nearestKelvin(rgb: Rgb): Kelvin {
  const sum = rgb[0] + rgb[1] + rgb[2];
  if (sum <= 0) return kelvin(5600);
  const target = [rgb[0] / sum, rgb[1] / sum, rgb[2] / sum] as const;
  let best = SEARCH_MIN_K;
  let bestDist = Infinity;
  for (let k = SEARCH_MIN_K; k <= SEARCH_MAX_K; k += SEARCH_STEP_K) {
    const c = kelvinToRgb(k);
    const s = c[0] + c[1] + c[2];
    const dist = Math.hypot(c[0] / s - target[0], c[1] / s - target[1], c[2] / s - target[2]);
    if (dist < bestDist) { bestDist = dist; best = k; }
  }
  return kelvin(best);
}

/** A CSS gradient across the kelvin slider's range, so the track shows what each position looks like. */
export function kelvinTrack(min: number, max: number, stops = 8): string {
  const parts: string[] = [];
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1);
    parts.push(`${kelvinToHex(min + (max - min) * t)} ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
