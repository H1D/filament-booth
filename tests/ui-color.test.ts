import { describe, expect, test } from "vitest";
import { hexToLinear, kelvinToHex, kelvinTrack, linearToHex, nearestKelvin } from "../src/ui/color";

describe("colour conversion", () => {
  test.each(["#000000", "#1c1c1c", "#808080", "#ffffff", "#c8a064", "#3a3a40"])("%s survives hex to linear and back", (hex) => {
    const rgb = hexToLinear(hex);
    expect(rgb).not.toBeNull();
    if (rgb !== null) expect(linearToHex(rgb)).toBe(hex);
  });

  test("a half-typed or malformed hex is refused", () => {
    expect(hexToLinear("#12345")).toBeNull();
    expect(hexToLinear("123456")).toBeNull();
    expect(hexToLinear("#12345g")).toBeNull();
  });

  test("mid grey in sRGB is the linear albedo the presets use for 0.2", () => {
    const [r] = hexToLinear("#7c7c7c") ?? [0];
    expect(r).toBeCloseTo(0.2, 1);
  });

  test("a channel above 1 clips to the brightest the picker can show", () => {
    expect(linearToHex([4, 0.5, -1])).toBe("#ffbc00");
  });
});

describe("kelvin", () => {
  test("a temperature picked from a colour lands near the temperature that made it", () => {
    for (const k of [2700, 3200, 5600, 6500, 9000]) {
      const hex = kelvinToHex(k);
      const rgb = hexToLinear(hex);
      expect(rgb).not.toBeNull();
      if (rgb === null) continue;
      expect(Math.abs(nearestKelvin(rgb) - k)).toBeLessThanOrEqual(k * 0.06);
    }
  });

  test("warm is orange and cool is blue", () => {
    const warm = hexToLinear(kelvinToHex(2500));
    const cool = hexToLinear(kelvinToHex(10000));
    expect(warm !== null && cool !== null && warm[0] > warm[2] && cool[2] > cool[0]).toBe(true);
  });

  test("the slider track runs warm to cool across the range", () => {
    const track = kelvinTrack(2000, 12000);
    expect(track.startsWith("linear-gradient(to right, #")).toBe(true);
    expect(track).toContain("0%");
    expect(track).toContain("100%");
  });
});
