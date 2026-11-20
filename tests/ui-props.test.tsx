// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Booth } from "../src/booth";
import { addProp } from "../src/edits";
import { PropsPanel } from "../src/ui/PropsPanel";
import { Section } from "../src/ui/Section";
import { HostProvider } from "../src/ui/host";
import { PhotoSession } from "../src/ui/photo-session";
import { Ui } from "../src/ui/store";
import { agentWith, boothWith } from "./ui-fixtures";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

/** happy-dom has no Popover API: the panel's menu calls hidePopover, and the test counts the calls. */
let hidden: HTMLElement[] = [];

beforeEach(() => {
  hidden = [];
  Object.defineProperty(HTMLElement.prototype, "hidePopover", { configurable: true, value(this: HTMLElement) { hidden.push(this); } });
});

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
  act(() => { root?.render(<HostProvider host={{ booth, ui, photos, agent: agentWith().agent }}>{node}</HostProvider>); });
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

function button(container: ParentNode, text: string): HTMLButtonElement {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent === text);
  if (el === undefined) throw new Error(`no button "${text}"`);
  return el;
}

/** A binary STL of one triangle, 10 mm across. */
function stl(): ArrayBuffer {
  const bytes = new ArrayBuffer(84 + 50);
  const dv = new DataView(bytes);
  dv.setUint32(80, 1, true);
  [0, 0, 0, 10, 0, 0, 0, 10, 5].forEach((v, k) => { dv.setFloat32(84 + 12 + k * 4, v, true); });
  return bytes;
}

