import { BOUNDS, deg, m } from "../document";
import { focusAt, setFocal } from "../edits";
import { ASPECT_PRESETS, FOCAL_PRESETS_MM } from "../presets";
import { framePart } from "../scene";
import { Fold, Group, Note, Segmented, Slider, type Option } from "./controls";
import { ladder, linear } from "./mappings";
import { useDoc, useEdit, useHost, useScene, useUi } from "./hooks";
import { Icon } from "./icons";
import { DEFAULTS } from "./model";

const FOCAL = linear(BOUNDS.focalMm);
const AZIMUTH = linear(BOUNDS.azimuth);
const ELEVATION = linear(BOUNDS.elevation);
const DISTANCE = linear(BOUNDS.cameraDistance);

/** The marked third-stop scale, f/1 to f/64. The standard full stops are every third entry from f/1. */
const F_STOPS = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22,
  25, 29, 32, 36, 40, 45, 51, 57, 64,
] as const;
const APERTURE = ladder(F_STOPS, BOUNDS.fStop);

const FOCALS: Option<string>[] = FOCAL_PRESETS_MM.map((mmValue) => ({ value: String(mmValue), label: String(mmValue) }));
const ASPECTS: Option<string>[] = ASPECT_PRESETS.map((a) => ({ value: a.label, label: a.label }));

type Aspect = { w: number; h: number };

/** The preset whose ratio matches, in either orientation. */
function presetOf(aspect: Aspect): string | null {
  const match = ASPECT_PRESETS.find((p) => (p.w === aspect.w && p.h === aspect.h) || (p.w === aspect.h && p.h === aspect.w));
  return match?.label ?? null;
}

/** A preset keeps the frame's orientation: a landscape frame stays landscape when the ratio changes.
 *  A square frame has none, so it takes the preset as labelled. */
function applyAspect(label: string, current: Aspect): Aspect {
  const preset = ASPECT_PRESETS.find((p) => p.label === label);
  if (preset === undefined) return current;
  if (current.w === current.h) return { w: preset.w, h: preset.h };
  const short = Math.min(preset.w, preset.h);
  const long = Math.max(preset.w, preset.h);
  return current.w > current.h ? { w: long, h: short } : { w: short, h: long };
}

const orientation = (a: Aspect): string => (a.w === a.h ? "square" : a.w > a.h ? "landscape" : "portrait");

export function CameraPanel() {
  const doc = useDoc();
  const scene = useScene();
  const ui = useUi();
  const { ui: uiStore } = useHost();
  const edit = useEdit();
  const { camera: c, output } = doc;
  const preset = presetOf(output.aspect);
  const mesh = scene.part?.mesh ?? null;
  const point = c.focusPartPoint;

  return (
    <>
      <Group title="Lens">
        <Segmented label="Focal length (mm)" value={FOCAL_PRESETS_MM.some((v) => v === c.focalMm) ? String(c.focalMm) : null} options={FOCALS}
          hint="Changing the lens keeps the framing: the camera moves back or in to match."
          onChange={(v) => { edit(setFocal(Number(v))); }} />
        <Slider label="Focal length" unit="mm" mapping={FOCAL} value={c.focalMm} defaultValue={DEFAULTS.camera.focalMm}
          onChange={(v) => { edit(setFocal(v)); }} />
        <Slider label="Aperture" prefix="f/" mapping={APERTURE} value={c.fStop} defaultValue={DEFAULTS.camera.fStop}
          hint="Standard third-stop scale. A wider opening blurs more of what is not in focus."
          onChange={(v) => { edit((d) => { d.camera.fStop = v; }); }} />
      </Group>

      <Group title="Focus">
        <div className="actions">
          <button type="button" className="btn" aria-pressed={ui.focusTool} data-active={ui.focusTool || undefined}
            onClick={() => { uiStore.setFocusTool(!ui.focusTool); }}>
            <Icon name="focus" />Focus on part
          </button>
          <button type="button" className="btn quiet" disabled={point === null}
            onClick={() => { edit(focusAt(null)); uiStore.setFocusTool(false); }}>
            <Icon name="close" />Clear focus
          </button>
        </div>
        <Note>
          {ui.focusTool
            ? "Click the part in the preview. Escape cancels."
            : point === null
              ? "Focused on the orbit target."
              : `Focused on the part at x ${mmText(point[0])}, y ${mmText(point[1])}, z ${mmText(point[2])} mm.`}
        </Note>
      </Group>

      <Group title="Frame">
        <Segmented label="Aspect ratio" value={preset} options={ASPECTS}
          onChange={(label) => { edit((d) => { d.output.aspect = applyAspect(label, d.output.aspect); }); }} />
        <div className="actions">
          <button type="button" className="btn" disabled={output.aspect.w === output.aspect.h}
            onClick={() => { edit((d) => { d.output.aspect = { w: d.output.aspect.h, h: d.output.aspect.w }; }); }}>
            <Icon name="rotate" />Rotate frame
          </button>
          <span className="readout">{preset ?? `${output.aspect.w}:${output.aspect.h}`} {orientation(output.aspect)}</span>
        </div>
      </Group>

      <Fold title="Orbit">
        <Slider label="Azimuth" unit="°" mapping={AZIMUTH} value={c.azimuth} defaultValue={DEFAULTS.camera.azimuth}
          hint="The same as dragging in the preview, for keyboard use and exact values."
          onChange={(v) => { edit((d) => { d.camera.azimuth = deg(v); }); }} />
        <Slider label="Elevation" unit="°" mapping={ELEVATION} value={c.elevation} defaultValue={DEFAULTS.camera.elevation}
          onChange={(v) => { edit((d) => { d.camera.elevation = deg(v); }); }} />
        <Slider label="Distance" unit="m" mapping={DISTANCE} value={c.distance}
          onChange={(v) => { edit((d) => { d.camera.distance = m(v); }); }} />
        <button type="button" className="btn" disabled={mesh === null}
          onClick={() => { if (mesh !== null) edit((d) => { Object.assign(d.camera, framePart(mesh, d.camera, d.output.aspect)); }); }}>
          Frame the part
        </button>
      </Fold>
    </>
  );
}

const mmText = (metres: number): string => (metres * 1000).toFixed(1);
