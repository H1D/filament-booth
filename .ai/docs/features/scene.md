# Scene

`compileScene(doc, print, docRev, previous)` is the single lowering from the saved setup to a frozen `Scene`. The preview, the browser Cycles engine and native Blender all read only the `Scene`, never the document.

```toon
status: stable
depends_on[2]: booth,print
entry_point: src/scene.ts
test_cmd: bunx vitest run tests/scene.test.ts

sections[6]{name,type,holds}:
  part,PartSection,bead mesh and pose matrix and BeadMaterial and LayerTable and PlateFace
  lights,LightsSection,AreaEmitter and ScrimEmitter frames plus FloorCardRing
  backdrop,BackdropSection,sweep mesh and colour and gradient
  world,WorldSection,HDR id and strength and rotation
  camera,CameraSection,world matrix and focal and sensor and aperture and focus distance
  film,FilmSection,width and height and samples and time limit and bounces and clamps and filter and AgX look

files[1]{path,purpose}:
  src/scene.ts,Scene types and compileScene and solvers and exportScene
```

## Design Notes

- Frame is Blender's. Z-up, metres, watts, linear colour. `Mat4` is 16 numbers, column-major.
- Change detection is by section identity. An unchanged section keeps its object, so consumers compare with `===`.
- Emitters are full frames (`centre`, `xAxis`, `yAxis`, `normal`, `sizeM`, shape, colour, `partOnly`). No renderer re-derives a light from angles.
- Shading has one numeric source. `LayerTable` holds roughness per layer and feature, plus flatten and heat. Roughness is `clamp(table + speedRel*speedGain + mottle, 0.05, 1)`.
- `FILM_DEFAULTS` was dumped from a factory Blender 5.2.3 by `tools/blender/dump_defaults.py`. Overrides are glossy bounces 8 and adaptive threshold 0.004.
- `exportScene(scene)` is the only writer of the scene file (JSON plus named buffers). `tools/blender/render_scene.py` and the parity tools read it.
- Solvers are exported for tests: `solvePose`, `solveCamera`, `solveLight`, `refocal`, `framePart`, `filmSize`, `kelvinToRgb`, `resolveMaterial`, `layerHeatCurve`, `sweepMesh`.

## Gotchas

- Camera and light frames are tested against native Blender to 1e-6. Regenerate truth with `tools/blender/camera_and_lights_truth.py` after changing a solver.
- The floor card ring is a faded disc, glossy-only and light-linked to the part. Cycles, the preview bake and `render_scene.py` must all build the same shape.
- `CameraSection` carries a focus distance but no focus point. The preview infers its marker.
- Turntable rotation is counter-clockwise about +Z, as in Blender.
