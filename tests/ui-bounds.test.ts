import { describe, expect, test } from "vitest";
import { BOUNDS, DocumentError, defaultDocument, parseDocument, type Bounds } from "../src/document";

const entries = Object.entries(BOUNDS) as [string, Bounds][];

describe("BOUNDS", () => {
  const steered = entries.filter(([, b]) => b.step !== undefined);

  test.each(steered)("%s: the slider range sits inside the hard range", (_name, b) => {
    const slider = b.slider ?? { min: b.min ?? Number.NaN, max: b.max ?? Number.NaN };
    expect(Number.isFinite(slider.min) && Number.isFinite(slider.max)).toBe(true);
    expect(slider.min).toBeLessThan(slider.max);
    expect(slider.min).toBeGreaterThanOrEqual(b.min ?? b.gt ?? -Infinity);
    if (b.gt !== undefined) expect(slider.min).toBeGreaterThan(b.gt);
    expect(slider.max).toBeLessThanOrEqual(b.max ?? Infinity);
    expect(b.step).toBeGreaterThan(0);
  });

  test.each(entries.filter(([, b]) => b.slider !== undefined))("%s: a slider range comes with a step", (_name, b) => {
    expect(b.step).toBeDefined();
  });

  test("the default document sits inside every slider range it is shown on", () => {
    const doc = defaultDocument();
    const within = (value: number, b: Bounds): boolean => {
      const lo = b.slider?.min ?? b.min ?? -Infinity;
      const hi = b.slider?.max ?? b.max ?? Infinity;
      return value >= lo && value <= hi;
    };
    expect(within(doc.slicing.layerHeight, BOUNDS.layerHeight)).toBe(true);
    expect(within(doc.camera.focalMm, BOUNDS.focalMm)).toBe(true);
    expect(within(doc.camera.distance, BOUNDS.cameraDistance)).toBe(true);
    expect(within(doc.output.longEdgePx, BOUNDS.longEdgePx)).toBe(true);
    expect(within(doc.output.samples, BOUNDS.samples)).toBe(true);
    for (const l of doc.studio.lights) {
      expect(within(l.distance, BOUNDS.lightDistance)).toBe(true);
      if (l.kind === "area") expect(within(l.powerW, BOUNDS.powerW)).toBe(true);
    }
  });

  test("parseDocument enforces the table: a value just past a hard limit is rejected, at the limit it is accepted", () => {
    const at = (layerHeight: number) => {
      const doc = structuredClone(defaultDocument());
      doc.slicing.layerHeight = layerHeight as typeof doc.slicing.layerHeight;
      return doc;
    };
    expect(() => parseDocument(at(BOUNDS.layerHeight.min))).not.toThrow();
    expect(() => parseDocument(at(BOUNDS.layerHeight.max))).not.toThrow();
    expect(() => parseDocument(at(BOUNDS.layerHeight.min - 0.001))).toThrow(DocumentError);
    expect(() => parseDocument(at(BOUNDS.layerHeight.max + 0.001))).toThrow(DocumentError);
  });
});
