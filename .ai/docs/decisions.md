# Decisions

The full list of 21 design decisions, the tradeoffs accepted and the proven facts is in `docs/design.md`. These are the ones with the largest consequences.

```toon
decisions[11]{id,date,title,status}:
  001,2026-11-19,Real Cycles in WebAssembly for PHOTO,accepted
  002,2026-11-19,Muon3D Orca engine for slicing,accepted
  003,2026-11-19,One Scene compiled from the document,accepted
  004,2026-11-19,Blender frame everywhere with one axis swap,accepted
  005,2026-11-19,booth.update is the only write path,accepted
  006,2026-11-19,Blender's own AgX as a baked table,accepted
  007,2026-11-19,Emitters are full frames and floor cards are real,accepted
  008,2026-11-19,Raster engine as fallback not as the photo,accepted
  009,2026-11-19,Built wasm modules are committed,accepted
  010,2026-11-20,Agent control is Blender Python in a worker through one table,accepted
  011,2026-11-20,Props are document objects with a Principled material,accepted
```

## ADR-001: Real Cycles in WebAssembly for PHOTO

**Status**: accepted
**Date**: 2026-11-19
**Context**: PHOTO must give what Blender gives, in the tab, with no server.
**Decision**: Compile the standalone Cycles 5.2 CPU kernel to wasm32 with a thin C API in `cycles/api/`. A custom WebGPU path tracer and a render server were rejected.
**Consequences**: Photos match native Blender at 51 to 70 dB PSNR. CPU only, so a large part at full size takes tens of minutes. Needs cross-origin isolation and up to 4 GB of heap.

---

## ADR-002: Muon3D Orca engine for slicing

**Status**: accepted
**Date**: 2026-11-19
**Context**: An STL must be sliced in the browser with real slicer behaviour.
**Decision**: Use the Muon3D engine (OrcaSlicer in wasm) under `public/slicer/engine`, one fresh worker per slice. `three-slicer` was rejected for 7 to 9% low filament and an ignored top pattern.
**Consequences**: Output within 0.5% of native Orca. The engine is AGPL-3.0, so public hosting carries a source offer.

---

## ADR-003: One Scene compiled from the document

**Status**: accepted
**Date**: 2026-11-19
**Context**: Three renderers (preview, browser Cycles, native Blender) must agree.
**Decision**: `compileScene` is the single lowering to an immutable `Scene`. Renderers never read the document. Change detection is by section identity.
**Consequences**: Parity can be tested from one exported scene file. Any new setting must be lowered in `src/scene.ts` before a renderer can use it.

---

## ADR-004: Blender frame everywhere with one axis swap

**Status**: accepted
**Date**: 2026-11-19
**Context**: three.js is Y-up and Blender is Z-up. Mixed frames cause silent mirror bugs.
**Decision**: Everything is Z-up metres. The viewport applies `BLENDER_TO_VIEWER` on one root group. Switching three.js itself to Z-up was rejected.
**Consequences**: Scene numbers can be compared with Blender directly. Viewport code must not add a second swap.

---

## ADR-005: booth.update is the only write path

**Status**: accepted
**Date**: 2026-11-19
**Context**: The design review flagged scattered writes as a red flag.
**Decision**: All edits go through `booth.update(mutate)` over a cloned draft. Multi-field edits are named functions in `src/edits.ts`. A reducer with an intent union was rejected.
**Consequences**: One place validates, saves and recompiles. The saved document has no revision counter.

---

## ADR-006: Blender's own AgX as a baked table

**Status**: accepted
**Date**: 2026-11-19
**Context**: The old viewer's AgX approximation was up to 13.8/255 off Blender on mid-greys. One table per look also failed (12 to 39/255).
**Decision**: Bake Blender 5.2.3's OCIO transform into a 57³ base cube plus a 49³ warp per look (`tools/blender/bake_agx.py`, `public/lut/`).
**Consequences**: Worst error 0.68/255. 4.5 MB of tables. The base cube needs a tetrahedral fetch.

---

## ADR-007: Emitters are full frames and floor cards are real

**Status**: accepted
**Date**: 2026-11-19
**Context**: Each renderer re-deriving lights from angles would drift.
**Decision**: `compileScene` emits `AreaEmitter` and `ScrimEmitter` with centre, axes, normal, size, shape and `partOnly`. Floor cards compile to a `FloorCardRing`, a faded disc that is glossy-only and light-linked to the part.
**Consequences**: Light frames are tested against Blender to 1e-6. All three renderers must build the same ring shape.

---

## ADR-008: Raster engine as fallback not as the photo

**Status**: accepted
**Date**: 2026-11-19
**Context**: Cycles can fail to fit a machine or scene.
**Decision**: `PhotoDesk` tries engines in order and falls through on any failure that is not a cancel. The status line names the engine used.
**Consequences**: A photo always comes out. A silent fallback can hide a Cycles bug, so tests assert on `photo.engine`.

---

## ADR-009: Built wasm modules are committed

**Status**: accepted
**Date**: 2026-11-19
**Context**: Building Cycles needs emsdk and about 3 GB of sources.
**Decision**: Commit `public/cycles/` and `public/slicer/`, and the prebuilt `vendor/muon-protocol/dist`.
**Consequences**: `bun install && bun run dev` works on a fresh clone. The repo carries about 36 MB of binaries. `tools/check-clean-checkout.sh` guards against ignored files.

---

## ADR-010: Agent control is Blender Python in a worker through one table

**Status**: accepted
**Date**: 2026-11-20
**Context**: A coding agent should drive the booth in a language it already knows. A JSON command set beside a script would give two ways to do one task.
**Decision**: The agent writes `bpy`. A Pyodide worker runs the script. `AgentHost` interprets one table, `src/agent/rna.ts`, against `Booth`, so each assignment is one `booth.update`. A local bridge in `tools/agent/` is the MCP server and the socket the tab dials. The page loads Python and opens the socket only after the user turns on the switch.
**Consequences**: A new document field must be reached by the table or named in `UNMAPPED`, or a test fails. A runaway script cannot freeze the page, and a cancel costs a fresh interpreter. The repo carries 13 MB of Pyodide. A page on a public HTTPS origin may be unable to dial `ws://127.0.0.1`, and that case is open.

---

## ADR-011: Props are document objects with a Principled material

**Status**: accepted
**Date**: 2026-11-20
**Context**: A product photo often needs more than the part: a wall it hangs on, the battery it holds. The booth held one part, so an agent faked a wall by pointing the camera at the floor.
**Decision**: `doc.props` holds primitives (cube, cylinder, UV sphere, plane) and STLs imported as props. `compileScene` lowers them to `Scene.props`, and Cycles, the preview and native Blender each draw a Principled BSDF with base colour and roughness, outside the part's light set. The agent adds them with Blender's `bpy.ops.mesh.primitive_*_add` and `bpy.ops.booth.prop_import`. An imported mesh lives in the session, as the part does, and the document names it by a hash of the file. Props are not part of a look, so applying a look keeps them.
**Consequences**: No Cycles rebuild was needed: `cb_mesh`, `cb_shader_principled` and `cb_object` already existed for the backdrop. Metal, glass, emission and textures stay out until the wasm gains shaders for them. A saved setup with an imported prop shows it only after the same file is imported again.
