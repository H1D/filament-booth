/**
 * radiance.ts: what each emitter puts into the preview, pure numbers. The
 * bake draws emitters as glowing cards of these radiances, the live view
 * lights the backdrop with them, and the key is chosen here.
 */
import type { AreaEmitter, Emitter } from "../scene";

/** Rect w x h, or the ellipse inscribed in it. */
export function emitterArea(e: Pick<Emitter, "sizeM" | "shape">): number {
  const [w, h] = e.sizeM;
  return e.shape === "ellipse" ? (Math.PI * w * h) / 4 : w * h;
}

/**
 * Cycles keeps a light's power when `spread` narrows it, so the radiance
 * inside the cone grows by 1 / sin^2(spread / 2): P / (pi A) / sin^2(spread / 2).
 */
export function areaRadiance(e: Pick<AreaEmitter, "powerW" | "spreadRad" | "sizeM" | "shape">): number {
  return e.powerW / (Math.PI * emitterArea(e)) / Math.sin(e.spreadRad / 2) ** 2;
}

/** One number for the whole card: a scrim's gradient averages to its midpoint. */
export function meanRadiance(e: Emitter): number {
  return e.kind === "area" ? areaRadiance(e) : (e.topRadiance + e.bottomRadiance) / 2;
}

/** The light that casts the live shadow: the most powerful area light that reaches the backdrop. */
export function keyEmitter(emitters: readonly Emitter[]): AreaEmitter | null {
  let key: AreaEmitter | null = null;
  for (const e of emitters) if (e.kind === "area" && !e.partOnly && (key === null || e.powerW > key.powerW)) key = e;
  return key;
}

/**
 * The key seen from afar, as a spot light: radiant intensity along its normal,
 * L A = P / (pi sin^2(spread / 2)), in W/sr, which three.js takes as candela.
 * Irradiance at distance d on axis is then this / d^2.
 */
export function keyIntensity(e: Pick<AreaEmitter, "powerW" | "spreadRad" | "sizeM" | "shape">): number {
  return areaRadiance(e) * emitterArea(e);
}

/** The spot's half-angle: the spread's half, at most a hemisphere. */
export function keyConeRad(e: Pick<AreaEmitter, "spreadRad">): number {
  return Math.min(Math.PI / 2, e.spreadRad / 2);
}

/** A rectangle with an ellipse's area and aspect, for RectAreaLight, which has no ellipse. */
export function rectStandIn(e: Pick<Emitter, "sizeM" | "shape">): readonly [number, number] {
  const k = e.shape === "ellipse" ? Math.sqrt(Math.PI / 4) : 1;
  return [e.sizeM[0] * k, e.sizeM[1] * k];
}
