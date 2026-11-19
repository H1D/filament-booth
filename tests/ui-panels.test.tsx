// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import type { Booth } from "../src/booth";
import { FilamentPanel } from "../src/ui/FilamentPanel";
import { LightsPanel } from "../src/ui/LightsPanel";
import { OutputPanel } from "../src/ui/OutputPanels";
import { PartPanel } from "../src/ui/PartPanel";
import { Section } from "../src/ui/Section";
import { useEdit } from "../src/ui/hooks";
import { HostProvider } from "../src/ui/host";
import { PhotoSession } from "../src/ui/photo-session";
import { Ui } from "../src/ui/store";
import { boothWith } from "./ui-fixtures";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

function mount(booth: Booth, node: ReactNode): { container: HTMLElement; ui: Ui } {
  const ui = new Ui();
  const photos = new PhotoSession(() => booth.takePhoto());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => { root?.render(<HostProvider host={{ booth, ui, photos }}>{node}</HostProvider>); });
  return { container: host, ui };
}

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

function input(container: HTMLElement, label: string): HTMLInputElement {
  const el = container.querySelector(`input[aria-label="${label}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input labelled ${label}`);
  return el;
}

function select(container: HTMLElement, label: string): HTMLSelectElement {
  const el = container.querySelector(`select[aria-label="${label}"]`);
  if (!(el instanceof HTMLSelectElement)) throw new Error(`no select labelled ${label}`);
  return el;
}

const optionLabels = (el: HTMLSelectElement): (string | null)[] => Array.from(el.options, (o) => o.textContent);

describe("the lights section", () => {
  test("editing one light's power changes the document, marks the section and the look, and Reset undoes it", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <Section id="lights" open><LightsPanel /></Section>);
    const section = container.querySelector('details[data-section="lights"]');
    expect(section?.hasAttribute("data-modified")).toBe(false);
    expect(container.querySelector(".look-row .tag")).toBeNull();

    typeInto(input(container, "Top softbox: Power value, W"), "20");
    const top = booth.doc.studio.lights.find((l) => l.id === "top");
    expect(top?.kind === "area" && top.powerW).toBe(20);
    expect(section?.hasAttribute("data-modified")).toBe(true);
    expect(container.querySelector(".look-row .tag")?.textContent).toBe("modified");
    expect(booth.lookModified).toBe(true);

    const reset = container.querySelector('button[aria-label="Reset Lights"]');
    if (!(reset instanceof HTMLButtonElement)) throw new Error("no reset button");
    act(() => { reset.click(); });
    expect(section?.hasAttribute("data-modified")).toBe(false);
    expect(container.querySelector('button[aria-label="Reset Lights"]')).toBeNull();
    expect(booth.lookModified).toBe(false);
  });

  test("each light's controls are named with the light, so five lights do not all say Elevation", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <LightsPanel />);
    const names = [...container.querySelectorAll('input[type="range"]')].map((r) => r.getAttribute("aria-label"));
    expect(names).toContain("Top softbox: Elevation");
    expect(names).toContain("Left strip: Elevation");
    expect(new Set(names).size).toBe(names.length);
  });

  test("a light switches off with its own switch, and the row shows it", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <LightsPanel />);
    const sw = input(container, "Top softbox: On");
    act(() => { sw.click(); });
    expect(booth.doc.studio.lights.find((l) => l.id === "top")?.on).toBe(false);
    expect(container.querySelector('details[data-light="top"]')?.hasAttribute("data-off")).toBe(true);
  });

  test("Add softbox adds a light, opens it, and Remove takes it away again", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <LightsPanel />);
    const before = booth.doc.studio.lights.length;
    const add = [...container.querySelectorAll("button")].find((b) => b.textContent === "Add softbox");
    if (add === undefined) throw new Error("no Add softbox button");
    act(() => { add.click(); });
    expect(booth.doc.studio.lights).toHaveLength(before + 1);
    const fresh = booth.doc.studio.lights[before];
    const row = container.querySelector(`details[data-light="${fresh.id}"]`);
    expect(row?.hasAttribute("open")).toBe(true);
    const remove = [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Remove light");
    if (remove === undefined) throw new Error("no Remove light button");
    act(() => { remove.click(); });
    expect(booth.doc.studio.lights).toHaveLength(before);
  });

  test("switching a light to a colour picker and back keeps its tint", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <LightsPanel />);
    const radios = [...container.querySelectorAll('details[data-light="top"] fieldset[aria-label="Top softbox: Colour by"] input[type="radio"]')];
    const colour = radios.find((r) => r instanceof HTMLInputElement && r.value === "rgb");
    if (!(colour instanceof HTMLInputElement)) throw new Error("no colour radio");
    act(() => { colour.click(); });
    const top = booth.doc.studio.lights.find((l) => l.id === "top");
    expect(top?.color.kind).toBe("rgb");
  });
});

