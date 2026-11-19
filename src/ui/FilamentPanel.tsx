import {
  BED_TYPES, BOUNDS, DEFAULT_GLOSS, DEFAULT_IMPERFECTIONS, FILAMENT_PRESET_IDS, OVERLAYS,
  type FeatureCode, type FilamentChoice, type FilamentRecipe,
} from "../document";
import { applyFilamentPreset } from "../edits";
import { FILAMENT_PRESETS } from "../presets";
import { ColorField, Fold, Group, Scope, Select, Slider, linear, type Option } from "./controls";
import { useDoc, useEdit } from "./host";
import { titleCase } from "./model";

const GLOSS = linear(BOUNDS.gloss);
const IOR = linear(BOUNDS.ior);
const ANISOTROPY = linear(BOUNDS.anisotropy);
const ROUGHNESS = linear(BOUNDS.roughness);
const VARY = linear(BOUNDS.vary);
const IMPERFECTION = linear(BOUNDS.imperfection);
const COOLING_TAU = linear(BOUNDS.coolingTauS);
const FAN = linear(BOUNDS.fanCooling);

const PRESETS: Option<(typeof FILAMENT_PRESET_IDS)[number]>[] = FILAMENT_PRESET_IDS.map((id) => ({ value: id, label: FILAMENT_PRESETS[id].label }));
const BEDS: Option<FilamentChoice["bed"]>[] = [
  { value: "auto", label: "Auto, from the file" },
  ...BED_TYPES.map((value) => ({ value, label: value === "textured-pei" ? "Textured PEI" : "Smooth" })),
];
const OVERLAY_OPTIONS: Option<FilamentChoice["imperfections"]["overlay"]>[] = OVERLAYS.map((value) => ({ value, label: titleCase(value) }));

const FEATURES: readonly { code: FeatureCode; label: string }[] = [
  { code: 0, label: "Walls" }, { code: 1, label: "Top surface" }, { code: 2, label: "Bridges" }, { code: 3, label: "Bottom" },
];

export function FilamentPanel() {
  const { filament: f } = useDoc();
  const edit = useEdit();
  const preset = f.presetId === null ? null : FILAMENT_PRESETS[f.presetId].recipe;
  const setRecipe = (change: (r: FilamentRecipe) => void) => { edit((d) => { change(d.filament.recipe); }); };
  const setFilament = (change: (x: FilamentChoice) => void) => { edit((d) => { change(d.filament); }); };
  const setImperfection = (change: (x: FilamentChoice["imperfections"]) => void) => { edit((d) => { change(d.filament.imperfections); }); };

  return (
    <>
      <Select label="Preset" value={f.presetId ?? ""} options={PRESETS}
        hint="Copies the preset's colour, finish and gloss in. Edits afterwards keep the preset as the thing to reset to."
        onChange={(id) => { edit(applyFilamentPreset(id)); }} />
      <ColorField label="Colour" value={f.recipe.colorHex} onChange={(hex) => { setRecipe((r) => { r.colorHex = hex; }); }} />
      <Slider label="Gloss" mapping={GLOSS} value={f.gloss} defaultValue={DEFAULT_GLOSS}
        hint="Shifts every roughness below on one curve. The middle leaves the preset as calibrated."
        onChange={(v) => { setFilament((x) => { x.gloss = v; }); }} />

      <Fold title="Advanced">
        <Group title="Material">
          <Slider label="IOR" mapping={IOR} value={f.recipe.ior} defaultValue={preset?.ior}
            hint="Index of refraction. 1.46 to 1.57 covers common filaments."
            onChange={(v) => { setRecipe((r) => { r.ior = v; }); }} />
          <Slider label="Anisotropy" mapping={ANISOTROPY} value={f.recipe.anisotropy} defaultValue={preset?.anisotropy}
            hint="Stretches highlights along the print lines."
            onChange={(v) => { setRecipe((r) => { r.anisotropy = v; }); }} />
          <Slider label="Layer variation" mapping={VARY} value={f.recipe.vary} defaultValue={preset?.vary}
            hint="How much the sheen differs from layer to layer."
            onChange={(v) => { setRecipe((r) => { r.vary = v; }); }} />
        </Group>

        <Scope name="Roughness">
          <Group title="Roughness by feature">
            {FEATURES.map(({ code, label }) => (
              <Slider key={code} label={label} mapping={ROUGHNESS} value={f.recipe.roughness[code]} defaultValue={preset?.roughness[code]}
                onChange={(v) => { setRecipe((r) => { r.roughness[code] = v; }); }} />
            ))}
          </Group>
        </Scope>

        <Group title="Build plate">
          <Select label="Bed" value={f.bed} options={BEDS}
            hint="The plate face of the print takes its texture from the bed."
            onChange={(bed) => { setFilament((x) => { x.bed = bed; }); }} />
          <Slider label="Plate roughness" mapping={ROUGHNESS} value={f.recipe.peiRough} defaultValue={preset?.peiRough}
            onChange={(v) => { setRecipe((r) => { r.peiRough = v; }); }} />
          <Slider label="Plate far roughness" mapping={ROUGHNESS} value={f.recipe.peiFarRough} defaultValue={preset?.peiFarRough}
            hint="The plate face's roughness at grazing angles."
            onChange={(v) => { setRecipe((r) => { r.peiFarRough = v; }); }} />
        </Group>

        <Scope name="Imperfections">
          <Group title="Print imperfections">
            <Slider label="Heat gloss" mapping={IMPERFECTION} value={f.imperfections.heatGloss} defaultValue={DEFAULT_IMPERFECTIONS.heatGloss}
              hint="Layers that stayed warm come out glossier."
              onChange={(v) => { setImperfection((x) => { x.heatGloss = v; }); }} />
            <Slider label="Soft lines" mapping={IMPERFECTION} value={f.imperfections.softLines} defaultValue={DEFAULT_IMPERFECTIONS.softLines}
              hint="Warm layers get shallower grooves."
              onChange={(v) => { setImperfection((x) => { x.softLines = v; }); }} />
            <Slider label="Speed gloss" mapping={IMPERFECTION} value={f.imperfections.speedGloss} defaultValue={DEFAULT_IMPERFECTIONS.speedGloss}
              hint="Fast walls come out rougher."
              onChange={(v) => { setImperfection((x) => { x.speedGloss = v; }); }} />
            <Slider label="Cooling time" unit="s" mapping={COOLING_TAU} value={f.imperfections.tauS} defaultValue={DEFAULT_IMPERFECTIONS.tauS}
              onChange={(v) => { setImperfection((x) => { x.tauS = v; }); }} />
            <Slider label="Fan cooling" unit="x" mapping={FAN} value={f.imperfections.fanCooling} defaultValue={DEFAULT_IMPERFECTIONS.fanCooling}
              onChange={(v) => { setImperfection((x) => { x.fanCooling = v; }); }} />
            <Select label="Overlay" value={f.imperfections.overlay} options={OVERLAY_OPTIONS}
              hint="A false-colour view of the heat or speed model. The preview only: a photo is never overlaid."
              onChange={(overlay) => { setImperfection((x) => { x.overlay = overlay; }); }} />
          </Group>
        </Scope>
      </Fold>
    </>
  );
}
