/**
 * pipelines.ts: the three render pipelines, ported from the old viewer.
 *
 * Post: GTAO (ambient only) resolved by TRAA while moving. Once the view is
 * still it is supersampled: raw scene passes with the camera jittered by the
 * caller, summed in the accumulator. Every pixel shares a frame's offset, so
 * sub-pixel highlights the samples miss stay as a fixed hatch, not noise: the
 * specular AA in the bead material is kept for stills too.
 */
import {
  HalfFloatType, RenderPipeline, RenderTarget, UnsignedByteType,
  type PerspectiveCamera, type Scene, type WebGPURenderer,
} from "three/webgpu";
import {
  builtinAOContext, mrt, normalView, packNormalToRGB, pass, sample, screenUV, unpackRGBToNormal, velocity,
} from "three/tsl";
import GTAONode, { ao } from "three/addons/tsl/display/GTAONode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import { Accumulator } from "./accumulate";
import { Display } from "./display";

/** GTAO radius in metres. The default 0.25 m is bigger than the part: a noisy, over-dark pocket. */
const AO_RADIUS_M = 0.03;

export class Pipelines {
  readonly accumulator = new Accumulator();
  readonly display = new Display();
  readonly ao: GTAONode;
  readonly #renderer: WebGPURenderer;
  readonly #moving: RenderPipeline;
  readonly #sample: RenderPipeline;
  readonly #show: RenderPipeline;
  /** Moving frames: one TRAA frame at the quality level's size, linear-filtered when shown larger. */
  readonly #movingTarget = new RenderTarget(1, 1, { type: HalfFloatType });

  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera) {
    this.#renderer = renderer;
    const prePass = pass(scene, camera);
    prePass.transparent = false;
    prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
    prePass.getTexture("output").type = UnsignedByteType;
    const preNormal = sample((uv) => unpackRGBToNormal(prePass.getTextureNode().sample(uv)));
    const preDepth = prePass.getTextureNode("depth");
    const scenePass = pass(scene, camera);
    this.ao = ao(preDepth, preNormal, camera);
    this.ao.resolutionScale = 1;
    this.ao.radius.value = AO_RADIUS_M;
    this.ao.useTemporalFiltering = true;
    scenePass.contextNode = builtinAOContext(this.ao.getTextureNode().sample(screenUV).r);
    const traaPass = traa(scenePass, preDepth, prePass.getTextureNode("velocity"), camera);
    traaPass.useSubpixelCorrection = true; // favour the current frame under sub-pixel motion: less smearing
    traaPass.maxVelocityLength = 12; // px/frame of motion for the current frame to replace history. three's 128 keeps ~95 % history
    // while orbiting: the layer stripes' wide clip box lets it trail behind reflections (ghosting). Calibration knob
    this.#moving = linear(renderer, traaPass);
    this.#sample = linear(renderer, this.accumulator.sum(scenePass));
    this.#show = new RenderPipeline(renderer, this.display.node);
    this.#show.outputColorTransform = false;
  }

  /** One TRAA frame, shown. */
  moving(width: number, height: number): void {
    const r = this.#renderer;
    this.#movingTarget.setSize(width, height);
    r.setRenderTarget(this.#movingTarget);
    this.#moving.render();
    r.setRenderTarget(null);
    this.display.show(this.#movingTarget.texture, 1);
    this.#show.render();
  }

  /** One raw sample added to the accumulator; shown when `show`. */
  sample(first: boolean, show: boolean): void {
    const r = this.#renderer, acc = this.accumulator;
    r.setRenderTarget(acc.begin(first));
    this.#sample.render();
    r.setRenderTarget(null);
    acc.end();
    if (show) this.showSum();
  }

  showSum(): void {
    this.display.show(this.accumulator.latestTexture, this.accumulator.count);
    this.#show.render();
  }

  /** Draws whatever the display shows again, after the canvas was resized and cleared. */
  redisplay(): void {
    this.#show.render();
  }

  dispose(): void {
    this.#moving.dispose();
    this.#sample.dispose();
    this.#show.dispose();
    this.#movingTarget.dispose();
    this.accumulator.dispose();
    this.display.dispose();
    this.ao.dispose();
  }
}

/** Linear light out, untouched: the display stage tone-maps. */
function linear(renderer: WebGPURenderer, node: ConstructorParameters<typeof RenderPipeline>[1]): RenderPipeline {
  const p = new RenderPipeline(renderer, node);
  p.outputColorTransform = false;
  return p;
}
