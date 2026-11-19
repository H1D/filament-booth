# Photo

PHOTO mode. `PhotoDesk.take(scene, partName)` returns a running `PhotoRun`. The desk tries Cycles in WebAssembly first and the raster accumulator second, then tone maps with Blender's AgX and encodes a PNG.

```toon
status: active
depends_on[3]: scene,preview,cycles-wasm
entry_point: src/photo/photo.ts
test_cmd: bunx vitest run tests/photo.test.ts tests/photo-raster.test.ts tests/cycles-upload.test.ts tests/cycles-wasm.test.ts tests/film.test.ts

files[9]{path,purpose}:
  src/photo/photo.ts,PhotoDesk and PhotoRun and PhotoProgress and PhotoEngine and photoFileName
  src/photo/cycles.ts,cyclesEngine() that owns the worker and fits check
  src/photo/cycles-worker.ts,hosts the Cycles module for one render
  src/photo/cycles-upload.ts,Scene into the Cycles C API and passes back out
  src/photo/raster.ts,rasterEngine() over Viewport.accumulate
  src/schedule.ts,injected timer type shared by Booth and the desk
  src/film.ts,RadianceFrame and AgX load and tone map and develop to PNG and quickLook
  src/ui/photo-session.ts,what the photo card shows as one state machine
  src/ui/PhotoCard.tsx,progress and Cancel and Finish now and Save
```

## Design Notes

- Callers never branch on the engine. A Cycles failure that is not a cancel falls through to raster.
- A `Scene` is immutable, so edits after the press cannot reach a run.
- One photo at a time. A new `take` cancels the one in flight and waits for its engine to stop.
- Fresh worker per render. Cancel terminates it (about 135 ms).
- `film.timeLimitS` caps the whole photo (0 means no limit, default 300 s). The desk enforces it, not the engines. When it runs out the desk stops sampling the way `finishNow()` does and develops the frame so far. It waits for the first pass, so a limit never gives an empty photo. One clock per photo, and a fallback engine inherits what is left.
- `Photo.stoppedBy` says what ended sampling (`samples`, `time-limit` or `user`). `Photo.targetSamples` is what was asked for.
- Progress states are `preparing | rendering | developing | done | cancelled | failed`. `finishNow()` develops what has been sampled.
- AgX is Blender 5.2.3's own, baked by `tools/blender/bake_agx.py` into `public/lut/` (57³ base cube plus per-look 49³ warps). Worst error 0.68/255.
- The scene attribute for the print direction is `path_tangent`. `tangent` would be read by Cycles as the UV tangent.

## Gotchas

- Wasm returns heap pointers as signed 32-bit. Above 2 GiB they are negative. Always build heap views at `ptr >>> 0`.
- The develop canvas must stay on the CPU (`willReadFrequently`). GPU-accelerated 2D canvases returned all-zero PNGs in one session.
- The bitmap in a `rendering` progress belongs to the run and is closed when replaced. Draw or copy it inside the callback.
- No denoiser is built. Do not add a Denoise control until one exists.
- Timings on the dev machine: 800x1000 at 64 samples takes about 53 s. An 11.2M triangle part at 1600x2000 and 256 samples takes 30 to 38 min and a 3 GiB heap with no time limit.
- `?no-cycles` (development builds only) forces the raster fallback.
- Parity against native Blender is 51 to 70 dB PSNR. Recheck with `bun tools/parity/run.ts` after touching `cycles-upload.ts` or `cycles/api/`.
