/**
 * edits.ts: the named edits. Each returns a mutator for `booth.update`,
 * which stays the only write path. An edit that must keep an invariant
 * (a focal length change keeps the framing, a look replaces the whole
 * studio) lives here, so panels never hand-write it.
 */
import {
  DEFAULT_GLOSS, deg, m, watts,
  type AreaLight, type BoothDocument, type FilamentPresetId, type LookId, type ScrimLight, type StudioLight, type Vec3,
} from "./document";
import { FILAMENT_PRESETS, LOOK_PRESETS } from "./presets";
import { refocal } from "./scene";

export type Edit = (draft: BoothDocument) => void;

/** Copies the look's lights, backdrop, world and floor cards in, and records it as lookBase. */
export function applyLook(id: LookId): Edit {
  return (draft) => {
    draft.studio = structuredClone(LOOK_PRESETS[id].studio);
    draft.lookBase = id;
  };
}

/** Copies the preset's recipe and default gloss in. Imperfections and bed stay: they are not part of a preset. */
export function applyFilamentPreset(id: FilamentPresetId): Edit {
  return (draft) => {
    draft.filament.presetId = id;
    draft.filament.recipe = structuredClone(FILAMENT_PRESETS[id].recipe);
    draft.filament.gloss = DEFAULT_GLOSS;
  };
}

/** Changes the focal length and moves the camera so the framing stays (scene.refocal). */
export function setFocal(focalMm: number): Edit {
  return (draft) => {
    draft.camera = refocal(draft.camera, focalMm);
  };
}

/** Click to focus: a part-local point from the viewport. Null focuses on the orbit target. */
export function focusAt(partPoint: Vec3 | null): Edit {
  return (draft) => {
    draft.camera.focusPartPoint = partPoint === null ? null : [partPoint[0], partPoint[1], partPoint[2]];
  };
}

/** Lights closer than this (metres, both placed about the same aim) count as the same place. */
const COINCIDENT_M = 0.15;
const PLACEMENT_ELEVATIONS_DEG = [35, 60, 15] as const;
const PLACEMENT_AZIMUTH_STEP_DEG = 30;

function offsetOf(light: Pick<StudioLight, "azimuth" | "elevation" | "distance">): [number, number, number] {
  const az = (light.azimuth * Math.PI) / 180;
  const el = (light.elevation * Math.PI) / 180;
  return [
    light.distance * Math.sin(az) * Math.cos(el),
    -light.distance * Math.cos(az) * Math.cos(el),
    light.distance * Math.sin(el),
  ];
}

/** First spot on a spiral of rings that no existing light sits on. Widening the
 *  ring each lap guarantees one exists. */
function freePlacement(existing: readonly StudioLight[], baseDistance: number): Pick<StudioLight, "azimuth" | "elevation" | "distance"> {
  const taken = existing.map(offsetOf);
  for (let ring = 0; ; ring++) {
    const distance = m(baseDistance + 0.2 * ring);
    for (const elevation of PLACEMENT_ELEVATIONS_DEG) {
      for (let az = 0; az < 360; az += PLACEMENT_AZIMUTH_STEP_DEG) {
        const spot = { azimuth: deg(az > 180 ? az - 360 : az), elevation: deg(elevation), distance };
        const [x, y, z] = offsetOf(spot);
        if (taken.every(([tx, ty, tz]) => Math.hypot(x - tx, y - ty, z - tz) >= COINCIDENT_M)) return spot;
      }
    }
  }
}

function freeId(existing: readonly StudioLight[], kind: StudioLight["kind"]): { id: string; n: number } {
  const used = new Set(existing.map((l) => l.id));
  for (let n = 1; ; n++) {
    const id = `${kind}-${n}`;
    if (!used.has(id)) return { id, n };
  }
}

/** Adds a softbox or a scrim with a fresh id, on a spot no other light occupies. */
export function addLight(kind: StudioLight["kind"]): Edit {
  return (draft) => {
    const lights = draft.studio.lights;
    const { id, n } = freeId(lights, kind);
    const white = { kind: "rgb", rgb: [1, 1, 1] } as const;
    if (kind === "area") {
      const softbox: AreaLight = {
        kind, id, name: `Softbox ${n}`, on: true, partOnly: false,
        ...freePlacement(lights, 1), shape: "rect", width: m(0.6), height: m(0.6), color: white,
        powerW: watts(4), spreadDeg: deg(180),
      };
      lights.push(softbox);
    } else {
      const scrim: ScrimLight = {
        kind, id, name: `Scrim ${n}`, on: true, partOnly: false,
        ...freePlacement(lights, 1), shape: "rect", width: m(1.4), height: m(1.8), color: white,
        topRadiance: 2, bottomRadiance: 0.2,
      };
      lights.push(scrim);
    }
  };
}

/** Removing a light that is already gone changes nothing. */
export function removeLight(id: string): Edit {
  return (draft) => {
    draft.studio.lights = draft.studio.lights.filter((l) => l.id !== id);
  };
}

type PatchOf<L extends StudioLight> = Partial<Omit<L, "id" | "kind">>;
/** Omit over the union would keep only the fields both kinds share, so it is applied per kind. */
export type LightPatch = PatchOf<AreaLight> | PatchOf<ScrimLight>;

/**
 * Patches one light. `id` and `kind` in the patch are ignored, so a panel can
 * spread a whole light into it. Patching a light that is gone changes nothing.
 */
export function patchLight(id: string, patch: LightPatch): Edit {
  return (draft) => {
    const lights = draft.studio.lights;
    const i = lights.findIndex((l) => l.id === id);
    if (i < 0) return;
    const light = lights[i];
    lights[i] = light.kind === "area"
      ? { ...light, ...patch, id: light.id, kind: "area" }
      : { ...light, ...patch, id: light.id, kind: "scrim" };
  };
}
