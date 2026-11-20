# Print

File to beads. Parses G-code (plain or inside `.gcode.3mf`), or slices an STL in the tab with the Muon3D engine, then sweeps the toolpath into a tube mesh the renderers draw as real printed beads.

```toon
status: stable
depends_on[0]:
entry_point: src/print.ts
test_cmd: BOOTH_REF=~/.t3/scratch/lekv2-photoreal-ref bunx vitest run tests/print-mini.test.ts tests/print-formats.test.ts tests/print-pipeline.test.ts tests/print-parity.test.ts tests/bead-word.test.ts tests/cover.test.ts

files[16]{path,purpose}:
  src/print.ts,PrintPipeline and PrintSource and PrintState and BeadMesh and BEAD_WORD
  src/print/worker.ts,worker entry that serves one print
  src/print/session.ts,worker-side state of one print
  src/print/gcode.ts,G-code text to extrusion runs plus header comments
  src/print/header.ts,reads the slicer's key = value header into settings
  src/print/toolpath.ts,parsed toolpath to centreline and which extrusions are visible
  src/print/centreline.ts,runs to a per-point centreline and its lite thinning
  src/print/sweep.ts,centreline to mesh with a 10-vertex stadium ring (lite 6)
  src/print/exposed.ts,drops inner walls hidden behind the outer wall
  src/print/cover.ts,which bead faces the neighbouring material presses on, so the sweep leaves them out
  src/print/calibration.ts,every number that shapes a bead
  src/print/slicer.ts,Muon3D slicer engine behind one function
  src/print/orca.ts,booth SliceSettings to OrcaSlicer keys and the list of eight top patterns
  src/print/stl.ts,STL reader
  src/print/threemf.ts,3MF container reader
  src/print/a1mini-0.4.json,base machine and process profile for slicing
```

## Design Notes

- `PrintState` is `empty | loading | ready | error`. The last good part stays on show during a load or an error.
- A new drop supersedes the one in flight. The loser rejects with `Superseded`.
- One fresh worker per slice. Slicer assets load from `public/slicer/engine`.
- Per-vertex data is one packed Float32 `word` (`BEAD_WORD`: feature, layer, speed) plus an Int16 `tangent`. Use `packBeadWord` and `unpackBeadWord`, never hand-rolled math.
- Mesh is Z-up metres. `PLATE_EPS` decides which vertices sit on the plate face.
- A G-code keeps the slicing it was made with. `doc.slicing` applies only to STL sources.
- The sweep leaves out bead faces no ray can reach (`cover.ts`, against every extrusion of the G-code, infill included): flats with a layer pressing on them, and the sides and round ends of beads with material above and below. In a layer open to the air the sides and ends stay, because they show in the grooves and past the layer's edge. Vertices are kept, so vertex parity with the Python reference holds. On BSCH-04: 8.66M to 5.43M triangles, BVH 7.0 to 4.4 s, heap 480 MiB smaller, sampling 10 to 22 % faster (fixtures e, f, g), images within 59 to 65 dB of the full mesh.
- The lite mesh (`thin`) is not culled: its points no longer line up with the cover flags.

## Gotchas

- The mesher matches the Python reference to 1.3 µm over 5.8M vertices. `tests/print-parity.test.ts` needs `$BOOTH_REF` and skips without it.
- `vendor/muon-protocol/dist` is committed on purpose. The global `dist` ignore is undone by `!vendor/muon-protocol/dist` in `.gitignore`.
- The slicer engine is AGPL-3.0. Hosting the app publicly carries the AGPL source offer. See `public/slicer/README.md`.
- `three-slicer` was rejected. It under-reported filament by 7 to 9% and ignored the top pattern.
- Parts reach 11M triangles. Never copy mesh buffers on the main thread without need.
- The part is hollow and the hollow is not sealed (outside air reaches it between beads). A face may go only where material presses on it from outside, never because it faces the hollow.
