# Verification

The tools that prove the booth matches native Blender and works as a whole. Unit tests run in Node. Browser drivers run the panels, the real app and Cycles parity in Chromium.

```toon
status: stable
depends_on[5]: scene,print,preview,photo,controls
entry_point: tools/e2e/drive.ts

commands[10]{cmd,checks}:
  bun run test,unit tests (Vitest and Node)
  bun run typecheck,app types
  bun run typecheck:dev,tooling and dev page types
  bun run lint,oxlint
  bun run ui:drive,panels on dev/panels.html with fakes (26 checks)
  bun run e2e,real app end to end in a hardware-GPU Chromium (13 flows)
  bun run agent:drive,agent Python on dev/agent.html with the real worker (8 checks)
  bun run agent:e2e,real MCP client and bridge and app with a Cycles photo (8 checks and --gpu for gamescope)
  bun tools/parity/run.ts,browser Cycles against native Blender 5.2.3 (PSNR per fixture)
  tools/check-clean-checkout.sh,fresh worktree of HEAD then install and test and typecheck

files[21]{path,purpose}:
  tools/e2e/drive.ts,the thirteen flows and the table and hero studies
  tools/e2e/session.ts,re-runs itself inside headless gamescope and starts headful Chromium
  tools/e2e/pixels.ts,PNG read and masks and IoU and luma and sharpness
  tools/e2e/probe.ts,page probes
  tools/parity/run.ts,parity runner with --scale and --cancel
  tools/parity/fixtures.ts,hand-built fixtures
  tools/parity/compiled.ts,fixtures that go through compileScene on a real part
  tools/parity/browser.ts,drives dev/photo.html
  tools/parity/image.ts,PSNR and difference images
  tools/agent/drive.ts,agent checks on dev/agent.html
  tools/agent/e2e.ts,the agent end to end through a real MCP client
  tools/ui/drive.ts,panel checks
  tools/ui/harness.ts,shared page helpers
  tools/print/drive.mjs,drives dev/print.html
  tools/viewport/drive.mjs,drives dev/viewport.html
  tools/blender/render_scene.py,renders an exported scene file in native Blender
  tools/blender/dump_defaults.py,dumps factory film defaults
  tools/blender/bake_agx.py,bakes the AgX tables in public/lut
  tools/blender/agx_truth.py,AgX probe values for tests
  tools/blender/camera_and_lights_truth.py,camera and light frames for tests
  tools/blender/kelvin_truth.py,blackbody colours for tests
```

## Design Notes

- Ground truth is native Blender 5.2.3 (`$BLENDER`, default `~/apps/blender-5.2.3-linux-x64/blender`).
- Real test parts come from `$BOOTH_REF` (default `~/.t3/scratch/lekv2-photoreal-ref`). Tests that need it skip when it is missing.
- Parity fixtures and `tools/blender/render_scene.py` run with no time limit, because parity compares equal sample counts.
- Each module has a dev page under `dev/` so it can be driven without the others.
- Run `tools/check-clean-checkout.sh` after every merge. It catches files that exist locally but are ignored by git.

## Gotchas

- `bun run e2e` needs a GPU, `gamescope` and `/usr/bin/chromium`. Pass flow numbers to run a subset. Flow 12 alone takes about 40 minutes. Flow 13 checks the photo time limit.
- In the gamescope session 2D canvases do not display, so the refining image is checked from its bitmap, not from screenshots.
- `bun run agent:e2e` needs no GPU. It runs in headless Chromium with software GL, where the main thread stalls for seconds, and takes about 1.5 minutes. `--gpu` runs it in the gamescope session. It waits the bridge's full 15 s once, to see that a switched-off tab leaves the bridge with no tab.
- Driver output goes to `tools/e2e/out/`, `tools/ui/out/`, `tools/parity/out/` and `tools/viewport/out/`, all git-ignored.
- `/tmp` may be a small tmpfs. Set `BOOTH_TMP` or `TMPDIR` to a real disk for the clean-checkout check and the browser drivers.
