/**
 * radiance.ts: what each emitter puts into the preview, pure numbers. The
 * bake draws emitters as glowing cards of these radiances, the live view
 * lights the backdrop with them, and the key is chosen here.
 */
import type { AreaEmitter, Emitter } from "../scene";
import type { V3 } from "./frame";

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
 * Irradiance on a plane facing the key at `at`, from a small-source view of
 * the card: L A cos(emitter) / d^2, with L the unboosted P / (pi A). three.js
 * applies the receiver's cosine itself. The live key ignores spread.
 */
export function keyIrradiance(e: AreaEmitter, at: V3): number {
  const dx = at[0] - e.centre[0], dy = at[1] - e.centre[1], dz = at[2] - e.centre[2];
  const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
  const cosEmitter = Math.max(0, (dx * e.normal[0] + dy * e.normal[1] + dz * e.normal[2]) / d);
  return (e.powerW / Math.PI) * cosEmitter / d2;
}

/** A rectangle with an ellipse's area and aspect, for RectAreaLight, which has no ellipse. */
export function rectStandIn(e: Pick<Emitter, "sizeM" | "shape">): readonly [number, number] {
  const k = e.shape === "ellipse" ? Math.sqrt(Math.PI / 4) : 1;
  return [e.sizeM[0] * k, e.sizeM[1] * k];
}