/** Chooses a file in the panel's hidden picker, as the file dialog does. */
async function pick(container: HTMLElement, file: File): Promise<void> {
  const picker = input(container, "Choose an STL for a prop");
  Object.defineProperty(picker, "files", { value: [file], configurable: true });
  await act(async () => { picker.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("adding props", () => {
  test("each primitive in the Add menu adds a prop of that shape, opens it and closes the menu", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <PropsPanel />);
    expect(container.querySelector('ul[aria-label="Props"]')).toBeNull();
    const menu = container.querySelector<HTMLElement>('[popover][aria-label="Add a prop"]');
    expect(menu).not.toBeNull();
    expect([...(menu?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual(
      ["Cube", "Cylinder", "Sphere", "Plane", "Mesh from STL…"],
    );

    for (const name of ["Cube", "Cylinder", "Sphere", "Plane"]) act(() => { button(container, name).click(); });
    expect(booth.doc.props.map((p) => p.shape)).toEqual(["cube", "cylinder", "sphere", "plane"]);
    expect(booth.doc.props.map((p) => p.name)).toEqual(["Cube", "Cylinder", "Sphere", "Plane"]);
    // A plane stands up behind the part as a wall: lying at z = 0 it would sit in the floor.
    expect(booth.doc.props[3]).toMatchObject({ rotationDeg: [90, 0, 0], location: [0, 0.1, 0.1] });
    const last = container.querySelector('details[data-prop="prop-4"]');
    expect(last?.hasAttribute("open")).toBe(true);
    expect(container.querySelectorAll("ul[aria-label='Props'] > li")).toHaveLength(4);
    expect(hidden).toEqual([menu, menu, menu, menu]);
  });

  test("a prop an agent adds, edits and removes shows up without a reload", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <PropsPanel />);
    act(() => { booth.update(addProp("cube", { name: "Wall" })); });
    expect(container.querySelector('details[data-prop="prop-1"] .light-name')?.textContent).toBe("Wall");
    act(() => { booth.update((d) => { d.props[0].name = "Back wall"; }); });
    expect(container.querySelector('details[data-prop="prop-1"] .light-name')?.textContent).toBe("Back wall");
    act(() => { booth.update((d) => { d.props = []; }); });
    expect(container.querySelector('details[data-prop="prop-1"]')).toBeNull();
  });
});

describe("a prop's controls", () => {
  test("a typed location, a rotation and a roughness reach the document, and the scene follows", () => {
    const { booth } = boothWith();
    booth.update(addProp("cube"));
    const { container } = mount(booth, <PropsPanel />);
    typeInto(input(container, "Cube: Location: X value, m"), "0.3");
    typeInto(input(container, "Cube: Rotation: Z value, °"), "45");
    typeInto(input(container, "Cube: Roughness value"), "0.9");
    const prop = booth.doc.props[0];
    expect([...prop.location]).toEqual([0.3, 0, 0.1]);
    expect([...prop.rotationDeg]).toEqual([0, 0, 45]);
    expect(prop.roughness).toBe(0.9);
    expect(booth.scene.props).toHaveLength(1);
  });

  test("size and scale are per axis, and the one Scale slider sets all three", () => {
    const { booth } = boothWith();
    booth.update(addProp("cube"));
    const { container } = mount(booth, <PropsPanel />);
    typeInto(input(container, "Cube: Size: Y value, m"), "0.5");
    expect([...booth.doc.props[0].size]).toEqual([0.2, 0.5, 0.2]);
    typeInto(input(container, "Cube: Scale: All value"), "2");
    expect(booth.doc.props[0].scale).toEqual([2, 2, 2]);
    typeInto(input(container, "Cube: Scale: Z value"), "3");
    expect(booth.doc.props[0].scale).toEqual([2, 2, 3]);
    expect(input(container, "Cube: Scale: All value").disabled).toBe(true);
  });

  test("a colour is picked in sRGB and stored linear", () => {
    const { booth } = boothWith();
    booth.update(addProp("sphere"));
    const { container } = mount(booth, <PropsPanel />);
    typeInto(input(container, "Sphere: Colour hex"), "#ff8000");
    const [r, g, b] = booth.doc.props[0].color;
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0.2158605, 5);
    expect(b).toBe(0);
  });

  test("the controls fit the shape: segments for round shapes, no depth for a plane", () => {
    const { booth } = boothWith();
    for (const shape of ["cube", "cylinder", "sphere", "plane"] as const) booth.update(addProp(shape));
    const { container } = mount(booth, <PropsPanel />);
    const has = (label: string) => container.querySelector(`input[aria-label="${label}"]`) !== null;
    expect(has("Cube: Segments")).toBe(false);
    expect(has("Cylinder: Segments")).toBe(true);
    expect(has("Sphere: Segments")).toBe(true);
    expect(has("Plane: Segments")).toBe(false);
    expect(has("Cube: Size: Z")).toBe(true);
    expect(has("Plane: Size: Y")).toBe(true);
    expect(has("Plane: Size: Z")).toBe(false);
    typeInto(input(container, "Cylinder: Segments value"), "64");
    expect(booth.doc.props[1].segments).toBe(64);
  });

  test("the switch hides a prop from the scene, and delete removes it", () => {
    const { booth } = boothWith();
    booth.update(addProp("cube"));
    booth.update(addProp("plane"));
    const { container } = mount(booth, <PropsPanel />);
    expect(booth.scene.props).toHaveLength(2);
    act(() => { input(container, "Cube: On").click(); });
    expect(booth.doc.props[0].on).toBe(false);
    expect(container.querySelector('details[data-prop="prop-1"]')?.hasAttribute("data-off")).toBe(true);
    expect(booth.scene.props).toHaveLength(1);

    const row = container.querySelector('details[data-prop="prop-2"]');
    const del = row?.querySelector<HTMLButtonElement>('button[aria-label="Plane: Delete"]');
    act(() => { del?.click(); });
    expect(booth.doc.props.map((p) => p.id)).toEqual(["prop-1"]);
    // Delete sits in the summary: it must not also toggle the row.
    expect(container.querySelector('details[data-prop="prop-2"]')).toBeNull();
  });

  test("two props of one shape keep their controls apart", () => {
    const { booth } = boothWith();
    booth.update(addProp("cube", { name: "Left" }));
    booth.update(addProp("cube", { name: "Right" }));
    const { container } = mount(booth, <PropsPanel />);
    const names = [...container.querySelectorAll('input[type="range"]')].map((r) => r.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Left: Location: X");
    expect(names).toContain("Right: Location: X");
  });

  test("the section is in the rail and starts closed", () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <Section id="props"><PropsPanel /></Section>);
    const section = container.querySelector('details[data-section="props"]');
    expect(section?.querySelector("h2")?.textContent).toBe("Props");
    expect(section?.hasAttribute("open")).toBe(false);
  });
});

