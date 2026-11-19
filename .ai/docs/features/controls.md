# Controls

The React rail on the right. Collapsible sections for part, filament, lights, backdrop and world, camera, output and setup. Every control reads `Booth` through `useSyncExternalStore` and writes through `booth.update`.

```toon
status: stable
depends_on[3]: booth,preview,photo
entry_point: src/App.tsx
test_cmd: bunx vitest run tests/ui-controls.test.tsx tests/ui-panels.test.tsx tests/ui-model.test.ts tests/ui-wire.test.ts tests/ui-bounds.test.ts tests/ui-color.test.ts tests/ui-photo-session.test.ts

files[22]{path,purpose}:
  src/App.tsx,app shell
  src/main.tsx,builds the real parts and mounts the app
  src/index.css,all styles in plain CSS
  src/ui/wire.ts,connections between Booth and the viewport and the UI store
  src/ui/store.ts,observable for UI state that is not in the document
  src/ui/hooks.ts,how components reach Booth
  src/ui/host.tsx,context that carries the app's parts to components
  src/ui/model.ts,what each rail section means as data
  src/ui/mappings.ts,how a value maps onto a range input
  src/ui/color.ts,sRGB hex for the picker against linear RGB in the document
  src/ui/controls.tsx,labelled slider and numeric field and select and toggle
  src/ui/Rail.tsx,the rail
  src/ui/Section.tsx,collapsible section with reset-when-modified
  src/ui/PartPanel.tsx,slicing settings or read-only G-code facts and pose
  src/ui/FilamentPanel.tsx,filament preset and colour and finish and imperfections
  src/ui/LightsPanel.tsx,looks and per-light controls
  src/ui/WorldPanel.tsx,backdrop and HDR world
  src/ui/CameraPanel.tsx,focal presets and aperture and focus tool
  src/ui/OutputPanels.tsx,aspect and size and samples and time limit and AgX look and transparent background
  src/ui/SetupPanel.tsx,export and import of the setup JSON
  src/ui/Stage.tsx,the viewport host and drop target
  src/ui/TopBar.tsx,top bar with the PHOTO button
```

## Design Notes

- Pattern follows the keenface project. Rail sections collapse, show a reset when modified, and sliders carry a numeric readout.
- Limits come from `BOUNDS` in `src/document.ts`. Do not hard-code a min or max in a panel.
- Focal presets keep the framing by moving the camera (`setFocal` in `src/edits.ts`).
- Plain CSS and native inputs. Popovers and menus use the native Popover API, never hand-rolled z-index.
- UI-only state (open sections, focus tool, photo card) lives in `src/ui/store.ts`, not in the document.

## Gotchas

- `dev/panels.html` runs the panels with fakes from `dev/fakes.ts`. `bun run ui:drive` drives it (23 checks). It does not exercise the real viewport or engines.
- oxlint's hooks rule reads any callback parameter named `use` as a React hook.
- `src/ui/StatusLine.tsx`, `src/ui/icons.tsx` and `src/ui/download.ts` are small helpers not listed above.
