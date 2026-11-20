/**
 * model.ts: what each rail section means, as data.
 *
 * A section is "modified" when its values differ from what a reset would
 * restore, and that reset is an Edit. Both live in this one table, so the
 * marker and the button cannot disagree about what "default" is. A look's
 * sections compare against the look the studio was copied from. The filament
 * compares against its preset. Everything else compares against the default
 * document.
 */
import {
  DEFAULT_IMPERFECTIONS, DEFAULT_SLICE, defaultDocument,
  type BoothDocument, type LookId, type StudioLight,
} from "../document";
import { applyFilamentPreset, setFocal, type Edit } from "../edits";
import { LOOK_PRESETS } from "../presets";
import type { PrintSource, PrintState } from "../print";

export const SECTION_IDS = ["part", "filament", "lights", "props", "world", "camera", "pose", "output", "setup", "agent"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_TITLES: Record<SectionId, string> = {
  part: "Part and slicing",
  filament: "Filament",
  lights: "Lights",
  props: "Props",
  world: "Backdrop and world",
  camera: "Camera",
  pose: "Pose",
  output: "Output",
  setup: "Setup",
  agent: "Agent",
};

export const DEFAULTS: Readonly<BoothDocument> = defaultDocument();

/** Deep equality for plain JSON data. */
export function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => isSame(x, b[i]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && isSame(Reflect.get(a, k), Reflect.get(b, k)));
}

