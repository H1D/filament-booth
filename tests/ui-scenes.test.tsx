// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import type { Booth } from "../src/booth";
import { HostProvider } from "../src/ui/host";
import { PhotoSession } from "../src/ui/photo-session";
import { ScenesPanel } from "../src/ui/ScenesPanel";
import { Ui } from "../src/ui/store";
import { agentWith, boothWith } from "./ui-fixtures";

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

function mount(booth: Booth): { container: HTMLElement; ui: Ui } {
  const ui = new Ui();
  const photos = new PhotoSession((id) => booth.takePhoto(id), undefined, () => booth.activeSceneId);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => { root?.render(<HostProvider host={{ booth, ui, photos, agent: agentWith().agent }}><ScenesPanel /></HostProvider>); });
  return { container: host, ui };
}

const sceneButtons = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>("ul.scenes button")];
const button = (c: HTMLElement, cls: string): HTMLButtonElement => {
  const el = c.querySelector(`button.${cls}`);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`no button .${cls}`);
  return el;
};
const nameInput = (c: HTMLElement): HTMLInputElement => {
  const el = c.querySelector("#scene-name");
  if (!(el instanceof HTMLInputElement)) throw new Error("no name field");
  return el;
};

test("add, rename, switch and remove scenes from the panel", () => {
  const { booth } = boothWith();
  const { container } = mount(booth);
  expect(sceneButtons(container).map((b) => b.textContent)).toEqual(["1Scene 1"]);
  expect(button(container, "remove-scene").disabled).toBe(true);

  act(() => { button(container, "add-scene").click(); });
  expect(sceneButtons(container).map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  expect(nameInput(container).value).toBe("Scene 2");

  const field = nameInput(container);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "Hero shot");
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(booth.scenes.map((s) => s.name)).toEqual(["Scene 1", "Hero shot"]);

  act(() => { sceneButtons(container)[0].click(); });
  expect(booth.activeSceneId).toBe(booth.scenes[0].id);
  expect(nameInput(container).value).toBe("Scene 1");

  act(() => { button(container, "remove-scene").click(); });
  expect(booth.scenes.map((s) => s.name)).toEqual(["Hero shot"]);
  expect(button(container, "remove-scene").disabled).toBe(true);
});

test("a refused name lands in the notice", () => {
  const { booth } = boothWith();
  const { container, ui } = mount(booth);
  act(() => { button(container, "add-scene").click(); });
  const field = nameInput(container);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "Scene 1");
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(ui.state.get().notice).toMatch(/another scene is called Scene 1/);
  expect(booth.scenes[1].name).toBe("Scene 2");
});

test("with no part and no photos, Render all and Download all are off", () => {
  const { booth } = boothWith();
  const { container } = mount(booth);
  expect(button(container, "render-all").disabled).toBe(true);
  expect(button(container, "download-all").disabled).toBe(true);
});
