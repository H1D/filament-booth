/**
 * bead-material.ts: the part's TSL material, ported from the old viewer's
 * BeadMaterial and fed by the scene's BeadMaterial section.
 *
 * Roughness follows the BeadMaterial doc comment in scene.ts:
 *   clamp(layers.rough[layer * 4 + feature] + speedRel * speedGain + mottle, ROUGH_MIN, 1)
 * with feature, layer and speed read from the packed word through BEAD_WORD.
 * The plate face replaces it, the motion squash and per-layer flatten bend
 * the normal, and setupVariants keeps the clamped specular anti-aliasing.
 * The part is lit only by its environment (the studio bake): no live lights.
 */
import {
  DataTexture, FloatType, InterpolationSamplingType, MeshPhysicalNodeMaterial, NearestFilter, RGBAFormat, Texture,
  type Node, type NodeBuilder,
} from "three/webgpu";
import {
  Fn, attribute, float, fwidth, int, ivec2, lights, mix, mx_noise_float, mx_noise_vec3,
  normalLocal, normalViewGeometry, normalize, pmremTexture, positionLocal, roughness, smoothstep, step, textureLoad,
  transformNormalToView, uniform, uniformTexture, varying, vec3,
} from "three/tsl";
import { BEAD_WORD, PLATE_EPS, SPEED_STEP_MMS, type BeadMesh, type WordField } from "../print";
import { ROUGH_MIN, type BeadMaterial } from "../scene";
import { BAKE_GAIN } from "./bake";

/**
 * The packed word reaches the fragment flat, from one vertex: interpolated, a value near 2^20 lands an
 * ulp short of the integer and floor() takes a whole step off the feature code and layer.
 */
const word = varying(attribute("word", "float")).setInterpolation(InterpolationSamplingType.FLAT);
/** floor(word / scale) mod size, the layout print.ts defines once. Exact in float32: every packed word is below 2^24. */
const wordField = (field: WordField) => word.div(field.scale).floor().mod(field.size);

/** Row 0: roughness of features 0..3 per layer. Row 1: flatten, heat. */
const TABLE_ROWS = 2;

// Three widens roughness by the screen-space change of the normal (getRoughness). Bead normals turn
// 45 deg every ~0.07 mm, so that pushes bead sides to roughness ~1: glossy PETG reads matte. A clamped
// widening is kept, moving and still: sub-pixel highlights otherwise flicker into moire that TRAA
// smears into trails, and the stills' supersampling (one offset shared by every pixel) leaves them
// as a fixed hatch and wood-grain arcs.
class BeadNodeMaterial extends MeshPhysicalNodeMaterial {
  readonly #bead: Node<"float">;

  constructor(bead: Node<"float">) {
    super({ metalness: 0 });
    this.#bead = bead;
    this.roughnessNode = bead;
  }

  override setupVariants(builder: NodeBuilder): void {
    super.setupVariants(builder);
    // three's getGeometryRoughness, written out because its export is untyped.
    const dn = normalViewGeometry.dFdx().abs().max(normalViewGeometry.dFdy().abs());
    const spread = dn.x.max(dn.y).max(dn.z);
    // Clamped, Filament-style: add the normal's screen-space spread to alpha^2, at most 0.12.
    const r = this.#bead.max(0.045), kernel = spread.pow2().mul(0.5).min(0.12);
    roughness.assign(r.pow2().add(kernel).sqrt().min(1));
  }
}

