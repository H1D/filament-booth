# Development

## Run it

```sh
bun install
bun run dev        # http://localhost:5173
```

The page must be cross-origin isolated (the slicer and Cycles use wasm threads). The Vite dev and
preview servers send the headers. Any other host must send them too. `bun run build` writes the
static app to `dist/`.

The design note is `docs/design.md`. Read it before changing a module boundary.

## Checks

- `bun run test` runs the unit tests (Vitest, Node). `bun run typecheck` and `bun run
  typecheck:dev` check the app and the tooling.
- `bun run ui:drive` drives the React panels on `dev/panels.html` in headless Chromium, with
  stand-ins for the viewport, the slicer and the photo engine.
- `bun run agent:drive` runs the agent's Python on `dev/agent.html` with the real Python worker and a
  real `Booth` over stand-ins. `bun run agent:e2e` runs the whole path with nothing faked: the real
  bridge driven by an MCP client, the real app in Chromium, and a Cycles photo of 160 by 200 pixels.
  It needs only `/usr/bin/chromium`, takes about a minute and a half, and accepts `--gpu` for the
  gamescope session.
- `bun run e2e [flow numbers] [table] [hero]` runs the real app end to end: real parts dropped on the
  window, real controls clicked, the WebGPU preview and Cycles photos measured by pixels. It needs
  a GPU, `gamescope` and `/usr/bin/chromium`, because headless Chromium only offers a software
  WebGPU adapter. It re-runs itself inside a headless gamescope and drives a headful Chromium there.
  Test parts come from `$BOOTH_REF` (default `~/.t3/scratch/lekv2-photoreal-ref`) and native
  Blender from `$BLENDER` (default `~/apps/blender-5.2.3-linux-x64/blender`). Screenshots and
  photos go to `tools/e2e/out/`. Flow 12 alone renders the 180 mm part at 1600 x 1600 and 256
  samples, half an hour or more here (about 40 minutes at 1600 x 2000), so it sets the time limit to No limit (the app's default is 5
  minutes). Flow 13 sets a 30 second limit and checks that a 64 sample photo stops early. `table` (preview against Cycles brightness for the five looks)
  and `hero` (the preview against an old reference still) run only when named.
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
