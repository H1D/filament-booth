/**
 * display.ts: accumulated linear light to the screen. Divides the sum by
 * its count, tone maps with the film's AgX look, lays a transparent film
 * over a checkerboard and dims the canvas outside the photo's crop.
 */
import { NoToneMapping, SRGBColorSpace, Vector4, type Node, type Texture } from "three/webgpu";
import {
  Fn, clamp, float, log2, max, mix, pow, renderOutput, screenCoordinate, screenUV, step, texture, uniform, vec3, vec4,
} from "three/tsl";
import type { AgxLook } from "../document";
import { AGX } from "../film";

const OUTSIDE_CROP = 0.35;
const CHECKER_PX = 12;
const CHECKER = [0.62, 0.42] as const; // display-linear greys

/** M v for a column-major 3x3, as three dot products. */
const apply = (a: readonly number[], v: Node<"vec3">) =>
  vec3(v.dot(vec3(a[0], a[3], a[6])), v.dot(vec3(a[1], a[4], a[7])), v.dot(vec3(a[2], a[5], a[8])));

/** The controls the viewport turns. */
export class Display {
  readonly shown = texture();
  readonly count = uniform(1);
  /** x0, y0, x1, y1 in screen UV. */
  readonly crop = uniform(new Vector4(0, 0, 1, 1));
  readonly transparent = uniform(0);
  readonly #look = { contrast: uniform(1), pivot: uniform(0.606), saturation: uniform(1), power: uniform(1) };
  readonly node;

  constructor() {
    const sum = this.shown, n = this.count.max(1);
    const rgba = vec4(sum.rgb.div(n), sum.a.div(n));
    const toned = this.#agx(rgba.rgb.div(rgba.a.max(1e-6)).max(0));
    const cells = screenCoordinate.x.div(CHECKER_PX).floor().add(screenCoordinate.y.div(CHECKER_PX).floor());
    const checker = mix(float(CHECKER[0]), float(CHECKER[1]), cells.mod(2));
    const alpha = mix(float(1), rgba.a.clamp(0, 1), this.transparent);
    const composed = mix(vec3(checker), toned, alpha);
    const c = this.crop, uv = screenUV;
    const inside = step(c.x, uv.x).mul(step(uv.x, c.z)).mul(step(c.y, uv.y)).mul(step(uv.y, c.w));
    this.node = renderOutput(vec4(composed.mul(mix(float(OUTSIDE_CROP), float(1), inside)), 1), NoToneMapping, SRGBColorSpace);
  }

  setLook(look: AgxLook): void {
    const l = AGX.looks[look];
    this.#look.contrast.value = l.contrast;
    this.#look.pivot.value = l.pivot;
    this.#look.saturation.value = l.saturation;
    this.#look.power.value = l.power;
  }

  show(source: Texture, count: number): void {
    this.shown.value = source;
    this.count.value = count;
  }

  /** film.ts's AGX table as a node, in the CPU path's order. Display-linear sRGB out; renderOutput encodes. */
  #agx(c: Node<"vec3">) {
    const { toRec2020, inset, outset, toSrgb, logMin, logMax, curve, gamma } = AGX;
    const look = this.#look;
    return Fn(() => {
      let x: Node<"vec3"> = apply(inset, apply(toRec2020, c)).max(1e-10);
      x = clamp(log2(x).sub(logMin).div(logMax - logMin), 0, 1);
      x = clamp(x.sub(look.pivot).mul(look.contrast).add(look.pivot), 0, 1);
      const luma = x.dot(vec3(0.2126, 0.7152, 0.0722));
      x = clamp(mix(vec3(luma), x, look.saturation), 0, 1);
      x = pow(x, vec3(look.power));
      let p: Node<"vec3"> = vec3(curve[0]);
      for (const k of curve.slice(1)) p = p.mul(x).add(k);
      return clamp(apply(toSrgb, pow(max(vec3(0), apply(outset, p)), vec3(gamma))), 0, 1);
    })();
  }
}
