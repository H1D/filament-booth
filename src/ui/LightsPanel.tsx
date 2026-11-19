import { useEffect, useRef, useState } from "react";
import { BOUNDS, LOOK_IDS, deg, kelvin, m, watts, type LightColor, type LookId, type StudioLight } from "../document";
import { addLight, applyLook, patchLight, removeLight, type LightPatch } from "../edits";
import { LOOK_PRESETS } from "../presets";
import { kelvinToRgb } from "../scene";
import { kelvinTrack, hexToLinear, linearToHex, nearestKelvin } from "./color";
import { ColorField, Scope, Segmented, Select, Slider, Switch, type Option } from "./controls";
import { linear } from "./mappings";
import { useDoc, useEdit, useHost, useLookModified } from "./hooks";
import { Icon } from "./icons";
import { lookLight } from "./model";

const AZIMUTH = linear(BOUNDS.azimuth);
const ELEVATION = linear(BOUNDS.elevation);
const DISTANCE = linear(BOUNDS.lightDistance);
const SIZE = linear(BOUNDS.lightSize);
const POWER = linear(BOUNDS.powerW);
const RADIANCE = linear(BOUNDS.radiance);
const SPREAD = linear(BOUNDS.spreadDeg);
const KELVIN = linear(BOUNDS.kelvin);

const KELVIN_TRACK = kelvinTrack(
  BOUNDS.kelvin.slider.min, BOUNDS.kelvin.slider.max,
);

const LOOKS: Option<LookId>[] = LOOK_IDS.map((id) => ({ value: id, label: LOOK_PRESETS[id].label }));
const SHAPES: Option<StudioLight["shape"]>[] = [{ value: "rect", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }];
const COLOR_KINDS: Option<LightColor["kind"]>[] = [{ value: "kelvin", label: "Temperature" }, { value: "rgb", label: "Colour" }];

