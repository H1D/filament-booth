import { useEffect, useId, useReducer, useRef, useState } from "react";
import { BOUNDS, deg, m, type PropShape, type StudioProp } from "../document";
import { PROP_DEFAULTS, addProp, patchProp, removeProp } from "../edits";
import { hexToLinear, linearToHex } from "./color";
import { ColorField, Fold, Group, Note, Scope, Slider, Switch } from "./controls";
import { describeError, useDoc, useEdit, useHost } from "./hooks";
import { Icon } from "./icons";
import { linear, type Mapping } from "./mappings";

const LOCATION = linear(BOUNDS.propLocation);
const ROTATION = linear(BOUNDS.propRotationDeg);
const SIZE = linear(BOUNDS.propSize);
const SCALE = linear(BOUNDS.propScale);
const SEGMENTS = linear(BOUNDS.propSegments);
const ROUGHNESS = linear(BOUNDS.propRoughness);

const SHAPE_LABELS: Record<PropShape, string> = { cube: "Cube", cylinder: "Cylinder", sphere: "Sphere", plane: "Plane", mesh: "Mesh" };
const PRIMITIVES = ["cube", "cylinder", "sphere", "plane"] as const satisfies readonly PropShape[];
const AXES = [["X", 0], ["Y", 1], ["Z", 2]] as const;

type PropPatch = Parameters<typeof patchProp>[1];


const stem = (fileName: string): string => fileName.replace(/\.stl$/i, "");

