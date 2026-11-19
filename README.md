<img src="assets/icon.svg" width="64" height="64" alt="">

# Filament booth

A virtual photo booth for 3D-printed parts that runs in the browser. Drop an STL, a G-code or a
`.gcode.3mf` on the window. An STL is sliced in the tab by the Muon3D slicer engine (OrcaSlicer in
WebAssembly). A G-code keeps the slicing it was made with. The part is shown as printed beads in
a live WebGPU preview, with filament, lights, backdrop, camera and output settings in the rail on
the right. PHOTO renders a still with Blender's Cycles path tracer, compiled to WebAssembly and
run in a worker, and tone maps it with Blender's own AgX. The result is meant to match what
native Blender renders from the same scene. When Cycles cannot run, the photo falls back to a
raster accumulation on the preview's renderer.

The design note is `docs/design.md`. Read it before changing a module boundary.

## Run it

```sh
bun install
bun run dev        # http://localhost:5173
```

The page must be cross-origin isolated (the slicer and Cycles use wasm threads). The Vite dev and
preview servers send the headers. Any other host must send them too. `bun run build` writes the
static app to `dist/`.

## Checks

- `bun run test` runs the unit tests (Vitest, Node). `bun run typecheck` and `bun run
  typecheck:dev` check the app and the tooling.
- `bun run ui:drive` drives the React panels on `dev/panels.html` in headless Chromium, with
  stand-ins for the viewport, the slicer and the photo engine.
- `bun run e2e [flow numbers] [table]` runs the real app end to end: real parts dropped on the
  window, real controls clicked, the WebGPU preview and Cycles photos measured by pixels. It needs
  a GPU, `gamescope` and `/usr/bin/chromium`, because headless Chromium only offers a software
  WebGPU adapter. It re-runs itself inside a headless gamescope and drives a headful Chromium there.
  Test parts come from `$BOOTH_REF` (default `~/.t3/scratch/lekv2-photoreal-ref`) and native
  Blender from `$BLENDER` (default `~/apps/blender-5.2.3-linux-x64/blender`). Screenshots and
  photos go to `tools/e2e/out/`. `table` adds the preview against Cycles brightness table for the
  five looks.
- `bun tools/parity/run.ts` renders parity fixtures in the browser's Cycles and in native
  Blender 5.2.3 and prints PSNR and pixel statistics. `--scale` and `--cancel` measure a
  10-million-triangle render and cancelling. See `cycles/README.md` for the numbers.
- `tools/viewport/drive.mjs` and `tools/print/drive.mjs` drive the viewport and print pipeline
  dev pages on their own.
- `tools/check-clean-checkout.sh` builds and tests a fresh checkout of HEAD.

Development builds put the live parts on `window.boothDev` for the e2e driver, and `?no-cycles`
makes the Cycles engine report that it does not fit, to check the raster fallback.

## Rebuilding the Cycles module

The built module is committed in `public/cycles/`, so the app builds without the toolchain.
`cycles/build.sh` rebuilds it after a change to `cycles/api/`, a patch or a version pin. It
fetches emsdk and the sources on first use, about 3 GB outside the checkout. `cycles/README.md`
has the steps, the patches and what each build switch does.

## Licences

- The slicer engine in `public/slicer/engine/` is AGPL-3.0-only. Its source, notices and the
  exact release are listed in `public/slicer/README.md`. Serving the app serves this engine, so
  the AGPL's source offer applies to anyone you serve it to.
- The Cycles module in `public/cycles/` is built from Cycles, Apache-2.0, with libraries under
  Apache-2.0, BSD, MIT, zlib and similar licences. `cycles/README.md` lists them. Ship their
  notices with the app.
- The studio HDR `public/hdr/studio_small_09_1k.hdr` is "Studio Small 09" by Sergej Majboroda
  from Poly Haven, released under CC0.
- The AgX tables in `public/lut/` are baked from Blender 5.2.3's colour configuration by
  `tools/blender/bake_agx.py`.
