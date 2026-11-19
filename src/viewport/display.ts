/**
 * display.ts: accumulated linear light to the screen. Divides the sum by
 * its count, tone maps through Blender's AgX tables exactly as film.ts's doc
 * comment prescribes for a shader, lays a transparent film over a
 * checkerboard and dims the canvas outside the photo's crop.
 */
import {
  ClampToEdgeWrapping, Data3DTexture, DataUtils, HalfFloatType, LinearFilter, NearestFilter, NoToneMapping,
  RGBAFormat, SRGBColorSpace, Vector3, Vector4, type MagnificationTextureFilter, type Node, type Texture,
} from "three/webgpu";
import {
  Fn, clamp, float, ivec3, log2, max, mix, pow, renderOutput, screenCoordinate, screenUV, select, step, texture,
  texture3D, uniform, vec3, vec4,
} from "three/tsl";
import type { AgxLook } from "../document";
import { loadAgx, type AgxData } from "../film";

const OUTSIDE_CROP = 0.35;
const CHECKER_PX = 12;
const CHECKER = [0.62, 0.42] as const; // display-linear greys
/** film.ts's guard before every log2. */
const LOG_FLOOR = 1e-30;

/** N^3 RGB float values, red fastest, as an RGBA half-float 3D texture with alpha 1. */
function cube(values: Float32Array, size: number, filter: MagnificationTextureFilter): Data3DTexture {
  const texels = size * size * size, data = new Uint16Array(texels * 4), one = DataUtils.toHalfFloat(1);
  for (let i = 0; i < texels; i++) {
    data[i * 4] = DataUtils.toHalfFloat(values[i * 3]);
    data[i * 4 + 1] = DataUtils.toHalfFloat(values[i * 3 + 1]);
    data[i * 4 + 2] = DataUtils.toHalfFloat(values[i * 3 + 2]);
    data[i * 4 + 3] = one;
  }
  const t = new Data3DTexture(data, size, size, size);
  t.format = RGBAFormat;
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = filter;
  t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** The controls the viewport turns. */
export class Display {
  readonly shown = texture();
  readonly count = uniform(1);
  /** x0, y0, x1, y1 in screen UV. */
  readonly crop = uniform(new Vector4(0, 0, 1, 1));
  readonly transparent = uniform(0);
  readonly node;
  readonly #base = texture3D(cube(new Float32Array(3 * 8), 2, NearestFilter));
  readonly #pre = texture3D(cube(new Float32Array(3 * 8), 2, LinearFilter));
  readonly #u = {
    rows: [uniform(new Vector3(1, 0, 0)), uniform(new Vector3(0, 1, 0)), uniform(new Vector3(0, 0, 1))],
    log2Min: uniform(0), tScale: uniform(1), sScale: uniform(1), tFloor: uniform(0),
    baseSize: uniform(2), preSize: uniform(2), hasPre: uniform(0),
  };
  /** The look on screen; null until the first table loads. */
  #look: AgxLook | null = null;
  #wanted: AgxLook | null = null;

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

  get look(): AgxLook | null {
    return this.#look;
  }

  /** Loads the look's tables and swaps them in; the old look stays on screen until then. */
  async setLook(look: AgxLook): Promise<void> {
    this.#wanted = look;
    const data = await loadAgx(look);
    if (this.#wanted !== look) return;
    this.#install(data);
    this.#look = look;
  }

  show(source: Texture, count: number): void {
    this.shown.value = source;
    this.count.value = count;
  }

  dispose(): void {
    this.#base.value.dispose();
    this.#pre.value.dispose();
  }

  #install(data: AgxData): void {
    const m = data.manifest, u = this.#u;
    const w = m.toWorking;
    u.rows.forEach((row, i) => row.value.set(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]));
    u.log2Min.value = m.log2Min;
    u.tScale.value = 1 / (m.log2Max - m.log2Min);
    u.sScale.value = 1 / (m.preLog2Max - m.log2Min);
    u.tFloor.value = m.tFloor;
    this.#base.value.dispose();
    this.#base.value = cube(data.base, m.base.size, NearestFilter);
    u.baseSize.value = m.base.size;
    if (data.pre) {
      this.#pre.value.dispose();
      this.#pre.value = cube(data.pre.values, data.pre.size, LinearFilter);
      u.preSize.value = data.pre.size;
    }
    u.hasPre.value = data.pre ? 1 : 0;
  }

  /** Blender's AgX, per film.ts: shaper, the look's warp, tetrahedral cube, 2.4 power. renderOutput encodes sRGB. */
  #agx(rgb: Node<"vec3">) {
    const u = this.#u, base = this.#base, pre = this.#pre;
    return Fn(() => {
      const e = vec3(rgb.dot(u.rows[0]), rgb.dot(u.rows[1]), rgb.dot(u.rows[2]));
      const t = max(log2(max(e, LOG_FLOOR)).sub(u.log2Min).mul(u.tScale), u.tFloor);
      const s = clamp(log2(max(rgb, LOG_FLOOR)).sub(u.log2Min).mul(u.sScale), 0, 1);
      // Texel centre of grid node k is (k + 0.5) / N; hardware trilinear is the warp's own interpolation.
      const warp = pre.sample(s.mul(u.preSize.sub(1)).add(0.5).div(u.preSize)).rgb;
      const x = clamp(t.add(warp.mul(u.hasPre)), 0, 1);
      // Tetrahedral, never trilinear: the cube is clipped to the display gamut.
      const g = x.mul(u.baseSize.sub(1));
      const i = g.floor().min(u.baseSize.sub(2));
      const f = g.sub(i);
      let fa: Node<"float"> = f.x, fb: Node<"float"> = f.y, fc: Node<"float"> = f.z;
      let ea: Node<"vec3"> = vec3(1, 0, 0), eb: Node<"vec3"> = vec3(0, 1, 0), ec: Node<"vec3"> = vec3(0, 0, 1);
      const order = (a: Node<"float">, b: Node<"float">, da: Node<"vec3">, db: Node<"vec3">) => {
        const swap = a.lessThan(b);
        return [select(swap, b, a), select(swap, a, b), select(swap, db, da), select(swap, da, db)] as const;
      };
      [fa, fb, ea, eb] = order(fa, fb, ea, eb);
      [fb, fc, eb, ec] = order(fb, fc, eb, ec);
      [fa, fb, ea, eb] = order(fa, fb, ea, eb);
      const at = (offset: Node<"vec3">) => base.load(ivec3(i.add(offset))).rgb;
      const c = at(vec3(0)).mul(fa.oneMinus())
        .add(at(ea).mul(fa.sub(fb)))
        .add(at(ea.add(eb)).mul(fb.sub(fc)))
        .add(at(vec3(1)).mul(fc));
      return pow(max(c, vec3(0)), vec3(2.4));
    })();
  }
}
