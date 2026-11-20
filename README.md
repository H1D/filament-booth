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

## Connect a coding agent

A coding agent on your computer (Claude Code, Codex, Cursor) can light the scene, change the camera
and start photos in the open booth tab by writing Blender Python. The agent talks to a local bridge.
The tab connects to that bridge on `127.0.0.1` after you turn a switch on. Nothing leaves your
computer.

1. Open the booth at <https://booth.artems.net> in Chrome or Edge and go to **Setup → Agent**. The
   page makes its own token and shows one command with it. Copy it and run it in the folder you
   want the agent to work in. It needs Node.js.

   ```sh
   claude mcp add booth -- npx -y filament-booth --token <token>
   ```

   For Codex or Cursor, add an MCP server that runs the part after `--`:

   ```toml
   # ~/.codex/config.toml
   [mcp_servers.booth]
   command = "npx"
   args = ["-y", "filament-booth", "--token", "<token>"]
   ```

   `claude mcp add` keeps an existing `booth` server as it was. If you added one before, with
   another token, port or the `bun` command, run `claude mcp remove booth` first.

   Each agent session starts its own bridge, and one bridge holds the port at a time. Registering
   the bridge for every project (`--scope user`) lets an unrelated session hold the port, and the
   session you are working in then reports that the port is busy.

2. Start the agent in that folder.

3. Running the booth from this checkout instead (`bun install && bun run dev`, then
   <http://localhost:5173>)? The command the page shows works there too. To run the bridge from
   source, register `bun /path/to/filament-booth/tools/agent/bridge.ts` instead. Without
   `--token` it keeps its own token in `~/.config/filament-booth/bridge.json`, and
   `bun tools/agent/bridge.ts --pair` prints a link that gives that token to the page.

4. Turn on **Allow a local agent to control this tab**. The status line reads "Starting Python…",
   then "Waiting for the bridge on port 47615", then "Connected". While the switch is on, an
   **Agent** badge shows in the top bar. Its popover has **Stop script** and **Turn off agent
   control**.

The switch, port and token are remembered in this browser, so the next load reconnects without a
click. A pairing link turns the switch off, so you confirm a new bridge yourself.

The browser keeps the token in the storage of the page's origin. Any other app you later serve from
that origin, such as another project on `http://localhost:5173`, can read it and reach the bridge
while an agent session runs. Delete `~/.config/filament-booth/bridge.json` and pair again to replace
the token.

Now ask the agent for something, such as "light the part with a warm key and a cool fill, then
render a 1600 px photo into renders/".

### What the agent gets

The agent has three tools. `booth_python` runs a script in the tab. `booth_wait` follows a script
that is still running, such as a photo. `booth_cancel` stops one. A script starts with fresh
globals, and the scene persists between scripts. One script runs at a time.
`print(bpy.booth.reference())` lists every attribute and operator the booth supports, with units and
limits. An attribute the booth does not have raises an error that names the booth's equivalent.

File paths in a script are on your computer and relative to the folder the agent runs in. The bridge
reads and writes only inside that folder and the folders you pass with `--allow`. A render with
`write_still=True` writes a PNG to `scene.render.filepath` and also shows in the photo card.

### Options

`npx -y filament-booth` and `bun tools/agent/bridge.ts` take these flags. The agent's MCP config can
pass them as arguments.

- `--token <t>` uses the token the page shows. Without it the bridge uses the one in `bridge.json`.
- `--port <n>` listens on this port instead of the one in `bridge.json`.
- `--app <origin>` accepts a page served from another origin, for example `http://localhost:4173`
  for `bun run preview`. `https://booth.artems.net` and `http://localhost:5173` need no flag. The first `--app` is also the base of the pairing link.
- `--allow <dir>` lets scripts read and write one more folder.

Without `--token`, the token and default port are in `~/.config/filament-booth/bridge.json`, mode
600, created on first start. Set `FILAMENT_BOOTH_CONFIG_DIR` to use another folder. If the port is busy, another agent
session's bridge holds it. Start this bridge with `--port <n>`, then run
`bun tools/agent/bridge.ts --pair --port <n>` for a link that carries that port.

Chrome asks to let booth.artems.net reach devices on your local network the first time the switch
connects. Allow it. Denied, the status stays at "Waiting for the bridge" and the console shows
`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`. Allow it again in the site settings. Firefox
and Safari are untested.

`bun run bridge:build` bundles the bridge for Node into `packages/bridge/bridge.mjs`, which is what
the `filament-booth` npm package ships. Publish it with `npm publish` from `packages/bridge`.

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
  photos go to `tools/e2e/out/`. Flow 12 alone renders the 180 mm part at 1600 x 2000 and 256
  samples, about 40 minutes here, so it sets the time limit to No limit (the app's default is 5
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
