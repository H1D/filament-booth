/**
 * units.ts: branded scalars and the colour and vector shapes built on them.
 *
 * Lives apart from document.ts only so presets.ts can build values at module
 * load without a runtime import cycle (document.ts imports presets.ts for its
 * defaults). document.ts re-exports everything here, so callers import from
 * "./document" as the design says.
 */
export type Metres = number & { readonly _u: "m" };
export type Mm = number & { readonly _u: "mm" };
export type Watts = number & { readonly _u: "W" };
export type Degrees = number & { readonly _u: "deg" };
export type Kelvin = number & { readonly _u: "K" };
export const m = (v: number): Metres => v as Metres;
export const mm = (v: number): Mm => v as Mm;
export const watts = (v: number): Watts => v as Watts;
export const deg = (v: number): Degrees => v as Degrees;
export const kelvin = (v: number): Kelvin => v as Kelvin;

/** Blender-frame vector, metres. The only vector type in the document. */
export type Vec3 = readonly [Metres, Metres, Metres];
/** Linear RGB, 0..1 nominal (emissive/scene values may exceed 1 elsewhere). */
export type Rgb = readonly [number, number, number];