export function LightsPanel() {
  const doc = useDoc();
  const { booth } = useHost();
  const edit = useEdit();
  const modified = useLookModified();
  const [fresh, setFresh] = useState<string | null>(null);

  const add = (kind: StudioLight["kind"]) => {
    const before = new Set(doc.studio.lights.map((l) => l.id));
    edit(addLight(kind));
    setFresh(booth.doc.studio.lights.find((l) => !before.has(l.id))?.id ?? null);
  };

  return (
    <>
      <div className="look-row">
        <Segmented label="Look" value={doc.lookBase} options={LOOKS} marked={modified ? doc.lookBase : null}
          hint="A look replaces the lights, backdrop and world together."
          onChange={(id) => { edit(applyLook(id)); }} />
        {modified ? <span className="tag" data-tone="accent" title="The studio no longer matches this look">modified</span> : null}
      </div>
      <ul className="lights" aria-label="Lights">
        {doc.studio.lights.map((light) => (
          <li key={light.id}>
            <LightRow light={light} base={doc.lookBase} startOpen={light.id === fresh} />
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="btn" onClick={() => { add("area"); }}><Icon name="plus" />Add softbox</button>
        <button type="button" className="btn" onClick={() => { add("scrim"); }}><Icon name="plus" />Add scrim</button>
      </div>
    </>
  );
}

function colorKindChange(light: StudioLight, kind: LightColor["kind"]): LightColor {
  if (light.color.kind === kind) return light.color;
  return kind === "kelvin"
    ? { kind, kelvin: nearestKelvin(light.color.kind === "rgb" ? light.color.rgb : [1, 1, 1]) }
    : { kind, rgb: kelvinToRgb(light.color.kind === "kelvin" ? light.color.kelvin : 5600) };
}

function LightRow({ light, base, startOpen }: { light: StudioLight; base: LookId | null; startOpen: boolean }) {
  const edit = useEdit();
  const ref = useRef<HTMLDetailsElement>(null);
  const baseline = lookLight(base, light.id, light.kind);
  const patch = (p: LightPatch) => { edit(patchLight(light.id, p)); };

  useEffect(() => {
    if (startOpen) ref.current?.scrollIntoView({ block: "nearest" });
  }, [startOpen]);

  // The baseline is the same kind of light, so a shared field reads the same on both.
  const was = <K extends keyof StudioLight>(key: K): StudioLight[K] | undefined => baseline?.[key];
  const summary = light.kind === "area" ? `${formatWatts(light.powerW)} W` : "scrim";

  return (
    <details className="light" ref={ref} open={startOpen} data-off={!light.on || undefined} data-light={light.id}>
      <summary>
        <Icon name="chevron" />
        <span className="light-name">{light.name || "Unnamed light"}</span>
        <span className="light-meta">{summary}</span>
        <Scope name={light.name}>
          <Switch label="On" bare checked={light.on} onChange={(on) => { patch({ on }); }} />
        </Scope>
      </summary>
      <Scope name={light.name || "Light"}>
        <div className="light-body">
          <div className="row">
            <label className="row-label" htmlFor={`name-${light.id}`}>Name</label>
            <input id={`name-${light.id}`} type="text" className="text" value={light.name} spellCheck={false}
              aria-label={`${light.name}: name`} onChange={(e) => { patch({ name: e.target.value }); }} />
          </div>
          <Slider label="Elevation" unit="°" mapping={ELEVATION} value={light.elevation} defaultValue={was("elevation")}
            hint="Up from the floor, about the part."
            onChange={(v) => { patch({ elevation: deg(v) }); }} />
          <Slider label="Azimuth" unit="°" mapping={AZIMUTH} value={light.azimuth} defaultValue={was("azimuth")}
            hint="Around the part. 0 is the camera's side, 90 is to its right."
            onChange={(v) => { patch({ azimuth: deg(v) }); }} />
          <Slider label="Distance" unit="m" mapping={DISTANCE} value={light.distance} defaultValue={was("distance")}
            onChange={(v) => { patch({ distance: m(v) }); }} />
          {light.kind === "area" ? (
            <Slider label="Power" unit="W" mapping={POWER} value={light.powerW}
              defaultValue={baseline?.kind === "area" ? baseline.powerW : undefined}
              onChange={(v) => { patch({ powerW: watts(v) }); }} />
          ) : (
            <>
              <Slider label="Top radiance" mapping={RADIANCE} value={light.topRadiance}
                defaultValue={baseline?.kind === "scrim" ? baseline.topRadiance : undefined}
                onChange={(v) => { patch({ topRadiance: v }); }} />
              <Slider label="Bottom radiance" mapping={RADIANCE} value={light.bottomRadiance}
                defaultValue={baseline?.kind === "scrim" ? baseline.bottomRadiance : undefined}
                onChange={(v) => { patch({ bottomRadiance: v }); }} />
            </>
          )}
          <Slider label="Width" unit="m" mapping={SIZE} value={light.width} defaultValue={was("width")}
            onChange={(v) => { patch({ width: m(v) }); }} />
          <Slider label="Height" unit="m" mapping={SIZE} value={light.height} defaultValue={was("height")}
            onChange={(v) => { patch({ height: m(v) }); }} />
          <Select label="Shape" value={light.shape} options={SHAPES} onChange={(shape) => { patch({ shape }); }} />
          {light.kind === "area" ? (
            <Slider label="Spread" unit="°" mapping={SPREAD} value={light.spreadDeg}
              defaultValue={baseline?.kind === "area" ? baseline.spreadDeg : undefined}
              hint="How wide the beam fans out. 180 is a full hemisphere, lower is a tighter grid."
              onChange={(v) => { patch({ spreadDeg: deg(v) }); }} />
          ) : null}
          <LightColorControls light={light} onColor={(color) => { patch({ color }); }} />
          <Switch label="Part only" checked={light.partOnly} onChange={(partOnly) => { patch({ partOnly }); }}
            hint="Lights the part but not the backdrop. For rim strips that should not wash the sweep." />
          <button type="button" className="btn quiet danger" onClick={() => { edit(removeLight(light.id)); }}>
            <Icon name="remove" />Remove light
          </button>
        </div>
      </Scope>
    </details>
  );
}

function LightColorControls({ light, onColor }: { light: StudioLight; onColor: (c: LightColor) => void }) {
  const { color } = light;
  return (
    <>
      <Segmented label="Colour by" value={color.kind} options={COLOR_KINDS}
        onChange={(kind) => { onColor(colorKindChange(light, kind)); }} />
      {color.kind === "kelvin" ? (
        <Slider label="Temperature" unit="K" mapping={KELVIN} value={color.kelvin} track={KELVIN_TRACK}
          hint="Warm is low, daylight is about 5600 K."
          onChange={(v) => { onColor({ kind: "kelvin", kelvin: kelvin(v) }); }} />
      ) : (
        <ColorField label="Colour" value={linearToHex(color.rgb)}
          hint="Only the tint counts. Brightness comes from the power."
          onChange={(hex) => {
            const rgb = hexToLinear(hex);
            if (rgb !== null) onColor({ kind: "rgb", rgb });
          }} />
      )}
    </>
  );
}

const formatWatts = (w: number): string => (w >= 100 ? w.toFixed(0) : w.toFixed(1).replace(/\.0$/, ""));
