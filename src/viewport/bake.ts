/**
 * bake.ts: the cube maps the preview lights with, and the HDR they start from.
 *
 * Black plastic reads almost only through reflections, so the part is lit
 * by a cube map baked from the scene's emitters: area lights as glowing
 * cards of radiance P / (pi A) / sin^2(spread / 2), scrims as gradient
 * cards, the floor card ring, the sweep lit by RectAreaLights for every
 * emitter that reaches it, the props lit the same way, and the world behind.
 * partOnly emitters appear in this bake and nowhere else, which is light
 * linking for free. The
 * world alone is baked too, for the live backdrop's ambient light.
 *
 * A bake runs after its shaders compile asynchronously, into a spare
 * target, and swaps in when done, so the stale bake stays on screen until
 * then. Requests that arrive meanwhile coalesce into one more bake.
 */
import {
  BufferAttribute, BufferGeometry, CircleGeometry, Color, DoubleSide, FrontSide, Group, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  RectAreaLight, Scene, Vector3, type Node, type Texture, type WebGPURenderer,
} from "three/webgpu";
import {
  Fn, atan, cos, equirectUV, float, mix, pmremTexture, positionLocal, positionWorldDirection, smoothstep, texture,
  uniform, uv, vec3,
} from "three/tsl";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { worldHdrUrl } from "../presets";
import type { BackdropSection, Emitter, FloorCardRing, LightsSection, PropItem, WorldSection } from "../scene";
import { BLENDER_TO_VIEWER, cardMatrix, lightMatrix, toViewer } from "./frame";
import { propGeometry, propMaterial, propMesh } from "./props";
import { areaRadiance, meanRadiance, rectStandIn } from "./radiance";

// GAIN: calibration knob for the part's reflections. 1 is the physical conversion; 0.65 matches the
// Cycles 'light' stills on the part's mean (the 'dark' look still reads brighter than Cycles: its
// narrow, very bright strips leak into the faces through rougher layers). Applied once, on the part's
// environment node, so the bake itself holds physical radiance.
export const BAKE_GAIN = 0.65;
const STUDIO_SIZE = 512;
const WORLD_SIZE = 128;
const NEAR = 0.005, FAR = 20;
/** The ring lies this far above the floor so the floor never wins the depth test. */
const RING_LIFT_M = 1e-4;

/** Blender's world lookup: the equirect HDR read along a direction turned by `rotation` about +Z. */
export function worldNode(hdr: Texture, strength: Node<"float">, rotation: Node<"float">) {
  return Fn(() => {
    const d = positionWorldDirection, c = rotation.cos(), s = rotation.sin();
    // Blender's Rz(theta) is three.js's Ry(theta) once the axes are swapped, and three's equirectUV
    // of a swapped direction is Blender's equirectangular lookup.
    const turned = vec3(c.mul(d.x).add(s.mul(d.z)), d.y, s.negate().mul(d.x).add(c.mul(d.z)));
    return texture(hdr, equirectUV(turned)).rgb.mul(strength);
  })();
}

/** One HDR per URL, loaded once. */
export class HdrCache {
  readonly #loader = new HDRLoader();
  readonly #byUrl = new Map<string, Promise<Texture>>();

  load(hdrId: string): Promise<Texture> {
    const url = worldHdrUrl(hdrId);
    let hit = this.#byUrl.get(url);
    if (!hit) {
      hit = this.#loader.loadAsync(url);
      this.#byUrl.set(url, hit);
    }
    return hit;
  }

