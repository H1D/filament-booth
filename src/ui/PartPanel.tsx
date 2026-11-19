import {
  BOUNDS, DEFAULT_SLICE, SEAM_POSITIONS, TOP_SURFACE_PATTERNS, mm, type SliceSettings,
} from "../document";
import { Group, Note, Select, Slider, type Option } from "./controls";
import { linear } from "./mappings";
import { useDoc, useEdit, usePrint, useScene } from "./hooks";
import { printSource, slicingEditable, sourceName, stageLabel, titleCase } from "./model";
import type { SlicedPrint } from "../print";

const LAYER_HEIGHT = linear(BOUNDS.layerHeight);
const LINE_WIDTH = linear(BOUNDS.lineWidth);
const WALLS = linear(BOUNDS.wallCount);
const TOP_SHELL = linear(BOUNDS.topShellLayers);

const options = <T extends string>(values: readonly T[]): Option<T>[] => values.map((value) => ({ value, label: titleCase(value) }));
const PATTERNS = options(TOP_SURFACE_PATTERNS);
const SEAMS = options(SEAM_POSITIONS);

const count = new Intl.NumberFormat("en");

export function PartPanel() {
  const print = usePrint();
  const scene = useScene();
  const source = printSource(print);
  const editable = slicingEditable(print);
  const sliced = print.status === "ready" ? print.loaded.sliced : print.status === "error" ? print.loaded?.sliced ?? null : null;
  const mesh = scene.part?.mesh ?? null;
  const reslicing = print.status === "loading" && mesh !== null && print.stage === "slicing";

  return (
    <>
      <div className="busy" role="status" data-active={print.status === "loading" || undefined}>
        {print.status === "loading" ? (
          <>
            <span className="busy-bar" aria-hidden="true" />
            <span>{reslicing ? "Re-slicing" : stageLabel(print.stage)}</span>
          </>
        ) : null}
      </div>
      <dl className="facts">
        <dt>File</dt>
        <dd title={source === null ? undefined : sourceName(source)}>{source === null ? "None open" : sourceName(source)}</dd>
        <dt>Geometry</dt>
        <dd>{mesh === null ? "None" : `${count.format(mesh.tris)} triangles, ${count.format(mesh.layerCount)} layers`}</dd>
        {sliced?.filamentName ? <><dt>In the file</dt><dd>{sliced.filamentName}</dd></> : null}
        {sliced?.note ? <><dt>Note</dt><dd>{sliced.note}</dd></> : null}
      </dl>
      {editable ? <SlicingControls /> : <FileSettings sliced={sliced} />}
    </>
  );
}

function SlicingControls() {
  const doc = useDoc();
  const edit = useEdit();
  const s = doc.slicing;
  const d = DEFAULT_SLICE;
  const set = (change: (slicing: SliceSettings) => void) => { edit((draft) => { change(draft.slicing); }); };

  return (
    <Group title="Slicing">
      <Slider label="Layer height" unit="mm" mapping={LAYER_HEIGHT} value={s.layerHeight} defaultValue={d.layerHeight}
        hint="Thinner layers show finer grooves and take longer to slice."
        onChange={(v) => { set((x) => { x.layerHeight = mm(v); }); }} />
      <Slider label="Outer line width" unit="mm" mapping={LINE_WIDTH} value={s.outerLineWidth} defaultValue={d.outerLineWidth}
        onChange={(v) => { set((x) => { x.outerLineWidth = mm(v); }); }} />
      <Slider label="Inner line width" unit="mm" mapping={LINE_WIDTH} value={s.innerLineWidth} defaultValue={d.innerLineWidth}
        onChange={(v) => { set((x) => { x.innerLineWidth = mm(v); }); }} />
      <Slider label="Walls" mapping={WALLS} value={s.wallCount} defaultValue={d.wallCount}
        onChange={(v) => { set((x) => { x.wallCount = v; }); }} />
      <Slider label="Top shell layers" mapping={TOP_SHELL} value={s.topShellLayers} defaultValue={d.topShellLayers}
        onChange={(v) => { set((x) => { x.topShellLayers = v; }); }} />
      <Select label="Top pattern" options={PATTERNS} value={s.topSurfacePattern}
        onChange={(v) => { set((x) => { x.topSurfacePattern = v; }); }} />
      <Select label="Seam position" options={SEAMS} value={s.seamPosition}
        onChange={(v) => { set((x) => { x.seamPosition = v; }); }} />
    </Group>
  );
}

function FileSettings({ sliced }: { sliced: SlicedPrint | null }) {
  const s = sliced?.settings ?? null;
  return (
    <Group title="Slicing">
      <Note>These come from the G-code file. Change them in your slicer and open the file again.</Note>
      {s === null ? null : (
        <dl className="facts" aria-label="Slicing settings from the file">
          <dt>Layer height</dt><dd>{s.layerHeight} mm</dd>
          <dt>Outer line width</dt><dd>{s.outerLineWidth} mm</dd>
          <dt>Inner line width</dt><dd>{s.innerLineWidth} mm</dd>
          <dt>Walls</dt><dd>{s.wallCount}</dd>
          <dt>Top shell layers</dt><dd>{s.topShellLayers}</dd>
          <dt>Top pattern</dt><dd>{titleCase(s.topSurfacePattern)}</dd>
          <dt>Seam position</dt><dd>{titleCase(s.seamPosition)}</dd>
        </dl>
      )}
    </Group>
  );
}
