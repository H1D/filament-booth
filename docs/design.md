# Design

The booth turns a 3D print into a product photo in the browser. The user drops an STL or G-code, sets slicing, filament, lights and camera, sees a live preview, and presses PHOTO for a Cycles render that runs in the tab.

Two independent design sketches reached the same core shape: one saved document, one pure compile step, one frozen scene that every renderer reads. This file records that shape and the decisions made when the two were merged. The type sketch in `src/` is the contract. "A" and "B" below name the two sketches.

## Names

- `BoothDocument` (B): what the user edits and what is saved. Plain JSON.
- `Scene` (B's `FrozenScene`, A's `SceneIR`): the compiled, immutable result. Blender frame (Z up), metres, watts, linear colour. The only thing a renderer reads.
- `compileScene(doc, print)`: pure, runs in Node.

## Decisions

1. **Layout.** B's flat layout, with the rendering file split so no file passes about 500 lines:
   - `src/document.ts`, `src/presets.ts`, `src/print.ts` (+ `src/print/` worker internals), `src/scene.ts`, `src/booth.ts`
   - `src/film.ts`: AgX data, CPU tone map, PNG encode, quick preview of a partial frame
   - `src/photo/photo.ts`: the photo boundary (desk, run, engine interface). `src/photo/cycles.ts`, `src/photo/cycles-worker.ts`, `src/photo/raster.ts` are private to it
   - `src/viewport/viewport.ts`: the preview. `bead-material.ts`, `bake.ts`, `accumulate.ts`, `quality.ts` are private to it
   - `src/ui/`: React panels. `src/main.tsx`: wiring
   Import direction: document ← presets ← print ← scene ← film ← photo, viewport ← booth ← ui. Only `viewport/` and `photo/raster.ts` import three.js. Only `ui/` and `main.tsx` import React.
