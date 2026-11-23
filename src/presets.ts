/**
 * presets.ts: the one list of filaments and the one list of looks.
 *
 * Calibration constants that used to be copied between render.py and the
 * viewer live here and nowhere else. Adding a preset is one entry; panels,
 * preview and Cycles all derive from it (design-red-flags: hand-synced list).
 * Pure data in document units; no behaviour beyond lookup.
 *
 * Runtime imports come from units.ts, not document.ts: document.ts imports
 * this file for its defaults, and a cycle would leave `deg` uninitialised
 * when this module loads first.
 */
import type {
  AreaLight, FilamentPresetId, FilamentRecipe, FilmOptics, LightColor, LookId, OpticsPresetId, ScrimLight, Studio,
} from "./document";
import { deg, m, watts } from "./units";

/** Old rigs were drafted in "room watts" (render.py POWER = 1/40). The
 *  transcription below applies that scale ONCE, here, so every later
 *  consumer sees true watts and the constant can die. */
const roomW = (w: number) => watts(w / 40);

// petg-basic and pla-matte carry the calibrated FINISHES numbers from the old
// twin (index.html:114, render.py:23). The recipe albedo is the sRGB hex that
// linearises closest to the old albedo: #1c1c1c is 0.0116 (old 0.012), #292929
// is 0.0222 (old 0.022). Anisotropy is render.py's: 0.25 gloss, 0.10 matte.
// pla-basic and pla-silk are UNCALIBRATED ESTIMATES carried over from the
// type sketch. No Cycles still has been matched to either, so `calibrated` is
// false for them and the Filament panel says "estimate" next to their names.
export const FILAMENT_PRESETS: Record<FilamentPresetId, { label: string; calibrated: boolean; recipe: FilamentRecipe }> = {
  "petg-basic": { label: "PETG Basic", calibrated: true, recipe: {
    colorHex: "#1c1c1c", ior: 1.57, anisotropy: 0.25, vary: 1.0,
    roughness: { 0: 0.21, 1: 0.24, 2: 0.36, 3: 0.50 }, peiRough: 0.42, peiFarRough: 0.55, subsurface: 0 } },
  "pla-matte": { label: "PLA Matte", calibrated: true, recipe: {
    colorHex: "#292929", ior: 1.46, anisotropy: 0.10, vary: 0.5,
    roughness: { 0: 0.74, 1: 0.62, 2: 0.80, 3: 0.85 }, peiRough: 0.66, peiFarRough: 0.74, subsurface: 0 } },
  "pla-basic": { label: "PLA Basic", calibrated: false, recipe: {
    colorHex: "#1c1c1c", ior: 1.46, anisotropy: 0.15, vary: 0.8,
    roughness: { 0: 0.38, 1: 0.34, 2: 0.48, 3: 0.58 }, peiRough: 0.48, peiFarRough: 0.60, subsurface: 0.15 } },
  "pla-silk": { label: "PLA Silk", calibrated: false, recipe: {
    colorHex: "#3a3a40", ior: 1.46, anisotropy: 0.45, vary: 0.9,
    roughness: { 0: 0.16, 1: 0.20, 2: 0.30, 3: 0.44 }, peiRough: 0.40, peiFarRough: 0.52, subsurface: 0.05 } },
};

const white: LightColor = { kind: "rgb", rgb: [1, 1, 1] };

function area(
  id: string, name: string, azimuth: number, elevation: number, distance: number,
  width: number, height: number, roomWatts: number, opts: { spread?: number; partOnly?: boolean } = {},
): AreaLight {
  return {
    kind: "area", id, name, on: true, partOnly: opts.partOnly ?? false,
    azimuth: deg(azimuth), elevation: deg(elevation), distance: m(distance), shape: "rect",
    width: m(width), height: m(height), color: white,
    powerW: roomW(roomWatts), spreadDeg: deg(opts.spread ?? 180),
  };
}

function scrim(
  id: string, name: string, azimuth: number, elevation: number, distance: number,
  width: number, height: number, top: number, bottom: number, partOnly = false,
): ScrimLight {
  return {
    kind: "scrim", id, name, on: true, partOnly,
    azimuth: deg(azimuth), elevation: deg(elevation), distance: m(distance), shape: "rect",
    width: m(width), height: m(height), color: white, topRadiance: top, bottomRadiance: bottom,
  };
}

const grey = (v: number) => [v, v, v] as const;

/**
 * A look is lights, backdrop and world. The old RIGS (index.html:426) placed
 * each light at a Cartesian point aimed at C = (0, 0, 0.09). Here every light
 * is the same point as azimuth, elevation and distance about C, rounded to
 * 0.001 degree and 0.1 mm (under 0.1 mm of position error at 2.3 m). The
 * "light" rig is the "studio" look. The `dark` rim strips and scrims are
 * partOnly, as render.py links them to the part. Scrim and strip sizes,
 * radiances and spreads are the old numbers unchanged.
 */
