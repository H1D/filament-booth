/**
 * film.ts: a linear float frame in, a deliverable image out. Both photo
 * engines return RadianceFrames and both go through here, so tone, file
 * format and naming never depend on which engine ran.
 *
 * The AgX numbers exist once, as data in AGX. The CPU path below and the
 * viewport's TSL display node are both built from that table, and a unit
 * test checks they agree on probe colours.
 */
import type { AgxLook } from "./document";
import type { FilmSection } from "./scene";

/** Scene-linear Rec.709, premultiplied alpha. `albedo` and `normal` guide the denoiser when present. */
export interface RadianceFrame {
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly rgba: Float32Array;
  readonly albedo?: Float32Array;
  readonly normal?: Float32Array;
}

export interface AgxData {
  readonly toRec2020: readonly number[]; // 3x3, column-major
  readonly inset: readonly number[];
  readonly outset: readonly number[];
  readonly toSrgb: readonly number[];
  readonly logMin: number;
  readonly logMax: number;
  readonly curve: readonly number[];     // polynomial coefficients, highest power first
  /** Contrast about `pivot` in the log encoding, per look. */
  readonly looks: Readonly<Record<AgxLook, { readonly contrast: number; readonly pivot: number }>>;
}
export const AGX: AgxData = null as never; // TODO: the constants of the old viewer's agxMHC, as data

/** One linear RGB triple to display-referred sRGB, 0..1. */
export function agx(rgb: readonly [number, number, number], look: AgxLook): [number, number, number] {
  throw new Error("not implemented");
}

/** Denoise when asked and guides exist, AgX with the film's look, sRGB encode, PNG.
 *  A transparent film keeps alpha. */
export function develop(frame: RadianceFrame, film: FilmSection): Promise<Blob> {
  throw new Error("not implemented");
}

/** A quick displayable version of a partial frame, for progress. Same AgX, no denoise. */
export function quickLook(frame: RadianceFrame, look: AgxLook, maxEdgePx: number): ImageBitmap {
  throw new Error("not implemented");
}