export function PropsPanel() {
  const doc = useDoc();
  const { booth, ui } = useHost();
  const edit = useEdit();
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  /** The prop the file being picked reconnects, or null when it makes a new prop. */
  const target = useRef<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // A mesh imported this session is not in the document, so the rows re-read it when this ticks.
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  const add = (shape: PropShape, fields: Parameters<typeof addProp>[1] = {}) => {
    const before = new Set(booth.doc.props.map((p) => p.id));
    edit(addProp(shape, fields));
    setFresh(booth.doc.props.find((p) => !before.has(p.id))?.id ?? null);
  };

  const choose = (propId: string | null) => {
    target.current = propId;
    menu.current?.hidePopover();
    picker.current?.click();
  };

  const importFile = async (file: File, propId: string | null) => {
    try {
      const mesh = booth.addPropMesh(file.name, await file.arrayBuffer());
      if (propId === null) {
        add("mesh", { mesh, name: stem(file.name) });
      } else {
        // The same file again needs no edit: Booth shows every prop that names a mesh once it arrives.
        if (booth.doc.props.find((p) => p.id === propId)?.mesh !== mesh) edit(patchProp(propId, { mesh }));
      }
      refresh();
    } catch (e) {
      ui.setNotice(`Could not read ${file.name}. ${describeError(e)}`);
    }
  };

  return (
    <>
      {doc.props.length === 0 ? (
        <p className="note">Nothing stands beside the part. Add a wall, a box or a stand-in to see how the part sits next to it.</p>
      ) : (
        <ul className="lights" aria-label="Props">
          {doc.props.map((prop) => (
            <li key={prop.id}>
              <PropRow prop={prop} startOpen={prop.id === fresh} onImport={() => { choose(prop.id); }} />
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="btn add-prop" popoverTarget={menuId} popoverTargetAction="toggle">
          <Icon name="plus" />Add prop
        </button>
        <input ref={picker} type="file" accept=".stl" hidden aria-label="Choose an STL for a prop"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file !== undefined) void importFile(file, target.current);
          }} />
      </div>
      <div id={menuId} ref={menu} popover="auto" aria-label="Add a prop" className="add-menu">
        <div className="group">
          {PRIMITIVES.map((shape) => (
            <button key={shape} type="button" className="btn quiet" onClick={() => { menu.current?.hidePopover(); add(shape); }}>
              {SHAPE_LABELS[shape]}
            </button>
          ))}
          <button type="button" className="btn quiet" onClick={() => { choose(null); }}>Mesh from STL…</button>
        </div>
      </div>
    </>
  );
}

function PropRow({ prop, startOpen, onImport }: { prop: StudioProp; startOpen: boolean; onImport: () => void }) {
  const edit = useEdit();
  const { booth } = useHost();
  const ref = useRef<HTMLDetailsElement>(null);
  const patch = (p: PropPatch) => { edit(patchProp(prop.id, p)); };
  const label = prop.name || "Unnamed prop";
  const scope = prop.name || "Prop";
  const loaded = prop.shape !== "mesh" || (prop.mesh !== null && booth.propMesh(prop.mesh) !== null);
  const roundShape = prop.shape === "cylinder" || prop.shape === "sphere";
  // A plane has no depth, so its Z size and scale do nothing.
  const planar = prop.shape === "plane";
  const uniform = prop.scale[0] === prop.scale[1] && prop.scale[1] === prop.scale[2];

  useEffect(() => {
    if (startOpen) ref.current?.scrollIntoView({ block: "nearest" });
  }, [startOpen]);

  return (
    <details className="light" ref={ref} open={startOpen} data-off={!prop.on || undefined} data-prop={prop.id}>
      <summary>
        <Icon name="chevron" />
        <span className="light-name">{label}</span>
        <span className="light-meta">{loaded ? SHAPE_LABELS[prop.shape] : "not loaded"}</span>
        <Scope name={scope}>
          <Switch label="On" bare checked={prop.on} onChange={(on) => { patch({ on }); }} />
          <button type="button" className="icon-btn" aria-label={`${scope}: Delete`} title="Delete this prop"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); edit(removeProp(prop.id)); }}>
            <Icon name="remove" />
          </button>
        </Scope>
      </summary>
      <Scope name={scope}>
        <div className="light-body">
          {loaded ? null : (
            <div className="group">
              <Note tone="warn">Import {prop.name || "the file"} again to show it</Note>
              <button type="button" className="btn" onClick={onImport}><Icon name="upload" />Import STL</button>
            </div>
          )}
          <div className="row">
            <label className="row-label" htmlFor={`name-${prop.id}`}>Name</label>
            <input id={`name-${prop.id}`} type="text" className="text" value={prop.name} spellCheck={false}
              aria-label={`${scope}: name`} onChange={(e) => { patch({ name: e.target.value }); }} />
          </div>
          <Axes title="Location" scope={scope} values={prop.location} mapping={LOCATION} unit="m" cast={m}
            hint="Where the prop's origin stands. Z is up from the floor."
            onChange={(location) => { patch({ location }); }} />
          <Axes title="Rotation" scope={scope} values={prop.rotationDeg} mapping={ROTATION} unit="°" cast={deg} reset={0}
            onChange={(rotationDeg) => { patch({ rotationDeg }); }} />
          <Axes title="Size" scope={scope} values={prop.size} mapping={SIZE} unit="m" cast={m} count={planar ? 2 : 3}
            hint={prop.shape === "mesh" ? "1 is the file's own size." : "Across, before Scale."}
            onChange={(size) => { patch({ size }); }} />
          <Group title="Scale">
            <Scope name={`${scope}: Scale`}>
              <Slider label="All" mapping={SCALE} value={prop.scale[0]} defaultValue={1} disabled={!uniform}
                hint={uniform ? "Scales every axis together." : "The axes differ. Set them under Per axis."}
                onChange={(v) => { patch({ scale: [v, v, v] }); }} />
            </Scope>
            <Fold title="Per axis" open={!uniform}>
              <Axes title="Scale" bare scope={scope} values={prop.scale} mapping={SCALE} cast={Number} reset={1} count={planar ? 2 : 3}
                onChange={(scale) => { patch({ scale }); }} />
            </Fold>
          </Group>
          {roundShape ? (
            <Slider label="Segments" mapping={SEGMENTS} value={prop.segments} defaultValue={PROP_DEFAULTS.segments}
              hint="Sides around the shape. Above 12 they shade smooth."
              onChange={(v) => { patch({ segments: v }); }} />
          ) : null}
          <ColorField label="Colour" value={linearToHex(prop.color)}
            onChange={(hex) => {
              const color = hexToLinear(hex);
              if (color !== null) patch({ color });
            }} />
          <Slider label="Roughness" mapping={ROUGHNESS} value={prop.roughness} defaultValue={PROP_DEFAULTS.roughness}
            onChange={(v) => { patch({ roughness: v }); }} />
        </div>
      </Scope>
    </details>
  );
}

/** One slider per axis, named "<prop>: <title>: X" so every prop's sliders stay apart for assistive technology. */
function Axes<T extends number>({ title, bare, scope, values, mapping, unit, reset, count = 3, cast, hint, onChange }: {
  title: string; /** Leaves out the group heading, for sliders that sit under one already. */ bare?: boolean; scope: string; values: readonly [T, T, T]; mapping: Mapping; unit?: string;
  /** The value a double click restores on every axis. */
  reset?: number;
  /** How many axes the shape has: a plane has two. */
  count?: 2 | 3;
  cast: (v: number) => T; hint?: string; onChange: (next: [T, T, T]) => void;
}) {
  const sliders = AXES.slice(0, count).map(([axis, i]) => (
    <Slider key={axis} label={axis} unit={unit} mapping={mapping} value={values[i]} defaultValue={reset} hint={hint}
      onChange={(v) => {
        const next: [T, T, T] = [values[0], values[1], values[2]];
        next[i] = cast(v);
        onChange(next);
      }} />
  ));
  const scoped = <Scope name={`${scope}: ${title}`}>{sliders}</Scope>;
  return bare ? scoped : <Group title={title}>{scoped}</Group>;
}
