# Agent

A coding agent on the same computer (Claude Code, Codex, Cursor) controls the open booth tab by writing Blender Python. The tab runs the script in a Pyodide worker, and each `bpy` assignment becomes one `booth.update`. A local bridge process joins the agent's MCP client to the tab. The user opts in with a switch, and nothing starts before it.

```toon
status: active
depends_on[4]: booth,photo,controls,scene
entry_point: src/agent/agent.ts
test_cmd: bunx vitest run tests/agent-props.test.ts tests/agent-protocol.test.ts tests/agent-rna.test.ts tests/agent-host.test.ts tests/agent-python.test.ts tests/agent-bridge.test.ts tests/agent-link.test.ts tests/agent-control.test.ts tests/agent-thumbnail.test.ts tests/ui-agent.test.tsx

files[21]{path,purpose}:
  src/agent/protocol.ts,wire types and the two frame parsers and the pairing hash
  src/agent/rna.ts,the one table from bpy attributes and operators to document fields
  src/agent/host.ts,AgentHost interprets the table against the live Booth and jpegThumbnail
  src/agent/py/bpy.py,generic bpy shim with no booth field names
  src/agent/py/mathutils.py,Vector and Euler and Color for the shim
  src/agent/rpc.ts,blocking worker to main thread call over a SharedArrayBuffer
  src/agent/py-worker.ts,worker entry that loads Pyodide and runs one script at a time
  src/agent/python.ts,PythonRuntime owns the worker and cancel is terminate
  src/agent/link.ts,BridgeLink is the tab's WebSocket client
  src/agent/agent.ts,AgentControl is the switch and one script at a time and the store the UI reads
  src/ui/AgentPanel.tsx,the Agent rail section and the top bar badge with its popover
  tools/agent/bridge.ts,bridge CLI and the three MCP tools
  tools/agent/cli.ts,entry for the Node bundle that the filament-booth npm package ships
  packages/bridge,the filament-booth npm package (bun run bridge:build writes bridge.mjs)
  tools/agent/tabs.ts,loopback WebSocket server for the tab and file access
  tools/agent/jobs.ts,job table and the report the agent sees
  tools/agent/vendor-pyodide.ts,copies the pinned Pyodide from node_modules into public/pyodide
  tools/agent/drive.ts,drives dev/agent.html with the real worker and a real Booth over fakes
  tools/agent/e2e.ts,real MCP client and real bridge and real app in Chromium
  dev/agent.html,dev page that runs scripts against dev/fakes.ts
  dev/agent.tsx,wires host and runtime and in-memory files for that page
  public/pyodide,committed Pyodide runtime (13 MB)
  src/ui/wire.ts,agentControl() builds the control over the real parts
```

## How it fits together

The agent sees three MCP tools: `booth_python` runs a script, `booth_wait` follows one that is still running, `booth_cancel` stops one. There is no JSON command set beside the script. Each tool returns a `JobReport` with the script's output, progress, error and images.

```
agent (MCP, stdio) -> bridge (tools/agent) -> ws://127.0.0.1:<port> -> BridgeLink -> AgentControl -> PythonRuntime (worker) -> AgentHost -> Booth
```

The tab dials the bridge, never the other way. The bridge listens on `127.0.0.1` only and answers only a tab that says hello with the token. A fresh page makes a random token, keeps it in `booth.agent` and shows `claude mcp add --scope user booth -- npx -y filament-booth --token <token>` (`bridgeCommand` in `protocol.ts`), so the user copies one line. User scope gives every agent session the booth, whatever folder it starts in (a T3 Code thread starts in a fresh one). The bridge binds the port on the first tool call, not at start, so an idle session does not hold it. Without `--token` the bridge's token and default port live in `~/.config/filament-booth/bridge.json` (mode 600, created on first start). `FILAMENT_BOOTH_CONFIG_DIR` moves that folder.

## Design Notes

