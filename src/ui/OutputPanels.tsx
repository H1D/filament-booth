import { AGX_LOOKS, BOUNDS, REST_FACES, deg, type AgxLook, type Pose } from "../document";
import { Select, Slider, Switch, linear, logarithmic, type Option } from "./controls";
import { useDoc, useEdit, useScene } from "./host";
import { DEFAULTS, titleCase } from "./model";

const TURNTABLE = linear(BOUNDS.turntableDeg);
const LONG_EDGE = linear(BOUNDS.longEdgePx);
const SAMPLES = logarithmic(BOUNDS.samples);

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
        onChange={(v) => { edit((d) => { d.output.longEdgePx = v; }); }} />
      <p className="readout size" aria-live="polite">
        {film.width} by {film.height} px, {megapixels.toFixed(1)} megapixels
      </p>
      <Slider label="Samples" mapping={SAMPLES} value={output.samples} defaultValue={DEFAULTS.output.samples}
        hint="More samples means less noise and a longer wait. A photo can be finished early."
        onChange={(v) => { edit((d) => { d.output.samples = v; }); }} />
      <Select label="AgX look" value={output.viewTransform.look} options={LOOKS}
        hint="The contrast curve applied when the photo is developed."
        onChange={(look) => { edit((d) => { d.output.viewTransform = { kind: "agx", look }; }); }} />
      <Switch label="Transparent background" checked={output.transparentBackground}
        hint="Keeps the part and its shadow and drops the backdrop."
        onChange={(on) => { edit((d) => { d.output.transparentBackground = on; }); }} />
      <Switch label="Denoise" checked={output.denoise}
        onChange={(on) => { edit((d) => { d.output.denoise = on; }); }} />
    </>
  );
}
