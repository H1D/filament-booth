// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BOUNDS } from "../src/document";
import { ColorField, Scope, Segmented, Slider, Switch } from "../src/ui/controls";
import { ladder, linear, logarithmic } from "../src/ui/mappings";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode): HTMLElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => { root?.render(node); });
  return host;
}

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); });
}

function field(container: HTMLElement, name: string): HTMLInputElement {
  const el = container.querySelector(`input[aria-label^="${name}"]`);
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input named ${name}`);
  return el;
}

describe("mappings", () => {
  test("linear keeps a typed value past the slider's end but pins the thumb", () => {
    const power = linear(BOUNDS.powerW);
    expect(power.toRange(500)).toBe(60);
    expect(power.limits).toEqual({ min: 0, max: 1e6 });
    expect(power.fromRange(12.5)).toBe(12.5);
  });

  test("a bound that is only greater-than starts the slider one step above it", () => {
    const distance = linear(BOUNDS.lightDistance);
    expect(distance.limits.min).toBeCloseTo(0.01, 9);
  });

  test("logarithmic spaces doublings evenly and returns whole samples", () => {
    const samples = logarithmic(BOUNDS.samples);
    const at = (v: number) => samples.toRange(v);
    expect(at(64) - at(32)).toBeCloseTo(at(128) - at(64), -1);
    for (const v of [16, 64, 256, 1024, 4096]) expect(samples.fromRange(samples.toRange(v))).toBe(v);
    expect(Number.isInteger(samples.fromRange(333))).toBe(true);
  });

  test("a ladder snaps to the nearest rung and steps rung by rung", () => {
    const stops = ladder([1.4, 2, 2.8, 4, 5.6, 8], BOUNDS.fStop);
    expect(stops.fromRange(stops.toRange(5))).toBe(5.6);
    expect(stops.nudge(4, 1, false)).toBe(5.6);
    expect(stops.nudge(1.4, -1, false)).toBe(1.4);
  });

  test("a slider on a bound with no finite range is refused up front", () => {
    expect(() => linear(BOUNDS.colorChannel)).toThrow(/finite range/);
  });
});

describe("Slider", () => {
  const props = { label: "Power", unit: "W", mapping: linear(BOUNDS.powerW), value: 12.5, defaultValue: 4 };

  test("its range and number field are named by the label and scope, and the value is spoken with its unit", () => {
    const c = mount(<Scope name="Top softbox"><Slider {...props} onChange={() => {}} /></Scope>);
    const range = c.querySelector('input[type="range"]');
    expect(range?.getAttribute("aria-label")).toBe("Top softbox: Power");
    expect(range?.getAttribute("aria-valuetext")).toBe("12.5 W");
    expect(c.querySelector('input[aria-label="Top softbox: Power value, W"]')).not.toBeNull();
  });

  test("a typed value commits on Enter", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    typeInto(input, "20");
    expect(onChange).not.toHaveBeenCalled();
    press(input, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(20);
  });

  test("a typed value commits on blur", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    typeInto(input, "7");
    act(() => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(7);
  });

  test("a value past the slider's end is accepted up to the hard limit, and clamped beyond it", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    typeInto(input, "500");
    press(input, "Enter");
    typeInto(input, "-5");
    press(input, "Enter");
    typeInto(input, "9999999");
    press(input, "Enter");
    expect(onChange.mock.calls.map((x) => x[0])).toEqual([500, 0, 1e6]);
  });

  test("text that is not a number is dropped, and Escape drops what was typed", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    typeInto(input, "abc");
    press(input, "Enter");
    expect(input.value).toBe("12.5");
    typeInto(input, "33");
    press(input, "Escape");
    expect(input.value).toBe("12.5");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a comma decimal and a trailing unit are understood", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    typeInto(input, "7,5 W");
    press(input, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(7.5);
  });

  test("a whole-number field rounds what is typed", () => {
    const onChange = vi.fn();
    const c = mount(<Slider label="Walls" mapping={linear(BOUNDS.wallCount)} value={2} onChange={onChange} />);
    const input = field(c, "Walls value");
    typeInto(input, "3.6");
    press(input, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
  });

  test("the arrow keys step the number, and Shift steps ten at a time", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const input = field(c, "Power value");
    press(input, "ArrowUp");
    press(input, "ArrowDown", { shiftKey: true });
    expect(onChange.mock.calls.map((x) => x[0])).toEqual([12.6, 11.5]);
  });

  test("double-click and Delete restore the default, and a slider with no default ignores them", () => {
    const onChange = vi.fn();
    const c = mount(<Slider {...props} onChange={onChange} />);
    const range = c.querySelector('input[type="range"]');
    if (!(range instanceof HTMLInputElement)) throw new Error("no range");
    act(() => { range.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    press(range, "Delete");
    expect(onChange.mock.calls.map((x) => x[0])).toEqual([4, 4]);

    const none = vi.fn();
    act(() => { root?.render(<Slider {...props} defaultValue={undefined} onChange={none} />); });
    const again = c.querySelector('input[type="range"]');
    if (!(again instanceof HTMLInputElement)) throw new Error("no range");
    act(() => { again.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    expect(none).not.toHaveBeenCalled();
  });

  test("a value that differs from its default is marked", () => {
    const c = mount(<Slider {...props} onChange={() => {}} />);
    expect(c.querySelector(".slider")?.hasAttribute("data-changed")).toBe(true);
    act(() => { root?.render(<Slider {...props} value={4} onChange={() => {}} />); });
    expect(c.querySelector(".slider")?.hasAttribute("data-changed")).toBe(false);
  });
});

describe("the other controls", () => {
  test("a switch reports its new state and is named for assistive technology when its label is hidden", () => {
    const onChange = vi.fn();
    const c = mount(<Scope name="Left rim"><Switch label="On" bare checked={false} onChange={onChange} /></Scope>);
    const box = c.querySelector('input[role="switch"]');
    if (!(box instanceof HTMLInputElement)) throw new Error("no switch");
    expect(box.getAttribute("aria-label")).toBe("Left rim: On");
    act(() => { box.click(); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  test("a segmented group is one radio group with the current value checked", () => {
    const onChange = vi.fn();
    const c = mount(
      <Segmented label="Look" value="dark" marked="dark" onChange={onChange}
        options={[{ value: "studio", label: "Studio" }, { value: "dark", label: "Dark" }]} />,
    );
    const radios = [...c.querySelectorAll('input[type="radio"]')].filter((r): r is HTMLInputElement => r instanceof HTMLInputElement);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
    expect(c.querySelector(".chip[data-marked]")?.textContent).toBe("Dark");
    act(() => { radios[0].click(); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("studio");
  });

  test("a colour field takes a hex typed or pasted, with or without the hash, and refuses a partial one", () => {
    const onChange = vi.fn();
    const c = mount(<ColorField label="Colour" value="#1c1c1c" onChange={onChange} />);
    const hex = field(c, "Colour hex");
    typeInto(hex, "C8A064");
    press(hex, "Enter");
    typeInto(hex, "#12");
    press(hex, "Enter");
    expect(onChange.mock.calls.map((x) => x[0])).toEqual(["#c8a064"]);
  });
});