- **Opt-in.** Nothing loads and no socket opens until the user turns on the switch. The switch, port and token persist in `localStorage` under `booth.agent`, never in the document, so an exported setup cannot carry a token. A remembered switch resumes at the next load.
- **Pairing link.** `#agent=<port>.<token>` fills the port and token, is removed from the address bar with `history.replaceState`, and opens the Agent section. It never turns the switch on. If the switch was on, the link turns it off, so a link cannot move a connected tab to another bridge without a click.
- **Connection state is one union.** `AgentStatus` is `off`, `starting` (Python loads), `waiting` (for the bridge), `connected`, `refused` with the bridge's reason, or `unavailable` with a reason. A running script is a separate field, because it can outlive a dropped connection.
- **BridgeLink.** It retries from 0.5 s, doubling to 10 s, and stops after a close code in `CLOSE` (wrong token, other origin, another tab took over, other protocol). A frame that breaks the protocol closes the socket with code 4100 and the link retries. It reads text frames only through `parseBridgeMessage`.
- **One script at a time.** A `run` while one is running is answered as a failed outcome for the new job. A `cancel` from the bridge calls `runtime.cancel("agent")`. Turning the switch off cancels as the user, sends the outcome, then closes the socket and disposes the worker.
- **Frames to the bridge.** `print()` output is batched at 250 ms. Progress goes out at once, then once per second with the newest text. A thumbnail goes out before the outcome. The bridge drops frames for a job that is not the running one.
- **A dropped connection does not stop the script.** The bridge ends that job as failed ("the booth tab disconnected"), and the tab lets the script and its render finish. A `run` that arrives while it still runs is refused with a message that says so.
- **Python in a worker.** CPython 3.14 (Pyodide 314.0.8) runs in `py-worker.ts`. A host call blocks the worker on `Atomics.wait`, so a render keeps `bpy.ops.render.render` synchronous while the page stays live. A runaway `while True: pass` leaves the page at full tick rate. Cancel terminates the worker and starts a fresh one, which is safe because every script starts with fresh globals and Python holds no scene state.
- **One table.** `src/agent/rna.ts` maps every `bpy` attribute and operator to a document field, a limit from `BOUNDS`, and the message an unsupported one raises. `tests/agent-rna.test.ts` walks every leaf of `defaultDocument()`. A new document field fails it until the table reaches it or `UNMAPPED` names it with a reason.
- **Writes.** Every assignment is one `booth.update`, so `parseDocument` validates it and a refused value leaves the document as it was. Session state that is not a booth setting (`scene.render.filepath`, the active object) lives in `AgentHost` and survives a restarted interpreter.
- **Render.** `bpy.ops.render.render(write_still=True)` goes through `PhotoSession.take()`, so the photo card shows an agent's photo as it shows PHOTO. A path ending in `.png` is the file. Any other path is a folder and the photo's own name is added. The agent gets a JPEG thumbnail with a 768 px long edge and the absolute path written. `bpy.ops.render.opengl()` renders a preview through `rasterEngine(viewport)` and is a `RuntimeError` where the page has no viewport.
- **Props.** An agent adds objects beside the part with Blender's own operators: `bpy.ops.mesh.primitive_cube_add`, `primitive_cylinder_add`, `primitive_uv_sphere_add` and `primitive_plane_add`, with Blender's arguments and defaults (a bare cube is 2 m, as in Blender). `bpy.ops.booth.prop_import(filepath=...)` adds an STL as a prop, not as the part. A prop is a `PropObject` in `bpy.data.objects` with `location`, `rotation_euler`, `scale`, `dimensions` and `hide_render`, and its own material in `bpy.data.materials` whose Principled BSDF has Base Color and Roughness. `bpy.data.objects.remove(obj)` removes it. Collections that hang off a prop (its node tree) are listed with their owner's handle, so `members` carries the owner.
- **Files.** `bpy.ops.wm.stl_import(filepath=...)`, `bpy.ops.booth.prop_import(filepath=...)` and `render.filepath` name paths on the agent's machine. The tab asks the bridge to read or write them, and only for the running job. A relative path or a `//` prefix resolves against the bridge's working directory, symlinks are resolved first, and the result must sit inside that directory or one given with `--allow`.
- **Origins.** The bridge accepts `BRIDGE_ORIGINS` (`https://booth.artems.net`, `http://localhost:5173`, `http://127.0.0.1:5173`) and each `--app <origin>`. The command the page shows adds `--app` for any other origin. Any other `Origin`, or none, is refused over the open socket so the page can read why.
- **Newest tab wins.** A second tab with the token replaces the first, which is closed with `CLOSE.replaced`.

## Gotchas

- The agent works on the scene on show. `bpy.data.scenes` lists that one scene; switching scenes is the user's, in the Scenes section.

- The page must be cross-origin isolated, because the worker channel needs `SharedArrayBuffer`. Otherwise `AgentStatus` is `unavailable`, the panel says why and the switch is disabled.
- Every 2D canvas the page reads back stays on the CPU (`willReadFrequently`). `jpegThumbnail` drew on an accelerated canvas first and the agent got a black JPEG in the hardware-GPU Chromium of `tools/e2e/session.ts`. `tests/agent-thumbnail.test.ts` and the thumbnail check in `tools/agent/e2e.ts` cover it.
- Headless Chromium draws the preview with software GL, which stalls the main thread for seconds. After a photo it stalled for 13 s in one run, so `booth_cancel` can wait out its 10 s grace and return `running` with "cancel requested, waiting for the tab to confirm". `booth_wait` then follows it to `cancelled`. In the hardware-GPU session the same script took 5 s, 3 of them a pause written into the script, and a cancel confirmed within 50 ms.
- The bridge waits 15 s for a tab before it returns the pairing instructions. `BridgeConfig.tabWaitMs` shortens it in tests. The command line has no flag for it.
- A busy port means another agent session's bridge holds it. The bridge stays up and every tool call retries the bind.
- From an https origin, Chromium blocks `ws://127.0.0.1` with `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` until the user allows local network access, and headless denies it. With `context.grantPermissions(["local-network-access"])` a PR preview paired with the Node bundle (Chromium 156). That check is manual, not in a suite. Firefox and Safari are untested. Firefox and Safari are untested.
- `public/pyodide` is written by `bun tools/agent/vendor-pyodide.ts` after a version change. Do not edit it. Its files are served from the page's own origin, so the booth makes no CDN call.
- A thumbnail of a photo with a transparent background is drawn onto black, because JPEG has no alpha.
- Run the bridge in tests and scripts with `FILAMENT_BOOTH_CONFIG_DIR` set. Without it, `--pair` and the server create `~/.config/filament-booth/bridge.json`.

## Verification

- `bun run agent:drive` runs `dev/agent.html` with the real worker. It runs a three-light setup with a blocking render while the page keeps ticking, an STL import with a preview, a failing script with a trimmed traceback, and a `while True: pass` loop that Stop ends.
- `bun run agent:e2e` is the whole path with nothing faked. It starts Vite, spawns `bun tools/agent/bridge.ts` with a temporary config folder, drives it with the MCP SDK's `Client`, opens the real app at the pairing link, clicks the switch, and runs a script that imports an STL, relights, stands a green wall prop behind the part, imports the STL again as a prop, and renders with Cycles at 160 by 200 and 4 samples. The photo must be at least 10% wall. It then checks the PNG on disk, the report, the document, the photo card, the preview, cancel, a path outside the working directory, and that turning the switch off ends a running script as cancelled and leaves the bridge with no tab. `--gpu` runs it in the hardware-GPU session.