/** The material and every number it reads. One per viewport; `update` re-points it at a new section. */
export class BeadShading {
  readonly material: BeadNodeMaterial;
  /** 1 while moving: squashes sub-pixel layer profiles (see motionNormal). */
  readonly motionAA = uniform(1);
  readonly #env = pmremTexture(new Texture());
  #table: DataTexture = emptyTable(1);
  readonly #tableNode = uniformTexture(this.#table);
  readonly #u = {
    layerCount: uniform(1), layerHeightM: uniform(2e-4), vRef: uniform(100), speedGain: uniform(0),
    mottleScale: uniform(300), mottleAmp: uniform(0), overlay: uniform(0),
    plateTextured: uniform(1), plateRough: uniform(0.5), plateFar: uniform(0.5), grainPerM: uniform(0),
  };
  #shown: BeadMaterial | null = null;

  constructor() {
    const u = this.#u, table = this.#tableNode;
    const feature = wordField(BEAD_WORD.feature);
    const layer = int(wordField(BEAD_WORD.layer).min(u.layerCount.sub(1)));
    const speedRel = wordField(BEAD_WORD.speed).mul(SPEED_STEP_MMS).div(u.vRef).sub(1).clamp(-1, 1);
    const rough4 = textureLoad(table, ivec2(layer, int(0)));
    const perLayer = textureLoad(table, ivec2(layer, int(1)));
    const flatten = perLayer.x, heat = perLayer.y;
    const isPlate = step(positionLocal.z, PLATE_EPS);

    // Textured PEI imprint on the face printed onto the plate (as render.py): ~0.17 mm grain, satin.
    // Each octave fades out before it gets smaller than ~2 px; its slope spread turns into roughness.
    const grainPx = fwidth(positionLocal).length().mul(u.grainPerM);
    const plateNormal = Fn(() => {
      const p = positionLocal.mul(u.grainPerM);
      const g = mx_noise_vec3(p).mul(smoothstep(0.25, 0.5, grainPx).oneMinus())
        .add(mx_noise_vec3(p.mul(4)).mul(smoothstep(0.06, 0.12, grainPx).oneMinus().mul(0.4)));
      return normalize(vec3(0, 0, -1).add(vec3(g.x, g.y, 0).mul(u.plateTextured.mul(0.35))));
    });

    // Motion level of detail: a 0.2 mm layer under ~3 px can't be resolved by one sample per frame,
    // and its +-69 deg profile normals beat against the pixel grid (moire) that TRAA then smears
    // (ghosting). While moving, the profile tilt is squashed toward the wall (walls: vertical spread;
    // skins / bridges: sideways spread). Still frames get the real profile back, resolved by supersampling.
    const motionNormal = Fn(() => {
      const n = normalLocal.normalize();
      const layerPx = u.layerHeightM.div(fwidth(positionLocal).length().max(1e-9));
      const f = mix(float(1), mix(float(0.05), float(1), smoothstep(1, 3, layerPx)), this.motionAA);
      const skin = step(0.5, feature);
      return mix(vec3(n.x, n.y, n.z.mul(f).mul(flatten)), vec3(n.x.mul(f), n.y.mul(f), n.z), skin).normalize();
    });

    const tableRough = mix(mix(mix(rough4.x, rough4.y, step(0.5, feature)), rough4.z, step(1.5, feature)), rough4.w, step(2.5, feature));
    // mx_noise is centred on 0 with a peak-to-peak of about 2, so half of it is the doc's (noise01 - 0.5).
    const mottle = mx_noise_float(positionLocal.mul(u.mottleScale)).mul(0.5).mul(u.mottleAmp);
    const beadRough = tableRough.add(speedRel.mul(u.speedGain)).add(mottle).clamp(ROUGH_MIN, 1);
    const plateRough = mix(u.plateRough, u.plateFar, smoothstep(0.25, 0.5, grainPx));

    // False colour: blue cool / slow, red warm / fast.
    const ramp = (x: Node<"float">) => mix(vec3(0.05, 0.25, 1), vec3(1, 0.2, 0.02), x.mul(0.5).add(0.5).clamp(0, 1));
    const overlay = mix(ramp(heat), ramp(speedRel), step(1.5, u.overlay)).mul(step(0.5, u.overlay)).mul(0.6);

    const m = this.material = new BeadNodeMaterial(mix(beadRough, plateRough, isPlate));
    m.normalNode = transformNormalToView(mix(motionNormal(), plateNormal(), isPlate));
    m.emissiveNode = overlay;
    // On the node: three reads material.envMapIntensity only for an envMap, never for an envNode.
    m.envNode = this.#env.mul(BAKE_GAIN);
    m.lightsNode = lights([]);
  }

  /** The studio bake the part reflects. */
  setEnvironment(texture: Texture): void {
    this.#env.value = texture;
  }

  update(section: BeadMaterial, mesh: BeadMesh): void {
    const u = this.#u, m = this.material;
    u.layerHeightM.value = mesh.layerHeightM;
    u.vRef.value = mesh.vRefMmS;
    if (section === this.#shown) return;
    this.#shown = section;
    m.color.setRGB(section.baseColor[0], section.baseColor[1], section.baseColor[2]);
    m.ior = section.ior;
    u.speedGain.value = section.speedGain;
    u.mottleScale.value = section.mottleScale;
    u.mottleAmp.value = section.mottleAmp;
    u.overlay.value = section.overlay === "print" ? 0 : section.overlay === "heat" ? 1 : 2;
    const p = section.plate;
    u.plateTextured.value = p.textured ? 1 : 0;
    u.plateRough.value = p.rough;
    u.plateFar.value = p.roughUnresolved;
    u.grainPerM.value = p.grainPerM;
    this.#uploadTable(section.layers);
  }

  dispose(): void {
    this.#table.dispose();
    this.material.dispose();
  }

  #uploadTable(layers: BeadMaterial["layers"]): void {
    const { count } = layers;
    if (this.#table.image.width !== count) {
      this.#table.dispose();
      this.#table = emptyTable(count);
      this.#tableNode.value = this.#table;
    }
    const data = this.#table.image.data;
    if (!(data instanceof Float32Array)) throw new Error("the layer table is not float data");
    data.set(layers.rough, 0);
    for (let k = 0; k < count; k++) {
      const at = (count + k) * 4;
      data[at] = layers.flatten[k];
      data[at + 1] = layers.heat[k];
    }
    this.#table.needsUpdate = true;
    this.#u.layerCount.value = count;
  }
}

function emptyTable(count: number): DataTexture {
  const t = new DataTexture(new Float32Array(count * TABLE_ROWS * 4), count, TABLE_ROWS, RGBAFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