2. **Axis.** The app frame is Blender Z-up. The mesher emits Z-up metres. The viewport applies one root matrix `BLENDER_TO_VIEWER` to a group that holds part, sweep and lights (B). three.js keeps its default Y-up. A's `DEFAULT_UP = Z` is rejected.
3. **Camera.** Normal orbit camera with azimuth, elevation, distance and target (B). The turntable is a separate pose control. A's "no azimuth, drag spins the part" is rejected.
4. **Slicing settings live in the document** (A): `doc.slicing`. They apply when the print source is an STL. `PrintSource` for an STL carries no settings. A G-code reports its own settings on `SlicedPrint` with `settingsSource: 'file'`, and the panel shows them read-only. Slicer: the Muon3D engine (Orca in WebAssembly), one fresh worker per slice. Settings map to Orca keys: `layer_height`, `wall_loops`, `top_surface_pattern`, `seam_position`, `outer_wall_line_width`, `inner_wall_line_width`, `top_shell_layers`, `enable_arc_fitting`.
5. **No revision counter in the saved document.** Remove `rev` from `BoothDocument`. `Booth` keeps a private revision number, and `Scene` carries it as `docRev` for stale-result checks.
6. **Edits.** `booth.update(mutate)` over a cloned draft (B). No reducer or intent union (A rejected). `update` must keep untouched sections identical by reference, so clone only what the mutator touches, or compare sections after the mutation and reuse the old object when deep-equal.
7. **Change detection by section identity** (A). `Scene` has sections `part`, `lights`, `backdrop`, `world`, `camera`, `film`. `compileScene` takes the previous scene and returns the same section object when its inputs are unchanged. Renderers compare with `===`. Drop B's `hash` and `studioHash` strings.
8. **Lights in the scene are full frames** (A's `EmitterFrame`): `centre`, `xAxis`, `yAxis`, `normal`, `sizeM`, linear colour, `partOnly`. No renderer derives orientation from position and aim. Area lights keep `powerW` and `spreadRad`. Scrims keep top and bottom radiance. Shape is `rect` or `ellipse`.
9. **Floor cards are real scene elements.** B's `floorCards` stays in the document, and compiles to a `FloorCardRing` in the scene: an emissive ring on the floor that only glossy reflection rays see. The preview bakes it as today. Cycles builds it as an emissive mesh with camera, diffuse and shadow visibility off. Delete "Cycles ignores it".
10. **Film settings are explicit** (A's `FilmIR`): width, height, samples, adaptive threshold, max bounces, glossy bounces, direct and indirect clamp, pixel filter width, transparent, denoise, view transform and look. Defaults come from one `FILM_DEFAULTS` constant. Its values were dumped from Blender 5.2.3 with `--factory-startup` (max bounces 12, diffuse 4, glossy 4, transmission 12, direct clamp 0, indirect clamp 10, Blackman-Harris at 1.5 px), then overridden where the reference stills differ (adaptive threshold 0.004, glossy bounces 8, look AgX Medium High Contrast).
11. **Output size** (A): `aspect` and `longEdgePx` in the document. Width and height are derived in `compileScene`. The camera section has no separate aspect field.
12. **Vertex data.** Keep one packed per-vertex word, as the existing worker does, defined once in `print.ts` as `BEAD_WORD` with `packBeadWord` and field descriptors (feature 2 bits, layer index, bead speed). It stays a Float32 attribute so the WebGL2 fallback works. B's separate `feature`, `layer`, `speedRel`, `layerRand` arrays are rejected: at 5 million vertices they cost about 60 MB more. The mesh also carries `tangent` (Int16, path direction) for anisotropy.
13. **Shading has one numeric source.** `compileScene` computes a `LayerTable` on the CPU: for every layer and every feature code, the final roughness before speed and mottle (per-feature base, gloss curve, per-layer sheen from a seeded random, heat gloss), plus a per-layer groove-flatten factor. Both renderers do the same small sum: `table[layer][feature] + speedRel * speedGain + mottle`, clamped to 0.05..1. The preview reads the table as a small data texture. The Cycles engine expands it to a per-vertex roughness attribute at upload. A's `Ops<N>` interface is rejected as more machinery than two formulas need.
14. **Tone map.** `film.ts` holds the AgX matrices and per-look contrast as data, and a CPU implementation. The viewport builds its TSL node from the same data. A unit test checks the two agree on probe colours (B).
15. **Photo boundary** (A's shape, B's naming is fine): `takePhoto(scene)` returns a run with `progress` (state, fraction, latest image), `result: Promise<Photo>`, `cancel()` and `finishNow()` (stop sampling and develop what exists). One photo at a time. A second press with a different scene cancels the first. Engines implement `render(scene, onPass, signal) => Promise<RadianceFrame>` and a cheap `fits(scene)` check. Order: Cycles, then raster. A crash or out-of-memory in Cycles falls through to raster. Both engines return linear float frames and share `film.ts` for tone map and PNG.
16. **Print state** (B): `PrintState` union `empty | loading | ready | error`, with the last good part kept on show during an error or a re-slice. `PrintPipeline` hides slicing, parsing, exposed-wall detection, sweeping, caching and supersession. The lite mesh reuses the cached centreline.
17. **Plate face.** One constant `PLATE_EPS` in `print.ts`, tested on Z. Bed type comes from the document (`auto` reads the G-code's bed).
18. **Branded unit types** (B) stay in `document.ts`.
19. **Parity tooling.** `sceneToJson(scene)` plus mesh buffers feed `tools/blender/render_scene.py`, which rebuilds the scene in native Blender 5.2.3. `tools/compare` reports per-pixel statistics between that and a browser photo.

## Proven facts the design relies on

- Cycles 5.2 CPU kernel in WebAssembly renders 10 million triangles at 1280x720, 64 samples, in 24 s plus 7.7 s of BVH build, with 1.95 GB peak memory, on 16 threads. 
- The Muon3D slicer engine slices the 180 mm LEKV2 part in 12.7 s in a worker and matches native Orca filament length within 0.5 percent. Use one fresh worker per slice, because reusing one ran out of memory.
