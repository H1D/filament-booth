# Preview

The live viewport. three.js on WebGPU with TSL materials, WebGL2 as fallback. It draws the `Scene` at interactive rates, refines a supersampled still when idle, and lends its accumulator to the raster photo engine.

```toon
status: active
depends_on[2]: scene,print
entry_point: src/viewport/viewport.ts
test_cmd: bunx vitest run tests/viewport-frame.test.ts tests/viewport-radiance.test.ts tests/viewport-sampling.test.ts

files[12]{path,purpose}:
  src/viewport/viewport.ts,Viewport class (create and show and setLiteMesh and setFocusTool and accumulate and stats)
  src/viewport/stage.ts,live three.js scene under one root group
  src/viewport/frame.ts,coordinate and framing math and BLENDER_TO_VIEWER
  src/viewport/bake.ts,cube maps the preview lights with and BAKE_GAIN
  src/viewport/radiance.ts,what each emitter contributes as pure numbers
  src/viewport/bead-material.ts,the part's TSL material reading word and tangent
  src/viewport/pipelines.ts,the three render pipelines
  src/viewport/accumulate.ts,jittered accumulation shared by the idle still and the raster photo
  src/viewport/display.ts,accumulated linear light to the screen through AgX
  src/viewport/quality.ts,quality ladder for the moving view
  src/viewport/orbit.ts,camera and OrbitControls
  src/viewport/focus.ts,click-to-focus tool
```

## Design Notes

- `BLENDER_TO_VIEWER` maps (x,y,z) to (x,z,−y) on one root group. It is the only axis swap in the app.
- Lights are baked into cube maps from the emitter frames, not evaluated as analytic three.js lights.
- `PREVIEW_APPROXIMATIONS` lists what the preview does not match in Cycles. Keep it true.
- While the camera moves, the lite mesh (`setLiteMesh`) and the quality ladder keep the frame rate.
- Tone mapping uses the same baked AgX tables as the photo (`src/film.ts`).

## Gotchas

- Preview over Cycles part brightness is 0.96 for studio and gradient but 1.73 dark, 1.33 rim, 1.30 raking. No single `BAKE_GAIN` (0.65) fits all five looks. Open.
- The preview's key shadow is a hard patch where Cycles gives a soft contact shadow. Open.
- Headless Chromium only offers a software WebGPU adapter. Use the gamescope setup in `tools/e2e/session.ts` to test on a real GPU.
- The base AgX cube needs a tetrahedral fetch. Trilinear sampling shifts colours.
- Standalone page for this module: `dev/viewport.html`, driven by `tools/viewport/drive.mjs`.
