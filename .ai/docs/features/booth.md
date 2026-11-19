# Booth

The saved setup and its owner. `BoothDocument` is every user setting as plain JSON. `Booth` owns the document and the print slot, persists the document, and hands subscribers a freshly compiled `Scene` on every change.

```toon
status: stable
depends_on[2]: scene,print
entry_point: src/booth.ts
test_cmd: bunx vitest run tests/booth.test.ts tests/document.test.ts tests/edits.test.ts tests/presets.test.ts

files[5]{path,purpose}:
  src/document.ts,BoothDocument and the BOUNDS table and parseDocument and defaultDocument
  src/units.ts,branded scalars (metres and watts and degrees) and colour and vector shapes
  src/presets.ts,the one list of looks and filaments and focal and aspect presets and HDR table
  src/booth.ts,Booth class with update and open and subscribe and flush and export and import
  src/edits.ts,named edits that return mutators for booth.update
```

## Design Notes

- `booth.update(mutate)` over a cloned draft is the only write path. Edits that touch several fields live in `src/edits.ts` (`applyLook`, `applyFilamentPreset`, `setFocal`, `focusAt`, `addLight`, `removeLight`, `patchLight`).
- The document has no revision counter. `Booth` keeps a private one and stamps it on the `Scene` as `docRev`.
- A preset is copied into the document, never referenced. `presetId` stays after edits so the UI can show "modified" (`lookModified`, `filamentModified`).
- `BoothDeps` injects `storage`, `print` (`PrintPort`), `takePhoto` and an optional `schedule` (type in `src/schedule.ts`). Tests pass fakes.
- `parseDocument` is strict, with one tolerance. A saved setup without `output.timeLimitS` loads with 300 s.
- `BOUNDS` is the one table of numeric limits. The UI sliders and `parseDocument` both read it.

## Gotchas

- Light watts are true watts. The old viewer's "room watts" were divided by 40 once, in the presets.
- Camera azimuth 0 looks from −Y and turns toward +X.
- `parseDocument` rejects with a field path. Add a new field to the type, `BOUNDS`, the parser and `defaultDocument` together.
- Saving to `localStorage` is scheduled, not immediate. `src/main.tsx` calls `flush()` when the page becomes hidden.