export const LOOK_PRESETS: Record<LookId, { label: string; studio: Studio }> = {
  studio: { label: "Studio", studio: {
    backdrop: { color: grey(0.55), roughness: 0.55, texture: 0.40 },
    world: { hdrId: "studio_small_09_1k", strength: 0.25, rotationDeg: deg(30) },
    floorCards: null,
    lights: [
      area("top", "Top softbox", 0, 83.729, 0.9155, 1.2, 0.9, 500),
      scrim("right", "Right gradient", 110.63, 21.622, 0.977, 1.4, 1.8, 3.0, 0.15),
      area("left", "Left strip", -71.565, 21.411, 0.8492, 0.3, 1.2, 160),
      area("rim-left", "Left rim", -143.13, 25.641, 0.8319, 0.1, 1.2, 160),
      area("front", "Front fill", 0, 11.81, 2.2476, 2.0, 0.8, 120),
    ] } },
  dark: { label: "Dark", studio: {
    backdrop: { color: grey(0.012), roughness: 0.32, texture: 0.35 },
    world: { hdrId: "studio_small_09_1k", strength: 0.02, rotationDeg: deg(30) },
    floorCards: null,
    lights: [
      area("top", "Top softbox", 180, 68.962, 0.975, 1.0, 0.6, 120, { spread: 60 }),
      area("rim-left", "Left rim", -160.56, 16.09, 0.9381, 0.08, 1.0, 220, { spread: 40, partOnly: true }),
      area("rim-right", "Right rim", 160.56, 16.09, 0.9381, 0.08, 1.0, 220, { spread: 40, partOnly: true }),
      scrim("grad-right", "Right gradient", 110.63, 18.846, 0.9597, 1.4, 1.8, 3.5, 0.03, true),
      scrim("grad-left", "Left gradient", -125.218, 19.086, 1.101, 1.2, 1.6, 2.0, 0.0, true),
    ] } },
  gradient: { label: "Gradient", studio: {
    backdrop: { color: grey(0.35), roughness: 0.6, texture: 0.40 },
    world: { hdrId: "studio_small_09_1k", strength: 0.03, rotationDeg: deg(30) },
    floorCards: { keySide: 3.5, farSide: 0.05, azimuth: deg(-90) },
    lights: [
      area("top", "Top softbox", 0, 90, 1.01, 1.4, 1.4, 400),
      scrim("left", "Left card", -90, 14.574, 1.0332, 2.0, 1.6, 6.0, 0.6),
      scrim("front", "Front card", 0, 14.574, 1.0332, 2.0, 1.6, 2.0, 0.2),
      scrim("right", "Right card", 90, 14.574, 1.0332, 2.0, 1.6, 0.35, 0.03),
      scrim("back", "Back card", 180, 14.574, 1.0332, 2.0, 1.6, 3.0, 0.3),
    ] } },
  rim: { label: "Rim", studio: {
    backdrop: { color: grey(0.02), roughness: 0.35, texture: 0.35 },
    world: { hdrId: "studio_small_09_1k", strength: 0.01, rotationDeg: deg(30) },
    floorCards: { keySide: 0.8, farSide: 0, azimuth: deg(-90) },
    lights: [
      area("top", "Back strip", 180, 63.687, 1.0152, 1.4, 0.3, 500),
      area("rim-left", "Left rim", -143.746, 21.16, 0.9973, 0.1, 1.4, 270),
      area("rim-right", "Right rim", 143.746, 21.16, 0.9973, 0.1, 1.4, 270),
      scrim("left", "Left kicker", -90, 14.574, 1.0332, 0.8, 1.6, 1.8, 0.15),
      scrim("right", "Right kicker", 90, 14.574, 1.0332, 0.8, 1.6, 0.9, 0.08),
    ] } },
  raking: { label: "Raking", studio: {
    backdrop: { color: grey(0.35), roughness: 0.6, texture: 0.45 },
    world: { hdrId: "studio_small_09_1k", strength: 0.12, rotationDeg: deg(120) },
    floorCards: null,
    lights: [
      area("rake", "Raking strip", -93.18, 1.906, 0.9019, 0.15, 1.2, 260, { spread: 40 }),
      area("top", "Top softbox", 0, 78.799, 1.0296, 1.0, 0.8, 200),
      area("rim-right", "Right rim", 126.87, 22.457, 0.8115, 0.12, 1.2, 120),
    ] } },
};

export const FOCAL_PRESETS_MM = [24, 35, 50, 85, 100, 135] as const;
export const ASPECT_PRESETS = [
  { label: "4:5", w: 4, h: 5 }, { label: "1:1", w: 1, h: 1 },
  { label: "3:2", w: 3, h: 2 }, { label: "16:9", w: 16, h: 9 },
] as const;

/** Photographic lens and sensor profiles copied into `doc.output.optics` on selection. */
export const OPTICS_PRESETS: Record<OpticsPresetId, { label: string; optics: FilmOptics }> = {
  clean: {
    label: "Clean",
    optics: { grain: 0, glare: 0, vignette: 0, chromatic: 0, softness: 0, warmth: 0 },
  },
  "studio-dslr": {
    label: "Studio camera",
    optics: { grain: 0.14, glare: 0.22, vignette: 0.18, chromatic: 0.12, softness: 0.08, warmth: 0.04 },
  },
  macro: {
    label: "Macro lens",
    optics: { grain: 0.20, glare: 0.30, vignette: 0.32, chromatic: 0.28, softness: 0.16, warmth: 0.0 },
  },
  "desk-phone": {
    label: "Desk / phone",
    optics: { grain: 0.34, glare: 0.36, vignette: 0.24, chromatic: 0.32, softness: 0.24, warmth: 0.14 },
  },
};

/** The one table from a document's `hdrId` to its file. Both renderers load
 *  through it. Files live under public/hdr/. */
export const WORLD_HDRS = {
  studio_small_09_1k: { label: "Small studio", url: "/hdr/studio_small_09_1k.hdr" },
} as const satisfies Record<string, { label: string; url: string }>;
export type WorldHdrId = keyof typeof WORLD_HDRS;

/** The file for an id, or the default studio when a saved setup names one that no longer ships. */
export function worldHdrUrl(hdrId: string): string {
  return hdrId in WORLD_HDRS ? WORLD_HDRS[hdrId as WorldHdrId].url : WORLD_HDRS.studio_small_09_1k.url;
}
