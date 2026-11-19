/**
 * stage.ts: the live three.js scene. One root group carries
 * BLENDER_TO_VIEWER; under it the part, the sweep, the backdrop's lights
 * and the focus marker sit in Blender coordinates.
 *
 * The part is lit only by the studio bake (bead-material.ts). The sweep is
 * lit by the world, by a RectAreaLight per emitter that reaches it, and by
 * one shadow-casting key that stands in for the strongest of those.
 */
import {
  Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, FloatType, Mesh, MeshBasicNodeMaterial,
  MeshStandardNodeMaterial, NearestFilter, Object3D, PerspectiveCamera, RectAreaLight, RenderTarget, Scene,
  ShadowNodeMaterial, SphereGeometry, Sphere, Texture, Vector3, type WebGPURenderer,
} from "three/webgpu";
import { pmremTexture, positionLocal, uniform, vec4 } from "three/tsl";
import type { BeadMesh } from "../print";
import type { BackdropSection, LightsSection, PartSection, WorldSection } from "../scene";
import { BeadShading } from "./bead-material";
import { backdropLight, blenderRoot, sweepGeometry, worldNode } from "./bake";
import { keyEmitter, keyIrradiance } from "./radiance";
import type { V3 } from "./frame";

const SHADOW_MAP_PX = 2048;
const SHADOW_REACH_M = 4;
const MARKER_PX = 5;

export class Stage {
  readonly scene = new Scene();
  readonly shading = new BeadShading();
  readonly #root = blenderRoot();
  readonly #part: Mesh<BufferGeometry, BeadShading["material"]>;
  #full: { mesh: BeadMesh; geometry: BufferGeometry } | null = null;
  #lite: { mesh: BeadMesh; geometry: BufferGeometry } | null = null;
  #partSection: PartSection | null = null;
  #studioReady = false;

  readonly #sweep: Mesh<BufferGeometry, MeshStandardNodeMaterial | ShadowNodeMaterial>;
  readonly #sweepLit = new MeshStandardNodeMaterial({ side: DoubleSide });
  readonly #sweepCatcher = new ShadowNodeMaterial({ side: DoubleSide });
  #sweepSource: BackdropSection | null = null;
  readonly #worldEnv = pmremTexture(new Texture());
  readonly #worldStrength = uniform(1);
  readonly #worldRotation = uniform(0);
  #worldHdr: Texture | null = null;
  #transparent = false;

  readonly #key = new DirectionalLight(0xffffff, 0);
  readonly #keyTarget = new Object3D();
  #keySoft: { centre: V3; x: V3; y: V3; w: number; h: number } | null = null;
  #rects: RectAreaLight[] = [];

