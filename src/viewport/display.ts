/**
 * display.ts: accumulated linear light to the screen. Divides the sum by
 * its count, tone maps through Blender's AgX tables exactly as film.ts's doc
 * comment prescribes for a shader, lays a transparent film over a
 * checkerboard and dims the canvas outside the photo's crop.
 */
import {
  ClampToEdgeWrapping, Data3DTexture, DataUtils, HalfFloatType, LinearFilter, NearestFilter, NoToneMapping,
  RGBAFormat, SRGBColorSpace, Vector2, Vector3, Vector4, type MagnificationTextureFilter, type Node, type Texture,
} from "three/webgpu";
import {
  Fn, If, clamp, float, fract, ivec3, log2, max, mix, pow, renderOutput, screenCoordinate, screenUV, select, step, texture,
  texture3D, uniform, vec2, vec3, vec4,
} from "three/tsl";
import { CLEAN_FILM_OPTICS, type AgxLook, type FilmOptics } from "../document";
import { OPTICS_CONSTANTS, loadAgx, warmthGains, type AgxData } from "../film";

const OUTSIDE_CROP = 0.35;
const CHECKER_PX = 12;
const CHECKER = [0.62, 0.42] as const; // display-linear greys
/** film.ts's guard before every log2. */
const LOG_FLOOR = 1e-30;
/** Six directions for the preview's two-ring optical glare sample. */
const TIGHT_RING = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as const);
const WIDE_RING = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6), Math.sin((i * Math.PI) / 3 + Math.PI / 6)] as const);

/** Deterministic 0..1 hash over integer pixel coordinates (trig-free, consistent across WebGPU and WebGL2). */
function hash01(p: Node<"vec2">, seed: number) {
  const p3 = fract(vec3(p.x, p.y, p.x).add(seed * 17.31).mul(0.1031));
  const d = p3.dot(vec3(p3.y, p3.z, p3.x).add(33.33));
  const q = p3.add(d);
  return fract(q.x.add(q.y).mul(q.z));
}

