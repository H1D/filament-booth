# Architecture

One saved `BoothDocument` is compiled by one pure function into one frozen `Scene`. Every renderer reads only the `Scene`. That is what lets the preview, browser Cycles and native Blender be compared pixel for pixel.

## Component Map

```toon
components[12]{name,type,path,responsibility}:
  BoothDocument,model,src/document.ts,every user setting as plain JSON with bounds and a parser
  Booth,store,src/booth.ts,owns the document and print slot and persists and publishes scenes
  edits,util,src/edits.ts,named multi-field edits for booth.update
  presets,data,src/presets.ts,looks and filaments and focal and aspect and HDR tables
  PrintPipeline,service,src/print.ts,file to bead mesh in a worker (parse or slice then sweep)
  compileScene,compiler,src/scene.ts,document plus print to an immutable Scene in Blender's frame
  Viewport,renderer,src/viewport/viewport.ts,live WebGPU preview and jittered accumulation
  PhotoDesk,service,src/photo/photo.ts,runs one photo through Cycles then raster as fallback
  cyclesEngine,renderer,src/photo/cycles.ts,Cycles wasm in a fresh worker per render
  rasterEngine,renderer,src/photo/raster.ts,fallback photo over Viewport.accumulate
  film,util,src/film.ts,AgX tone map and PNG encode shared by both engines and the preview
  UI,view,src/ui/wire.ts,React rail wired to Booth and the viewport and the photo desk
```

## Data Flow

1. A file is dropped on `src/ui/Stage.tsx`. `Booth.open` hands it to `PrintPipeline`.
2. The print worker parses G-code, or slices an STL with the Muon3D engine using `doc.slicing`, then sweeps the toolpath into a `BeadMesh` (full and lite).
3. A control calls `booth.update(mutate)`. `Booth` clones the document, applies the edit, validates, schedules a save and bumps its private revision.
4. `Booth` calls `compileScene(doc, print, docRev, previous)`. Unchanged sections keep their identity.
5. Subscribers get the new `Scene`. `Viewport.show(scene)` updates only the sections whose identity changed.
6. PHOTO calls `PhotoDesk.take(scene, partName)`. The Cycles engine uploads the scene to a fresh worker, samples, and streams passes. The desk shows a refining image and stops at the sample target or the time limit.
7. `film.develop` tone maps the linear frame with the baked AgX tables and encodes the PNG. The photo card offers Save.

## Patterns

- **Single lowering**: only `compileScene` turns settings into geometry, frames and watts. No renderer reads the document.
- **Section identity**: change detection is `===` on `scene.part`, `lights`, `backdrop`, `world`, `camera`, `film`.
- **One write path**: `booth.update` with mutators. No reducer, no intent union.
- **One table per fact**: `BOUNDS` for limits, `BEAD_WORD` for vertex packing, `LayerTable` for shading numbers, `FILM_DEFAULTS` for render settings, `calibration.ts` for bead shape.
- **Fresh worker per job**: one per slice and one per Cycles render. Cancel is terminate.
- **Ports and fakes**: `BoothDeps`, `PhotoEngine` and `PhotoTools` are injected, so tests and dev pages run without a GPU or wasm.
- **Ground truth by script**: numbers that must match Blender are dumped from Blender by `tools/blender/` and tested against.

## Boundaries

- **Frame**: Blender's. Z-up, metres, watts, linear colour. The viewport's `BLENDER_TO_VIEWER` root matrix is the only axis swap.
- **Network**: none at runtime beyond static assets. No server call for slicing or rendering.
- **Workers**: print worker (`src/print/worker.ts`), slicer engine worker (`public/slicer/engine`), Cycles worker (`src/photo/cycles-worker.ts`).
- **Cross-origin isolation**: required for `SharedArrayBuffer`. `vite.config.ts` sends COOP and COEP. Any other host must send them too.
- **Storage**: `localStorage` key `booth.document`. Setup export and import is the same JSON.
- **Licence boundary**: `public/slicer/engine` is AGPL-3.0. `vendor/muon-protocol` is Apache-2.0.