describe("meshes from STL files", () => {
  test("Mesh from STL… opens the picker, and the file becomes a prop named after it", async () => {
    const { booth } = boothWith();
    const { container } = mount(booth, <PropsPanel />);
    const picker = input(container, "Choose an STL for a prop");
    let opened = 0;
    picker.addEventListener("click", () => { opened += 1; });
    act(() => { button(container, "Mesh from STL…").click(); });
    expect(opened).toBe(1);
    expect(hidden).toHaveLength(1);

    await pick(container, new File([stl()], "battery.stl"));
    const [prop] = booth.doc.props;
    expect(prop.shape).toBe("mesh");
    expect(prop.name).toBe("battery");
    expect(prop.mesh).not.toBeNull();
    expect(booth.propMesh(prop.mesh ?? "")?.name).toBe("battery.stl");
    expect(container.querySelector(".light-meta")?.textContent).toBe("Mesh");
    expect(container.textContent).not.toContain("again to show it");
    expect(booth.scene.props).toHaveLength(1);
  });

  test("a file that cannot be read lands in the notice and adds nothing", async () => {
    const { booth } = boothWith();
    const { container, ui } = mount(booth, <PropsPanel />);
    await pick(container, new File([new Uint8Array(10)], "broken.stl"));
    expect(ui.state.get().notice).toMatch(/^Could not read broken\.stl\. /);
    expect(booth.doc.props).toEqual([]);
  });
});

describe("a mesh prop that is not loaded this session", () => {
  /** A setup saved with a mesh prop, opened in a booth that never imported the file: what a page reload gives. */
  function reloaded(): { booth: Booth; id: string } {
    const first = boothWith().booth;
    const id = first.addPropMesh("battery.stl", stl());
    first.update(addProp("mesh", { mesh: id, name: "Battery" }));
    const second = boothWith().booth;
    second.importJson(first.exportJson());
    return { booth: second, id };
  }

  test("says to import it again, with a button, and draws nothing", () => {
    const { booth } = reloaded();
    const { container } = mount(booth, <PropsPanel />);
    expect(booth.scene.props).toHaveLength(0);
    expect(container.querySelector(".note")?.textContent).toBe("Import Battery again to show it");
    expect(container.querySelector(".light-meta")?.textContent).toBe("not loaded");
    expect(button(container, "Import STL")).toBeDefined();
  });

  test("the same file again reconnects it, and the prop is drawn", async () => {
    const { booth, id } = reloaded();
    const { container } = mount(booth, <PropsPanel />);
    let opened = 0;
    input(container, "Choose an STL for a prop").addEventListener("click", () => { opened += 1; });
    act(() => { button(container, "Import STL").click(); });
    expect(opened).toBe(1);

    await pick(container, new File([stl()], "battery.stl"));
    expect(booth.doc.props[0].mesh).toBe(id);
    expect(booth.doc.props[0].on).toBe(true);
    expect(booth.doc.props).toHaveLength(1);
    expect(container.textContent).not.toContain("again to show it");
    expect(booth.scene.props).toHaveLength(1);
  });

  test("a different file gets a new id, which the prop is patched to", async () => {
    const { booth, id } = reloaded();
    const { container } = mount(booth, <PropsPanel />);
    act(() => { button(container, "Import STL").click(); });
    const other = stl();
    new DataView(other).setFloat32(84 + 12 + 8 * 4, 9, true);
    await pick(container, new File([other], "other.stl"));
    expect(booth.doc.props).toHaveLength(1);
    expect(booth.doc.props[0].mesh).not.toBe(id);
    expect(booth.propMesh(booth.doc.props[0].mesh ?? "")?.name).toBe("other.stl");
    expect(container.textContent).not.toContain("again to show it");
    expect(booth.scene.props).toHaveLength(1);
  });
});
