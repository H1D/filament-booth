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
  src/print/cover.ts,which bead faces the neighbouring material presses on, so the photo leaves them out
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
- The sweep marks the bead faces no ray can reach (`BeadMesh.hidden`, from `cover.ts`), and only the Cycles photo leaves them out, with the vertices only they used (`visiblePart` in `src/photo/cycles-upload.ts`). The preview draws every face: its single-sided material sees through the few-micrometre slits the per-layer wobble opens, where Cycles finds a dark back face. The scene file for native Blender keeps every face too, so e2e flow 6 checks the culling. A face goes only where the part's own material presses on it: every extrusion of the G-code counts, the infill and inner walls the mesh leaves out included, support, brim, skirt and purge lines not (`PART` in `calibration.ts`). The test lines are the ring's own edges (mitred at gentle bends, square at ends and corners), and coverage is exact along each line: the union of the neighbours' capsules. A flat goes when the flat above or below it covers it, on lines at most 0.08 mm apart across its width, to within 5 um. A side goes only on a bead whose flats both go, inside its neighbour by 0.01 mm, with material above and below just past its edge so the groove beside it is closed. A round end goes when its surface and its own flats are covered.
- After an open or a re-slice the worker sends three messages: the mesh, then the lite mesh unasked, then the hidden flags, which the pipeline sets on the mesh. The cover test takes a few seconds on a large part, so it runs after the part is on show. A Cycles photo started before the flags arrive waits for them in `cyclesEngine.fits` (`hiddenFacesSettled`): they save it more than they take. Only when they never come (a newer print, a worker error) does it render every face.
- The test runs on a centreline built with jitter 0, whose points are the shown one's index for index. The wobble's few-micrometre slits sit inside dark grooves; a real lean of more than 5 um keeps the flat. Coverage is exact along the test lines, not across a whole face: on BSCH-04 a few hundred of the 700,000 culled faces have a sliver of open groove beside them.

## Gotchas

- The mesher matches the Python reference to 1.3 µm over 5.8M vertices. `tests/print-parity.test.ts` needs `$BOOTH_REF` and skips without it.
- `vendor/muon-protocol/dist` is committed on purpose. The global `dist` ignore is undone by `!vendor/muon-protocol/dist` in `.gitignore`.
- The slicer engine is AGPL-3.0. Hosting the app publicly carries the AGPL source offer. See `public/slicer/README.md`.
- `three-slicer` was rejected. It under-reported filament by 7 to 9% and ignored the top pattern.
- Parts reach 11M triangles. Never copy mesh buffers on the main thread without need.
- The part is hollow and the hollow is not sealed (outside air reaches it between beads). A face may go only where material presses on it from outside, never because it faces the hollow.