  dispose(): void {
    for (const p of this.#byUrl.values()) void p.then((t) => t.dispose(), () => {});
    this.#byUrl.clear();
  }
}

export interface BakeInput {
  readonly lights: LightsSection;
  readonly backdrop: BackdropSection;
  readonly world: WorldSection;
  readonly props: readonly PropItem[];
  readonly hdr: Texture;
}

export interface Baked {
  readonly input: BakeInput;
  readonly studio: Texture;
  readonly world: Texture;
  /** performance.now() when the bake that produced these was requested. */
  readonly requestedAt: number;
}

const unitCard = new PlaneGeometry(1, 1);
const unitDisc = new CircleGeometry(0.5, 64);

/** Owns the PMREM generator, the bake targets and the bake queue. */
export class StudioBake {
  readonly #renderer: WebGPURenderer;
  /** One generator per size: a generator resizes its internal targets whenever the size changes. */
  readonly #studioPmrem: PMREMGenerator;
  readonly #worldPmrem: PMREMGenerator;
  readonly #onBaked: (baked: Baked) => void;
  #pending: { input: BakeInput; at: number } | null = null;
  #running = false;
  #disposed = false;
  #lastWorld: { world: WorldSection; hdr: Texture } | null = null;
  /** [on screen, spare] per kind. */
  #studio: Pair = [null, null];
  #world: Pair = [null, null];

  constructor(renderer: WebGPURenderer, onBaked: (baked: Baked) => void) {
    this.#renderer = renderer;
    this.#studioPmrem = new PMREMGenerator(renderer);
    this.#worldPmrem = new PMREMGenerator(renderer);
    this.#onBaked = onBaked;
  }

  request(input: BakeInput): void {
    this.#pending = { input, at: performance.now() };
    if (!this.#running) void this.#drain();
  }

  get busy(): boolean {
    return this.#running;
  }

  dispose(): void {
    this.#disposed = true;
    this.#pending = null;
    for (const t of [...this.#studio, ...this.#world]) t?.dispose();
    this.#studioPmrem.dispose();
    this.#worldPmrem.dispose();
  }

  async #drain(): Promise<void> {
    this.#running = true;
    try {
      while (this.#pending && !this.#disposed) {
        const { input, at } = this.#pending;
        this.#pending = null;
        const baked = await this.#bake(input, at);
        if (!this.#disposed) this.#onBaked(baked);
      }
    } finally {
      this.#running = false;
    }
  }

  async #bake(input: BakeInput, requestedAt: number): Promise<Baked> {
    const worldChanged = this.#lastWorld?.world !== input.world || this.#lastWorld.hdr !== input.hdr;
    if (worldChanged || this.#world[0] === null) {
      const sky = skyScene(input);
      await this.#renderer.compileAsync(sky, probeCamera());
      this.#world = swap(this.#world, this.#worldPmrem.fromScene(sky, 0, NEAR, FAR, { size: WORLD_SIZE, renderTarget: this.#world[1] }));
      this.#lastWorld = { world: input.world, hdr: input.hdr };
    }
    const worldTexture = this.#world[0]?.texture;
    if (!worldTexture) throw new Error("the world bake produced no target");
    const studio = studioScene(input, worldTexture);
    await this.#renderer.compileAsync(studio.scene, probeCamera());
    const position = new Vector3(...toViewer(input.lights.aim));
    this.#studio = swap(this.#studio, this.#studioPmrem.fromScene(studio.scene, 0, NEAR, FAR, { size: STUDIO_SIZE, position, renderTarget: this.#studio[1] }));
    studio.dispose();
    const studioTexture = this.#studio[0]?.texture;
    if (!studioTexture) throw new Error("the studio bake produced no target");
    return { input, studio: studioTexture, world: worldTexture, requestedAt };
  }
}

/** The new target goes on screen; the old one becomes the spare the next bake writes. */
type Target = ReturnType<PMREMGenerator["fromScene"]>;
type Pair = [Target | null, Target | null];

function swap(pair: Pair, fresh: Target): Pair {
  return [fresh, pair[0]];
}

function probeCamera(): PerspectiveCamera {
  return new PerspectiveCamera(90, 1, NEAR, FAR);
}

function skyScene(input: BakeInput): Scene {
  const s = new Scene();
  // @types/three 0.187 omits Scene.backgroundNode, which the renderer reads.
  Object.assign(s, { backgroundNode: worldNode(input.hdr, uniform(input.world.strength), uniform(input.world.rotationRad)) });
  return s;
}

function studioScene(input: BakeInput, worldEnv: Texture): { scene: Scene; dispose(): void } {
  const { lights, backdrop, props } = input;
  const scene = skyScene(input);
  const root = blenderRoot();
  scene.add(root);
  const owned: { dispose(): void }[] = [];
  for (const e of lights.emitters) {
    const card = new Mesh(e.shape === "ellipse" ? unitDisc : unitCard, emitterMaterial(e));
    owned.push(card.material);
    place(card, cardMatrix(e, e.sizeM[0], e.sizeM[1]));
    root.add(card);
    if (!e.partOnly) root.add(backdropLight(e));
  }
  const sweep = sweepGeometry(backdrop);
  const sweepMaterial = new MeshStandardNodeMaterial({ roughness: backdrop.roughness, side: DoubleSide });
  sweepMaterial.color.setRGB(backdrop.albedo[0], backdrop.albedo[1], backdrop.albedo[2]);
  sweepMaterial.envNode = pmremTexture(worldEnv);
  owned.push(sweep, sweepMaterial);
  root.add(new Mesh(sweep, sweepMaterial));
  const shapes = new Map<PropItem["geometry"], BufferGeometry>();
  for (const p of props) {
    let geometry = shapes.get(p.geometry);
    if (!geometry) {
      shapes.set(p.geometry, geometry = propGeometry(p.geometry));
      owned.push(geometry);
    }
    const material = propMaterial(p);
    material.envNode = pmremTexture(worldEnv);
    owned.push(material);
    root.add(propMesh(p, geometry, material));
  }
  if (lights.floorCards) {
    const ring = floorRing(lights.floorCards);
    owned.push(ring.geometry, ring.material);
    root.add(ring);
  }
  return { scene, dispose: () => owned.forEach((o) => o.dispose()) };
}

export function blenderRoot(): Group {
  const root = new Group();
  root.matrixAutoUpdate = false;
  root.matrix.fromArray(BLENDER_TO_VIEWER);
  return root;
}

export function place(object: Mesh | RectAreaLight, columnMajor: readonly number[]): void {
  object.matrixAutoUpdate = false;
  object.matrix.copy(new Matrix4().fromArray(columnMajor));
  object.matrixWorldNeedsUpdate = true;
}

function emitterMaterial(e: Emitter): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ side: FrontSide });
  const tint = uniform(new Color(e.color[0], e.color[1], e.color[2]));
  m.colorNode = e.kind === "area"
    ? tint.mul(uniform(areaRadiance(e)))
    : tint.mul(mix(uniform(e.bottomRadiance), uniform(e.topRadiance), uv().y));
  return m;
}