/** "monotonic-line" to "Monotonic line". */
export function titleCase(id: string): string {
  const spaced = id.replaceAll("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---- print state ------------------------------------------------------------------

export function printSource(print: PrintState): PrintSource | null {
  switch (print.status) {
    case "empty": return null;
    case "loading": return print.source;
    case "ready": return print.loaded.source;
    case "error": return print.loaded?.source ?? null;
  }
}

export function sourceName(source: PrintSource): string {
  if (source.kind === "bin") return decodeURIComponent(source.url.split(/[?#]/)[0].split("/").pop() ?? source.url);
  return source.file.name;
}

/**
 * Slicing values can be edited only for an STL the booth slices itself. With
 * nothing open they stay editable, because they apply to the next STL.
 */
export function slicingEditable(print: PrintState): boolean {
  switch (print.status) {
    case "empty": return true;
    case "loading": return print.source.kind === "stl";
    case "ready": return print.loaded.sliced.settingsSource === "booth";
    case "error": return print.loaded === null || print.loaded.sliced.settingsSource === "booth";
  }
}

const STAGE_LABELS: Readonly<Record<string, string>> = {
  reading: "Reading the file",
  slicing: "Slicing",
  parsing: "Reading the toolpaths",
  walls: "Finding the exposed walls",
  sweeping: "Building the beads",
};

/** The pipeline's stage word as a short phrase. An unknown stage is shown as it came. */
export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? titleCase(stage);
}

// ---- looks --------------------------------------------------------------------------

export function lookStudio(base: LookId | null): BoothDocument["studio"] | null {
  return base === null ? null : LOOK_PRESETS[base].studio;
}

/** The light a look has under this id, the baseline a light's sliders reset to. */
export function lookLight(base: LookId | null, id: string, kind: StudioLight["kind"]): StudioLight | null {
  const found = lookStudio(base)?.lights.find((l) => l.id === id);
  return found !== undefined && found.kind === kind ? found : null;
}

// ---- section state ------------------------------------------------------------------

export interface SectionContext {
  readonly doc: BoothDocument;
  readonly print: PrintState;
  /** Booth.filamentModified, derived there. */
  readonly filamentModified: boolean;
}

export interface SectionState {
  readonly modified: boolean;
  /** Null when the section has nothing to reset, or here cannot be reset. */
  readonly reset: Edit | null;
}

const outputWithoutAspect = (o: BoothDocument["output"]) => ({ ...o, aspect: null });

const resetSlicing: Edit = (d) => { d.slicing = { ...DEFAULT_SLICE }; };

const resetFilament = (presetId: BoothDocument["filament"]["presetId"]): Edit => (d) => {
  applyFilamentPreset(presetId ?? DEFAULTS.filament.presetId ?? "petg-basic")(d);
  d.filament.imperfections = { ...DEFAULT_IMPERFECTIONS };
  d.filament.bed = "auto";
};

const resetLights = (base: LookId): Edit => (d) => { d.studio.lights = structuredClone(LOOK_PRESETS[base].studio.lights); };

const resetWorld = (base: LookId): Edit => (d) => {
  const look = LOOK_PRESETS[base].studio;
  d.studio.backdrop = structuredClone(look.backdrop);
  d.studio.world = structuredClone(look.world);
  d.studio.floorCards = structuredClone(look.floorCards);
};

/** The focal length goes through setFocal, so resetting it keeps the framing like the slider does. */
const resetCamera: Edit = (d) => {
  setFocal(DEFAULTS.camera.focalMm)(d);
  d.camera.fStop = DEFAULTS.camera.fStop;
  d.camera.focusPartPoint = null;
  d.output.aspect = { ...DEFAULTS.output.aspect };
};

const resetPose: Edit = (d) => { d.pose = { ...DEFAULTS.pose }; };

const resetOutput: Edit = (d) => {
  const { aspect } = d.output;
  d.output = { ...structuredClone(DEFAULTS.output), aspect };
};

export function sectionState(id: SectionId, ctx: SectionContext): SectionState {
  const { doc } = ctx;
  const look = lookStudio(doc.lookBase);
  switch (id) {
    case "part": {
      const editable = slicingEditable(ctx.print);
      return { modified: editable && !isSame(doc.slicing, DEFAULT_SLICE), reset: editable ? resetSlicing : null };
    }
    case "filament": {
      const f = doc.filament;
      const modified = ctx.filamentModified || f.presetId === null
        || !isSame(f.imperfections, DEFAULT_IMPERFECTIONS) || f.bed !== "auto";
      return { modified, reset: resetFilament(f.presetId) };
    }
    case "lights":
      return doc.lookBase === null || look === null
        ? { modified: false, reset: null }
        : { modified: !isSame(doc.studio.lights, look.lights), reset: resetLights(doc.lookBase) };
    case "world":
      return doc.lookBase === null || look === null
        ? { modified: false, reset: null }
        : {
          modified: !isSame(doc.studio.backdrop, look.backdrop) || !isSame(doc.studio.world, look.world)
            || !isSame(doc.studio.floorCards, look.floorCards),
          reset: resetWorld(doc.lookBase),
        };
    case "camera": {
      const c = doc.camera;
      const d = DEFAULTS.camera;
      return {
        modified: c.focalMm !== d.focalMm || c.fStop !== d.fStop || c.focusPartPoint !== null
          || !isSame(doc.output.aspect, DEFAULTS.output.aspect),
        reset: resetCamera,
      };
    }
    case "pose":
      return { modified: !isSame(doc.pose, DEFAULTS.pose), reset: resetPose };
    case "output":
      return {
        modified: !isSame(outputWithoutAspect(doc.output), outputWithoutAspect(DEFAULTS.output)),
        reset: resetOutput,
      };
    case "props":
    case "setup":
    case "agent":
      return { modified: false, reset: null };
  }
}

/**
 * A length of time in plain words: "30 seconds", "5 minutes", "1 hour". With
 * `attributive` it reads before a noun: "the 5 minute limit".
 */
export function formatDuration(seconds: number, attributive = false): string {
  const s = Math.round(seconds);
  const unit = (n: number, name: string) => `${n} ${name}${n === 1 || attributive ? "" : "s"}`;
  if (s < 60) return unit(s, "second");
  if (s % 3600 === 0) return unit(s / 3600, "hour");
  if (s % 60 === 0) return unit(s / 60, "minute");
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function formatEta(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `about ${s} s left`;
  const min = Math.floor(s / 60);
  return `about ${min} min ${s % 60} s left`;
}