/** Zero-mean triangular noise in -1..1. */
function triNoise(p: Node<"vec2">, seed: number) {
  return hash01(p, seed).add(hash01(p, seed + 17)).sub(1);
}

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
  readonly #texel = uniform(new Vector2(1 / 512, 1 / 512));
  readonly #opt = {
    grain: uniform(0),
    glare: uniform(0),
    vignette: uniform(0),
    chromatic: uniform(0),
    softness: uniform(0),
    wb: uniform(new Vector3(1, 1, 1)),
  };
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
  #optics: FilmOptics = CLEAN_FILM_OPTICS;

  constructor() {
    const sum = this.shown, n = this.count.max(1), c = this.crop, uv = screenUV;
    const opt = this.#opt, texel = this.#texel;
    const rgba = vec4(sum.rgb.div(n), sum.a.div(n));
    const alpha = mix(float(1), rgba.a.clamp(0, 1), this.transparent);

    // Sample un-premultiplied linear radiance at any screen UV.
    const sampleLinear = (at: Node<"vec2">) => {
      const s = sum.sample(clamp(at, vec2(0), vec2(1))).div(n);
      return s.rgb.div(s.a.max(1e-6)).max(0);
    };

    const developed = Fn(() => {
      const cropMin = vec2(c.x, c.y);
      const cropSize = vec2(c.z.sub(c.x), c.w.sub(c.y)).max(vec2(1e-5));
      const cropUv = uv.sub(cropMin).div(cropSize);
      const delta = cropUv.sub(0.5);
      const r2 = delta.x.mul(delta.x).add(delta.y.mul(delta.y)).mul(2);

      const lin = rgba.rgb.div(rgba.a.max(1e-6)).max(0).toVar();

      // Lateral chromatic aberration: 2-tap radial linear blend stays smooth on NearestFilter float targets.
      If(opt.chromatic.greaterThan(0), () => {
        const rad = r2.max(0).sqrt();
        const shiftUv = delta.mul(rad).mul(opt.chromatic.mul(OPTICS_CONSTANTS.chromaticMaxFrac)).mul(cropSize);
        const shiftPx = shiftUv.div(texel).length();
        const dir = shiftUv.div(shiftPx.max(1e-6));
        const lo = shiftPx.floor();
        const hi = lo.add(1);
        const frac = shiftPx.sub(lo);
        const r = mix(sampleLinear(uv.add(dir.mul(lo))).x, sampleLinear(uv.add(dir.mul(hi))).x, frac);
        const b = mix(sampleLinear(uv.sub(dir.mul(lo))).z, sampleLinear(uv.sub(dir.mul(hi))).z, frac);
        lin.assign(vec3(r, lin.y, b));
      });

      // Optical lens softness: sharpest at centre, slightly softer towards the corners.
      If(opt.softness.greaterThan(0), () => {
        const sx = texel.x, sy = texel.y;
        const soft = sampleLinear(uv.add(vec2(sx.negate(), sy.negate())))
          .add(sampleLinear(uv.add(vec2(sx, sy.negate()))))
          .add(sampleLinear(uv.add(vec2(sx.negate(), sy))))
          .add(sampleLinear(uv.add(vec2(sx, sy))))
          .mul(0.25);
        const blend = opt.softness.mul(OPTICS_CONSTANTS.softnessMaxBlend).mul(r2.mul(r2).mul(0.92).add(0.08));
        lin.assign(mix(lin, soft, blend));
      });

      // Dual-ring linear HDR bloom + wide veiling glare before AgX.
      If(opt.glare.greaterThan(0), () => {
        const tightR = cropSize.mul(0.011);
        const wideR = cropSize.mul(0.055);
        const thresh = float(OPTICS_CONSTANTS.glareThreshold);
        const knee = float(OPTICS_CONSTANTS.glareKnee);
        const tightSum = vec3(0).toVar();
        for (const [dx, dy] of TIGHT_RING) {
          const s = sampleLinear(uv.add(vec2(dx, dy).mul(tightR)));
          const lum = s.dot(vec3(0.2126, 0.7152, 0.0722));
          const soft = clamp(lum.sub(thresh).add(knee), 0, knee.mul(2));
          const excess = soft.mul(soft).div(knee.mul(4)).add(max(lum.sub(thresh).sub(knee), 0));
          tightSum.addAssign(s.mul(excess.div(lum.max(1e-6))));
        }
        const wideSum = vec3(0).toVar();
        for (const [dx, dy] of WIDE_RING) {
          wideSum.addAssign(sampleLinear(uv.add(vec2(dx, dy).mul(wideR))));
        }
        lin.addAssign(tightSum.mul(opt.glare.mul(OPTICS_CONSTANTS.glareTightGain / TIGHT_RING.length)));
        lin.addAssign(wideSum.mul(opt.glare.mul(OPTICS_CONSTANTS.glareWideGain / WIDE_RING.length)));
      });

      // Optical corner vignetting (cos^4-like falloff) and luminance-preserving warmth.
      If(opt.vignette.greaterThan(0), () => {
        const denom = float(1).add(opt.vignette.mul(OPTICS_CONSTANTS.vignetteMaxK).mul(r2));
        lin.assign(lin.div(denom.mul(denom)));
      });
      lin.assign(lin.mul(opt.wb));

      // AgX display curve (returns display-gamma ~2.4 value before linearisation).
      const display = this.#agxEncoded(lin).toVar();

      // Shadow-weighted, softly-correlated sensor ISO grain.
      If(opt.grain.greaterThan(0), () => {
        const p = screenCoordinate.xy.floor();
        const lum = display.dot(vec3(0.2126, 0.7152, 0.0722));
        const env = float(0.35).add(float(0.65).mul(pow(float(1).sub(lum).max(0), 1.4)))
          .mul(float(1).sub(float(0.85).mul(lum.mul(lum).mul(lum))));
        const soft = triNoise(p, 1).mul(0.72)
          .add(triNoise(p.add(vec2(-1, 0)), 1).add(triNoise(p.add(vec2(1, 0)), 1))
            .add(triNoise(p.add(vec2(0, -1)), 1)).add(triNoise(p.add(vec2(0, 1)), 1)).mul(0.07))
          .mul(1.36);
        const c0 = triNoise(p, 31), c1 = triNoise(p, 53), c2 = triNoise(p, 79);
        const cMean = c0.add(c1).add(c2).div(3);
        const chroma = vec3(c0.sub(cMean), c1.sub(cMean), c2.sub(cMean)).mul(OPTICS_CONSTANTS.grainChromaRatio);
        const amp = opt.grain.mul(OPTICS_CONSTANTS.grainLumaAmp).mul(env).mul(alpha);
        display.assign(clamp(display.add(chroma.add(soft).mul(amp)), 0, 1));
      });

      return pow(max(display, vec3(0)), vec3(2.4));
    })();

    const cells = screenCoordinate.x.div(CHECKER_PX).floor().add(screenCoordinate.y.div(CHECKER_PX).floor());
    const checker = mix(float(CHECKER[0]), float(CHECKER[1]), cells.mod(2));
    const composed = mix(vec3(checker), developed, alpha);
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

  setOptics(optics: FilmOptics): void {
    this.#optics = optics;
    this.#opt.grain.value = optics.grain;
    this.#opt.glare.value = optics.glare;
    this.#opt.vignette.value = optics.vignette;
    this.#opt.chromatic.value = optics.chromatic;
    this.#opt.softness.value = optics.softness;
    const [r, g, b] = optics.warmth !== 0 ? warmthGains(optics.warmth) : [1, 1, 1];
    this.#opt.wb.value.set(r, g, b);
  }

  get optics(): FilmOptics {
    return this.#optics;
  }

  show(source: Texture, count: number, width?: number, height?: number): void {
    this.shown.value = source;
    this.count.value = count;
    const img = source.image as { width?: number; height?: number } | undefined;
    const w = Math.max(1, width ?? img?.width ?? 1);
    const h = Math.max(1, height ?? img?.height ?? 1);
    this.#texel.value.set(1 / w, 1 / h);
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

  /** Blender's AgX, per film.ts: shaper, the look's warp, tetrahedral cube (still gamma-2.4 encoded). */
  #agxEncoded(rgb: Node<"vec3">) {
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
      return max(c, vec3(0));
    })();
  }
}
