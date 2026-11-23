import { AGX_LOOKS, BOUNDS, OPTICS_PRESET_IDS, REST_FACES, deg, type AgxLook, type FilmOptics, type OpticsPresetId, type Pose } from "../document";
import { applyOpticsPreset } from "../edits";
import { OPTICS_PRESETS } from "../presets";
import { Group, Scope, Select, Slider, Switch, type Option } from "./controls";
import { linear, logarithmic } from "./mappings";
import { useDoc, useEdit, useScene } from "./hooks";
import { DEFAULTS, formatDuration, isSame, titleCase } from "./model";

const TURNTABLE = linear(BOUNDS.turntableDeg);
const LONG_EDGE = linear(BOUNDS.longEdgePx);
const SAMPLES = logarithmic(BOUNDS.samples);
const OPTICS = linear(BOUNDS.optics);
const OPTICS_WARMTH = linear(BOUNDS.opticsWarmth);

const OPTICS_OPTIONS: Option<OpticsPresetId>[] = OPTICS_PRESET_IDS.map((id) => ({ value: id, label: OPTICS_PRESETS[id].label }));

function opticsPresetOf(optics: FilmOptics): OpticsPresetId | null {
  return OPTICS_PRESET_IDS.find((id) => isSame(optics, OPTICS_PRESETS[id].optics)) ?? null;
}

/** The limits on offer, in seconds. 0 is no limit. */
const TIME_LIMITS_S = [0, 30, 60, 120, 300, 600, 1200, 1800, 3600] as const;

/** The offered limits, plus the stored one when it is not among them (an imported setup), so it shows and survives. */
function timeLimitOptions(storedS: number): Option<string>[] {
  const seconds = TIME_LIMITS_S.includes(storedS as (typeof TIME_LIMITS_S)[number])
    ? [...TIME_LIMITS_S]
    : [...TIME_LIMITS_S, storedS].sort((a, b) => a - b);
  return seconds.map((s) => ({ value: String(s), label: s === 0 ? "No limit" : formatDuration(s) }));
}

const FACE_LABELS: Record<Pose["restFace"], string> = {
  plate: "Plate, as printed", top: "Top", front: "Front", back: "Back", left: "Left", right: "Right",
};
const FACES: Option<Pose["restFace"]>[] = REST_FACES.map((value) => ({ value, label: FACE_LABELS[value] }));
const LOOKS: Option<AgxLook>[] = AGX_LOOKS.map((value) => ({ value, label: titleCase(value) }));

export function PosePanel() {
  const { pose } = useDoc();
  const edit = useEdit();
  return (
    <>
      <Slider label="Turntable" unit="°" mapping={TURNTABLE} value={pose.turntableDeg} defaultValue={DEFAULTS.pose.turntableDeg}
        hint="Turns the part on the floor. The camera and lights stay where they are."
        onChange={(v) => { edit((d) => { d.pose.turntableDeg = deg(v); }); }} />
      <Select label="Rest face" value={pose.restFace} options={FACES}
        hint="Which printed face lies on the floor. Faces are named as the default camera sees the part as printed."
        onChange={(face) => { edit((d) => { d.pose.restFace = face; }); }} />
    </>
  );
}

export function OutputPanel() {
  const { output } = useDoc();
  const { film } = useScene();
  const edit = useEdit();
  const megapixels = (film.width * film.height) / 1e6;
  return (
    <>
      <Slider label="Long edge" unit="px" mapping={LONG_EDGE} value={output.longEdgePx} defaultValue={DEFAULTS.output.longEdgePx}
        hint="1600 px suits a marketplace listing: Amazon zooms images from 1000 px and recommends 1600 or more. Go larger for print."
        onChange={(v) => { edit((d) => { d.output.longEdgePx = v; }); }} />
      <p className="readout size" aria-live="polite">
        {film.width} by {film.height} px, {megapixels.toFixed(1)} megapixels
      </p>
      <Slider label="Samples" mapping={SAMPLES} value={output.samples} defaultValue={DEFAULTS.output.samples}
        hint="The quality you are aiming for. More samples means less noise and a longer wait. With Denoise on, 32 holds up in a listing's full-size zoom. Go higher for print or close-ups. The time limit below caps the wait."
        onChange={(v) => { edit((d) => { d.output.samples = v; }); }} />
      <Select label="Time limit" value={String(output.timeLimitS)} options={timeLimitOptions(output.timeLimitS)}
        hint="The longest a photo may take. When the time is up, the photo is made from the samples taken so far, so it may be a little noisier than the target. It stops sooner if the samples are done first. A photo can also be finished early."
        onChange={(s) => { edit((d) => { d.output.timeLimitS = Number(s); }); }} />
      <Select label="AgX look" value={output.viewTransform.look} options={LOOKS}
        hint="The contrast curve applied when the photo is developed."
        onChange={(look) => { edit((d) => { d.output.viewTransform = { kind: "agx", look }; }); }} />
      <Scope name="Lens and film">
        <Group title="Lens and film">
          <Select label="Profile" value={opticsPresetOf(output.optics) ?? ""} options={OPTICS_OPTIONS}
            hint="Copies subtle camera lens and sensor imperfections into the sliders below. Clean leaves Cycles and AgX untouched."
            onChange={(id) => { edit(applyOpticsPreset(id)); }} />
          <Slider label="Grain" mapping={OPTICS} value={output.optics.grain} defaultValue={DEFAULTS.output.optics.grain}
            hint="Sensor ISO grain, stronger in shadows and muted in highlights."
            onChange={(v) => { edit((d) => { d.output.optics.grain = v; }); }} />
          <Slider label="Glare" mapping={OPTICS} value={output.optics.glare} defaultValue={DEFAULTS.output.optics.glare}
            hint="Optical highlight bloom and veiling glare in linear light before AgX."
            onChange={(v) => { edit((d) => { d.output.optics.glare = v; }); }} />
          <Slider label="Vignette" mapping={OPTICS} value={output.optics.vignette} defaultValue={DEFAULTS.output.optics.vignette}
            hint="Natural light falloff towards the corners of the lens."
            onChange={(v) => { edit((d) => { d.output.optics.vignette = v; }); }} />
          <Slider label="Chromatic" mapping={OPTICS} value={output.optics.chromatic} defaultValue={DEFAULTS.output.optics.chromatic}
            hint="Subtle lateral red and blue colour fringing towards the frame edges."
            onChange={(v) => { edit((d) => { d.output.optics.chromatic = v; }); }} />
          <Slider label="Softness" mapping={OPTICS} value={output.optics.softness} defaultValue={DEFAULTS.output.optics.softness}
            hint="Optical lens softness, sharpest at the centre and slightly softer at the corners."
            onChange={(v) => { edit((d) => { d.output.optics.softness = v; }); }} />
          <Slider label="Warmth" mapping={OPTICS_WARMTH} value={output.optics.warmth} defaultValue={DEFAULTS.output.optics.warmth}
            hint="White-balance drift from cool to warm."
            onChange={(v) => { edit((d) => { d.output.optics.warmth = v; }); }} />
        </Group>
      </Scope>
      <Switch label="Transparent background" checked={output.transparentBackground}
        hint="Keeps the part and its shadow and drops the backdrop."
        onChange={(on) => { edit((d) => { d.output.transparentBackground = on; }); }} />
      <Switch label="Denoise" checked={output.denoise}
        hint="Cleans the leftover noise out of the finished photo with Intel Open Image Denoise, as Blender does, so fewer samples look clean. Runs on the graphics card once sampling ends."
        onChange={(on) => { edit((d) => { d.output.denoise = on; }); }} />
    </>
  );
}