  readonly #marker = new Mesh(new SphereGeometry(1, 16, 12), new MeshBasicNodeMaterial({ color: new Color(6, 1.6, 0.25), depthTest: false }));
  readonly #pick = {
    scene: new Scene(), root: blenderRoot(), mesh: new Mesh(new BufferGeometry(), new MeshBasicNodeMaterial()),
    target: new RenderTarget(1, 1, { type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter }),
  };

  constructor() {
    this.scene.add(this.#root);
    this.#part = new Mesh(new BufferGeometry(), this.shading.material);
    this.#part.matrixAutoUpdate = false;
    this.#part.castShadow = true;
    this.#part.visible = false;
    this.#sweep = new Mesh(new BufferGeometry(), this.#sweepLit);
    this.#sweep.receiveShadow = true;
    this.#sweepLit.envNode = this.#worldEnv;
    const k = this.#key;
    k.castShadow = true;
    k.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
    k.shadow.radius = 10;
    k.shadow.blurSamples = 16;
    k.shadow.bias = -0.0005;
    k.shadow.autoUpdate = false; // the part never moves under the live key: re-cast on a change and each new still
    k.target = this.#keyTarget;
    this.#marker.renderOrder = 1;
    this.#marker.visible = false;
    this.#root.add(this.#part, this.#sweep, k, this.#keyTarget, this.#marker);
    this.#pick.mesh.matrixAutoUpdate = false;
    this.#pick.mesh.material.outputNode = vec4(positionLocal, 1);
    this.#pick.root.add(this.#pick.mesh);
    this.#pick.scene.add(this.#pick.root);
  }

  /** Something to draw: a part with its first bake, or no part at all. */
  get ready(): boolean {
    return this.#studioReady;
  }

  setPart(part: PartSection | null): void {
    this.#partSection = part;
    if (part === null) {
      this.#dropFull();
      this.setLite(null);
      this.#part.visible = false;
      return;
    }
    if (this.#full?.mesh !== part.mesh) {
      this.#dropFull();
      this.setLite(null);
      this.#full = { mesh: part.mesh, geometry: beadGeometry(part.mesh) };
      this.#part.geometry = this.#full.geometry;
      this.#pick.mesh.geometry = this.#full.geometry;
    }
    this.#part.matrix.fromArray(part.toWorld);
    this.#part.matrixWorldNeedsUpdate = true;
    this.#pick.mesh.matrix.fromArray(part.toWorld);
    this.#pick.mesh.matrixWorldNeedsUpdate = true;
    this.shading.update(part.material, part.mesh);
    this.#part.visible = this.#studioReady;
    this.#fitShadow();
  }

  setLite(mesh: BeadMesh | null): void {
    if (this.#lite?.mesh === mesh) return;
    if (this.#lite) {
      if (this.#part.geometry === this.#lite.geometry && this.#full) this.#part.geometry = this.#full.geometry;
      this.#lite.geometry.dispose();
    }
    this.#lite = mesh === null ? null : { mesh, geometry: beadGeometry(mesh) };
  }

  /** The lite mesh for this frame only; the caller puts the full one back with `useLite(false)`. */
  useLite(on: boolean): boolean {
    const g = on && this.#lite ? this.#lite.geometry : this.#full?.geometry;
    if (!g || g === this.#part.geometry) return false;
    this.#part.geometry = g;
    return true;
  }

  get liteAvailable(): boolean {
    return this.#lite !== null;
  }

  setLights(lights: LightsSection): void {
    for (const r of this.#rects) this.#root.remove(r);
    this.#rects = [];
    const key = keyEmitter(lights.emitters);
    for (const e of lights.emitters) {
      if (e.partOnly || e === key) continue;
      const r = backdropLight(e);
      this.#rects.push(r);
      this.#root.add(r);
    }
    const k = this.#key;
    if (key === null) {
      k.intensity = 0;
      this.#keySoft = null;
    } else {
      const floor: V3 = [lights.aim[0], lights.aim[1], 0];
      k.intensity = keyIrradiance(key, floor);
      k.color.setRGB(key.color[0], key.color[1], key.color[2]);
      this.#keySoft = { centre: key.centre, x: key.xAxis, y: key.yAxis, w: key.sizeM[0], h: key.sizeM[1] };
      this.#keyTarget.position.set(...floor);
      this.#keyTarget.updateMatrixWorld();
    }
    this.softKey(null);
  }

  /** The key at a point of its softbox, offsets in -0.5..0.5 of its size, or its centre. */
  softKey(offset: readonly [number, number] | null): void {
    const s = this.#keySoft;
    if (!s) return;
    const [u, v] = offset ?? [0, 0];
    this.#key.position.set(
      s.centre[0] + s.x[0] * u * s.w + s.y[0] * v * s.h,
      s.centre[1] + s.x[1] * u * s.w + s.y[1] * v * s.h,
      s.centre[2] + s.x[2] * u * s.w + s.y[2] * v * s.h,
    );
    this.#fitShadow();
  }

  setBackdrop(b: BackdropSection): void {
    const old = this.#sweepSource;
    if (!old || old.positions !== b.positions || old.normals !== b.normals || old.index !== b.index) {
      this.#sweep.geometry.dispose();
      this.#sweep.geometry = sweepGeometry(b);
    }
    this.#sweepSource = b;
    this.#sweepLit.color.setRGB(b.albedo[0], b.albedo[1], b.albedo[2]);
    this.#sweepLit.roughness = b.roughness;
    this.#sweep.material = b.shadowCatcher ? this.#sweepCatcher : this.#sweepLit;
    this.#transparent = b.shadowCatcher;
    this.#updateBackground();
  }

  setWorld(hdr: Texture, world: WorldSection): void {
    this.#worldStrength.value = world.strength;
    this.#worldRotation.value = world.rotationRad;
    if (this.#worldHdr !== hdr) {
      this.#worldHdr = hdr;
      this.#updateBackground(true);
    }
  }

  /** The bake's results: the part's reflections and the sweep's ambient world light. */
  setEnvironments(studio: Texture, world: Texture): void {
    this.shading.setEnvironment(studio);
    this.#worldEnv.value = world;
    this.#studioReady = true;
    this.#part.visible = this.#partSection !== null;
  }

  recastShadow(): void {
    this.#key.shadow.needsUpdate = true;
  }

  /** A small marker at a Blender-frame point, `pxPerM` sizing it to a few pixels; null hides it. */
  setMarker(point: V3 | null, pxPerM: number): void {
    this.#marker.visible = point !== null;
    if (point === null) return;
    this.#marker.position.set(...point);
    this.#marker.scale.setScalar(MARKER_PX / pxPerM);
  }

  get markerVisible(): boolean {
    return this.#marker.visible;
  }

  hideMarker(): void {
    this.#marker.visible = false;
  }

  /** The part-local point under canvas pixel (x, y), or null on a miss: one pixel rendered with positions as colour. */
  async pick(renderer: WebGPURenderer, camera: PerspectiveCamera, x: number, y: number, width: number, height: number): Promise<V3 | null> {
    if (!this.#full || !this.#part.visible) return null;
    const cam = camera.clone();
    cam.setViewOffset(width, height, x, y, 1, 1);
    const p = this.#pick;
    p.root.updateMatrixWorld(true);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(p.target);
    renderer.render(p.scene, cam);
    renderer.setRenderTarget(before);
    const px = await renderer.readRenderTargetPixelsAsync(p.target, 0, 0, 1, 1);
    return px[3] > 0.5 ? [px[0], px[1], px[2]] : null;
  }

  /** Bytes of vertex and index data this stage holds for the part, for memory checks. */
  get partBytes(): number {
    const size = (g: BufferGeometry | undefined) => g
      ? Object.values(g.attributes).reduce((s, a) => s + (a instanceof BufferAttribute ? a.array.byteLength : 0), 0) + (g.index?.array.byteLength ?? 0)
      : 0;
    return size(this.#full?.geometry) + size(this.#lite?.geometry);
  }

  dispose(): void {
    this.#dropFull();
    this.setLite(null);
    this.#sweep.geometry.dispose();
    this.#sweepLit.dispose();
    this.#sweepCatcher.dispose();
    this.#marker.geometry.dispose();
    this.#marker.material.dispose();
    this.#pick.mesh.material.dispose();
    this.#pick.target.dispose();
    this.#key.shadow.dispose();
    this.shading.dispose();
  }

  #dropFull(): void {
    if (!this.#full) return;
    this.#full.geometry.dispose();
    this.#full = null;
    this.#part.geometry = new BufferGeometry();
    this.#pick.mesh.geometry = this.#part.geometry;
  }

  #updateBackground(rebuild = false): void {
    const hdr = this.#worldHdr;
    const current: unknown = Reflect.get(this.scene, "backgroundNode");
    const wanted = !this.#transparent && hdr !== null;
    if (wanted && (rebuild || current == null)) {
      // @types/three 0.187 omits Scene.backgroundNode, which the renderer reads.
      Object.assign(this.scene, { backgroundNode: worldNode(hdr, this.#worldStrength, this.#worldRotation) });
    } else if (!wanted) {
      Object.assign(this.scene, { backgroundNode: null });
    }
  }

  /** The key's shadow box: the posed part, reaching far enough for a grazing key's long shadow. */
  #fitShadow(): void {
    const part = this.#partSection, cam = this.#key.shadow.camera;
    const bounds = part
      ? new Box3(new Vector3(...part.worldBounds.min), new Vector3(...part.worldBounds.max))
      : new Box3(new Vector3(-0.1, -0.1, 0), new Vector3(0.1, 0.1, 0.2));
    const r = bounds.getBoundingSphere(new Sphere()).radius * 1.2;
    const d = this.#key.position.distanceTo(this.#keyTarget.position);
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: Math.max(0.01, d - 2 * r), far: d + SHADOW_REACH_M });
    cam.updateProjectionMatrix();
    this.#key.shadow.needsUpdate = true;
  }
}

/** GPU geometry over the mesh's own arrays: three keeps references, never copies. */
function beadGeometry(mesh: BeadMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(mesh.position, 3));
  g.setAttribute("normal", new BufferAttribute(mesh.normal, 3, true));
  g.setAttribute("word", new BufferAttribute(mesh.word, 1));
  g.setIndex(new BufferAttribute(mesh.index, 1));
  // From the mesh's own box: computing one would walk millions of vertices.
  g.boundingBox = new Box3(new Vector3(...mesh.bboxM.min), new Vector3(...mesh.bboxM.max));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new Sphere());
  return g;
}
