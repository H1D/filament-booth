/**
 * edits.ts: the named edits. Each returns a mutator for `booth.update`,
 * which stays the only write path. An edit that must keep an invariant
 * (a focal length change keeps the framing, a look replaces the whole
 * studio) lives here, so panels never hand-write it.
 */
import type { BoothDocument, FilamentPresetId, LookId, StudioLight, Vec3 } from "./document";

export type Edit = (draft: BoothDocument) => void;

/** Copies the look's lights, backdrop, world and floor cards in, and records it as lookBase. */
export function applyLook(id: LookId): Edit {
  throw new Error("not implemented");
}

/** Copies the preset's recipe and default gloss in. */
export function applyFilamentPreset(id: FilamentPresetId): Edit {
  throw new Error("not implemented");
}

/** Changes the focal length and moves the camera so the framing stays (scene.refocal). */
export function setFocal(focalMm: number): Edit {
  throw new Error("not implemented");
}

/** Click to focus: a part-local point from the viewport. Null focuses on the orbit target. */
export function focusAt(partPoint: Vec3 | null): Edit {
  throw new Error("not implemented");
}

/** Adds a softbox with a fresh id at a default placement. */
export function addLight(kind: StudioLight["kind"]): Edit {
  throw new Error("not implemented");
}

export function removeLight(id: string): Edit {
  throw new Error("not implemented");
}

/** Patches one light. A patch cannot change its `kind`. */
export function patchLight(id: string, patch: Partial<Omit<StudioLight, "id" | "kind">>): Edit {
  throw new Error("not implemented");
}
