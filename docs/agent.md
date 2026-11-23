# Connect a coding agent

A coding agent on your computer (Claude Code, Codex, Cursor) can light the scene, change the camera
and start photos in the open booth tab by writing Blender Python. The agent talks to a local bridge.
The tab connects to that bridge on `127.0.0.1` after you turn a switch on. Nothing leaves your
computer.

1. Open the booth at <https://booth.artems.net> in Chrome or Edge and open the **Agent** section at the bottom of the rail. The
   page makes its own token and shows one command with it. Copy it and run it once in a terminal.
   It needs Node.js.

   ```sh
   claude mcp add --scope user booth -- npx -y filament-booth --token <token>
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

   Each agent session starts its own bridge, and one bridge holds the port at a time. A bridge
   takes the port on its first booth tool call, so a session that never uses the booth leaves it
   free. A session that has used it keeps it until it ends, and another then reports the port busy.

2. Start a new agent session in the folder you want scripts to read and write.

3. Running the booth from this checkout instead (`bun install && bun run dev`, then
   <http://localhost:5173>)? The command the page shows works there too. To run the bridge from
   source, register `bun /path/to/filament-booth/tools/agent/bridge.ts` instead, also with `--scope user`. Without
   `--token` it keeps its own token in `~/.config/filament-booth/bridge.json`, and
   `bun tools/agent/bridge.ts --pair` prints a link that gives that token to the page.

4. Turn on **Allow a local agent to control this tab**. The status line reads "Starting Python…",
   then "Waiting for the bridge on port 47615", then "Connected" once the agent first uses a booth
   tool: the bridge takes the port then. While the switch is on, an
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

## What the agent gets

The agent has three tools. `booth_python` runs a script in the tab. `booth_wait` follows a script
that is still running, such as a photo. `booth_cancel` stops one. A script starts with fresh
globals, and the scene persists between scripts. One script runs at a time.
`print(bpy.booth.reference())` lists every attribute and operator the booth supports, with units and
limits. An attribute the booth does not have raises an error that names the booth's equivalent.

File paths in a script are on your computer and relative to the folder the agent runs in. The bridge
reads and writes only inside that folder and the folders you pass with `--allow`. A render with
`write_still=True` writes a PNG to `scene.render.filepath` and also shows in the photo card.

### Camera aperture and lens & film optics

- Importing a part with `bpy.ops.wm.stl_import` or `bpy.ops.booth.gcode_import` frames the camera and picks a default `scene.camera.data.dof.aperture_fstop` sized to keep the part sharp from front to back (tighter f-stops for small macro prints, wider for large parts). You can still override `aperture_fstop` afterwards.
- Developed photos include subtle lens and sensor imperfections by default (`STUDIO_DSLR` profile). Switch profiles with `bpy.ops.booth.optics_apply(profile=...)` (`CLEAN`, `STUDIO_DSLR`, `MACRO`, `DESK_PHONE`) or tune individual settings on `bpy.context.scene.booth.optics`:
  - `grain` (`0..1`) — shadow-weighted ISO sensor grain
  - `glare` (`0..1`) — linear HDR highlight bloom and veiling glare before AgX
  - `vignette` (`0..1`) — optical corner falloff before AgX
  - `chromatic` (`0..1`) — lateral radial R/B fringing towards frame edges
  - `softness` (`0..1`) — radial optical softness (sharp centre, softer corners)
  - `warmth` (`-1..1`) — luminance-preserving white-balance drift (cool to warm)

## Options

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
