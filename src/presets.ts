/**
 * presets.ts — the one list of filaments and the one list of looks.
 *
 * Calibration constants that used to be copied between render.py and the
 * viewer live here and nowhere else. Adding a preset is one entry; panels,
 * preview and Cycles all derive from it (design-red-flags: hand-synced list).
 * Pure data in document units; no behaviour beyond lookup.
 */
import { deg, kelvin, m, watts, type FilamentPresetId, type FilamentRecipe, type LookId, type Studio } from "./document";

/** Old rigs were drafted in "room watts" (render.py POWER = 1/40). The
 *  transcription below applies that scale ONCE, here, so every later
 *  consumer sees true watts and the constant can die. */
const roomW = (w: number) => watts(w / 40);

// Numbers for petg/pla-matte are the calibrated FINISHES from the old twin
// (gloss incl. aniso 0.25 from render.py). pla-basic / pla-silk are starting
// estimates to calibrate against Cycles stills — marked, not invented-quietly.
export const FILAMENT_PRESETS: Record<FilamentPresetId, { label: string; recipe: FilamentRecipe }> = {
  "petg-basic": { label: "PETG Basic", recipe: {
    colorHex: "#1c1c1c", ior: 1.57, anisotropy: 0.25, vary: 1.0,
    roughness: { 0: 0.21, 1: 0.24, 2: 0.36, 3: 0.50 }, peiRough: 0.42, peiFarRough: 0.55 } },
  "pla-matte": { label: "PLA Matte", recipe: {
    colorHex: "#2a2a2a", ior: 1.46, anisotropy: 0.10, vary: 0.5,
    roughness: { 0: 0.74, 1: 0.62, 2: 0.80, 3: 0.85 }, peiRough: 0.66, peiFarRough: 0.74 } },
  "pla-basic": { label: "PLA Basic", recipe: { // TODO calibrate vs Cycles
    colorHex: "#1c1c1c", ior: 1.46, anisotropy: 0.15, vary: 0.8,
    roughness: { 0: 0.38, 1: 0.34, 2: 0.48, 3: 0.58 }, peiRough: 0.48, peiFarRough: 0.60 } },
  "pla-silk": { label: "PLA Silk", recipe: { // TODO calibrate vs Cycles
    colorHex: "#3a3a40", ior: 1.46, anisotropy: 0.45, vary: 0.9,
    roughness: { 0: 0.16, 1: 0.20, 2: 0.30, 3: 0.44 }, peiRough: 0.40, peiFarRough: 0.52 } },
};

/** Studio aim heights etc. are solved in scene.ts; a look is only lights +
 *  backdrop + world. Positions were Cartesian in the old RIGS; here they are
 *  transcribed to azimuth/elevation/distance about C=(0,0,0.09) once. */
// TODO: transcribe all five rigs; "studio" shown as the pattern.
const TRANSCRIBE: Studio = null as never; // placeholder until each rig lands
export const LOOK_PRESETS: Record<LookId, { label: string; studio: Studio }> = {
  studio: { label: "Studio", studio: {
    backdrop: { color: [0.55, 0.55, 0.55], roughness: 0.55 },
    world: { hdrId: "studio_small_09_1k", strength: 0.25, rotationDeg: deg(30) },
    floorCards: null,
    lights: [
      { kind: "area", id: "key-top", name: "Top softbox", on: true, partOnly: false,
        azimuth: deg(180), elevation: deg(84), distance: m(0.92), shape: "rect",
        width: m(1.2), height: m(0.9), color: { kind: "kelvin", kelvin: kelvin(6500) },
        powerW: roomW(500), spreadDeg: deg(180) },
      { kind: "scrim", id: "scrim-r", name: "Right gradient", on: true, partOnly: false,
        azimuth: deg(69), elevation: deg(22), distance: m(0.97), shape: "rect",
        width: m(1.4), height: m(1.8), color: { kind: "rgb", rgb: [1, 1, 1] },
        topRadiance: 3.0, bottomRadiance: 0.15 },
      // TODO: left strip 160, rim 160, front 120 (old `light` rig)
    ] } },
  dark:     { label: "Dark",     studio: TRANSCRIBE }, // rim strips + scrims partOnly:true
  gradient: { label: "Gradient", studio: TRANSCRIBE }, // incl. floorCards {3.5, 0.05, -90}
  rim:      { label: "Rim",      studio: TRANSCRIBE }, // incl. floorCards {0.8, 0, -90}
  raking:   { label: "Raking",   studio: TRANSCRIBE },
};

export const FOCAL_PRESETS_MM = [24, 35, 50, 85, 100, 135] as const;
export const ASPECT_PRESETS = [
  { label: "4:5", w: 4, h: 5 }, { label: "1:1", w: 1, h: 1 },
  { label: "3:2", w: 3, h: 2 }, { label: "16:9", w: 16, h: 9 },
] as const;
