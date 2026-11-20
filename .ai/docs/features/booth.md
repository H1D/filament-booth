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
- **Scenes.** `Booth` holds several scenes (`scenes`, `activeSceneId`, `addScene`, `switchScene`, `renameScene`, `removeScene`). A scene is a whole `BoothDocument` for the one part: `doc`, the preview, every edit, export and import belong to the scene on show. Slicing is shared, so a scene that comes on show takes the slicing in use and switching never re-slices. Opening a part frames every scene, each keeping its own angle and lens. `takePhoto(sceneId)` compiles another scene for a photo without showing it, with the scene on show as `previous` so shared sections keep their objects. With more than one scene the photo's name carries the scene's name.
- Storage: the scene on show stays under `booth.document` (as before scenes existed). `booth.scenes` holds the order, names, the active id and the other scenes' documents, and is written only when the list or another scene changes. A stored scene that no longer parses is dropped; a list without its active scene is ignored.
- `parseDocument` is strict, with one tolerance. A saved setup without `output.timeLimitS` loads with 300 s.
- `BOUNDS` is the one table of numeric limits. The UI sliders and `parseDocument` both read it.

## Gotchas

- Light watts are true watts. The old viewer's "room watts" were divided by 40 once, in the presets.
- Camera azimuth 0 looks from −Y and turns toward +X.
- `parseDocument` rejects with a field path. Add a new field to the type, `BOUNDS`, the parser and `defaultDocument` together.
- Saving to `localStorage` is scheduled, not immediate. `src/main.tsx` calls `flush()` when the page becomes hidden.