describe("a refused edit", () => {
  test("lands in the notice and leaves the document as it was", () => {
    const { booth } = boothWith();
    function Poke() {
      const edit = useEdit();
      return <button type="button" onClick={() => { edit((d) => { d.camera.fStop = 0; }); }}>poke</button>;
    }
    const { container, ui } = mount(booth, <Poke />);
    const rev = booth.scene.docRev;
    act(() => { container.querySelector("button")?.click(); });
    expect(ui.state.get().notice).toBe("camera.fStop: must be at least 0.7, got 0");
    expect(booth.doc.camera.fStop).toBe(11);
    expect(booth.scene.docRev).toBe(rev);
  });

  test("the notice clears when the next edit lands", () => {
    const { booth } = boothWith();
    function Poke() {
      const edit = useEdit();
      return (
        <>
          <button type="button" id="bad" onClick={() => { edit((d) => { d.camera.fStop = 0; }); }}>bad</button>
          <button type="button" id="good" onClick={() => { edit((d) => { d.camera.fStop = 8; }); }}>good</button>
        </>
      );
    }
    const { container, ui } = mount(booth, <Poke />);
    act(() => { container.querySelector<HTMLButtonElement>("#bad")?.click(); });
    expect(ui.state.get().notice).not.toBeNull();
    act(() => { container.querySelector<HTMLButtonElement>("#good")?.click(); });
    expect(ui.state.get().notice).toBeNull();
  });
});

describe("the part section with nothing open", () => {
  test("shows the slicing controls that will apply to the next STL, and no reset until one is changed", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <Section id="part" open><PartPanel /></Section>);
    expect(container.textContent).toContain("None open");
    expect(container.querySelector('input[aria-label="Layer height"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Reset Part and slicing"]')).toBeNull();
    typeInto(input(container, "Layer height value, mm"), "0.12");
    expect(container.querySelector('button[aria-label="Reset Part and slicing"]')).not.toBeNull();
  });
});

describe("the output section", () => {
  test("shows the pixel size the photo will have and follows the long edge", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <OutputPanel />);
    expect(container.querySelector(".readout.size")?.textContent).toContain("1600 by 2000 px");
    typeInto(input(container, "Long edge value, px"), "1000");
    expect(container.querySelector(".readout.size")?.textContent).toContain("800 by 1000 px");
  });
});

describe("the filament section", () => {
  test("marks the presets no still has been matched to as estimates", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <FilamentPanel />);
    expect(optionLabels(select(container, "Preset"))).toEqual(["PETG Basic", "PLA Basic (estimate)", "PLA Matte", "PLA Silk (estimate)"]);
  });
});

describe("the top pattern select", () => {
  test("offers every pattern the slicer accepts", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <Section id="part" open><PartPanel /></Section>);
    expect(optionLabels(select(container, "Top pattern"))).toEqual([
      "Monotonic", "Monotonic line", "Concentric", "Zigzag", "Aligned rectilinear", "Hilbert curve", "Archimedean chords", "Octagram spiral",
    ]);
  });
});