/** A RectAreaLight standing in for an emitter, for the sweep. Scrims light it at their mean radiance. */
export function backdropLight(e: Emitter): RectAreaLight {
  const [w, h] = rectStandIn(e);
  const light = new RectAreaLight(new Color(e.color[0], e.color[1], e.color[2]), meanRadiance(e), w, h);
  place(light, lightMatrix(e));
  return light;
}

export function sweepGeometry(b: BackdropSection): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(b.positions, 3));
  g.setAttribute("normal", new BufferAttribute(b.normals, 3));
  g.setIndex(new BufferAttribute(b.index, 1));
  return g;
}

/** scene.ts FloorCardRing: a disc on the floor that only reflections see. */
function floorRing(r: FloorCardRing): Mesh<CircleGeometry, MeshBasicNodeMaterial> {
  const m = new MeshBasicNodeMaterial({ side: FrontSide });
  const p = positionLocal, radius = p.xy.length();
  const facing = cos(atan(p.x, p.y.negate()).sub(uniform(r.keyAzimuthRad))).add(1).mul(0.5).pow2();
  m.colorNode = vec3(mix(uniform(r.farRadiance), uniform(r.keyRadiance), facing)
    .mul(float(1).sub(smoothstep(uniform(r.innerRadiusM), uniform(r.outerRadiusM), radius))));
  const ring = new Mesh(new CircleGeometry(r.outerRadiusM, 96), m);
  ring.position.set(r.centre[0], r.centre[1], r.centre[2] + RING_LIFT_M);
  return ring;
}
