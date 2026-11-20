# Photo

PHOTO mode. `PhotoDesk.take(scene, partName)` returns a running `PhotoRun`. The desk tries Cycles in WebAssembly first and the raster accumulator second, denoises with Intel Open Image Denoise on WebGPU, then tone maps with Blender's AgX and encodes a PNG.

```toon
status: active
depends_on[3]: scene,preview,cycles-wasm
entry_point: src/photo/photo.ts
test_cmd: bunx vitest run tests/photo.test.ts tests/photo-raster.test.ts tests/cycles-upload.test.ts tests/cycles-wasm.test.ts tests/film.test.ts tests/denoise.test.ts

files[11]{path,purpose}:
  src/photo/photo.ts,PhotoDesk and PhotoRun and PhotoProgress and PhotoEngine and photoFileName
  src/photo/cycles.ts,cyclesEngine() that owns the worker and fits check
  src/photo/cycles-worker.ts,hosts the Cycles module for one render
  src/photo/cycles-upload.ts,Scene into the Cycles C API and passes back out
  src/photo/raster.ts,rasterEngine() over Viewport.accumulate
  src/photo/denoise.ts,OIDN's RT UNet on WebGPU with autoexposure and tiling
  public/oidn/rt_hdr_alb_nrm.tza,OIDN 2.5 weights (Apache-2.0) and their provenance in README.md
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
- `film.denoise` (on by default) runs the denoiser on the final frame before developing. `Photo.denoising` is `denoised`, `off`, or `failed` with the reason. The card prints that reason. A failure (no WebGPU, no guides from the raster engine, a GPU error) develops the noisy frame.
- The denoiser is OIDN 2.5's `rt_hdr_alb_nrm` UNet, as Blender runs it for Cycles with the "Fast" prefilter: HDR colour with the noisy albedo and normal guides. Autoexposure, the PU transfer function, 16 px alignment and tiles overlapping by 96 px follow OIDN's code, so tiled output equals untiled. Tiles stay under 768 MB of GPU memory.
- Measured with `bun tools/denoise/run.ts` against `oidnDenoise` 2.5.0: 61 to 62 dB PSNR after AgX, worst pixel 1/255. 1600x2000 denoises in 0.9 s on an RTX 3060 (4 tiles). On the BSCH-04 part at 16 samples, PSNR against a 512 sample render goes from 29.7 dB noisy to 43.2 dB denoised.
- The time limit's clock stops before denoising, so denoising never cuts sampling short.
- Cycles gets only the part's faces a ray can reach (`visiblePart`: `BeadMesh.hidden` from print/cover.ts): on BSCH-04 7.27M of 8.66M triangles, BVH 14 % faster, heap 230 MiB smaller, sampling about 10 % faster, the image within 62 to 67 dB of the full mesh. The heap estimate counts only those triangles.
- Only colour is denoised. Alpha stays as sampled, so with a transparent background the shadow's alpha keeps its noise.
- Progress states are `preparing | rendering | developing | done | cancelled | failed`. `finishNow()` develops what has been sampled.
- AgX is Blender 5.2.3's own, baked by `tools/blender/bake_agx.py` into `public/lut/` (57³ base cube plus per-look 49³ warps). Worst error 0.68/255.
- The scene attribute for the print direction is `path_tangent`. `tangent` would be read by Cycles as the UV tangent.

## Gotchas

- Wasm returns heap pointers as signed 32-bit. Above 2 GiB they are negative. Always build heap views at `ptr >>> 0`.
- The develop canvas must stay on the CPU (`willReadFrequently`). GPU-accelerated 2D canvases returned all-zero PNGs in one session.
- The bitmap in a `rendering` progress belongs to the run and is closed when replaced. Draw or copy it inside the callback.
- WGSL may assume no NaN or infinity, so the denoiser sanitises its inputs on the CPU while cropping tiles.
- WebGPU reports failed allocations and dispatches through error scopes, not exceptions. `denoise()` checks them and rejects.
- The default is 64 samples. Denoised, BSCH-04 at 1024x1280 reads 49.4 / 50.7 / 52.7 dB at 32 / 64 / 256 samples against a 512 sample render, in 43 / 77 / 278 s, and 64 and 256 look the same. Adaptive sampling (threshold 0.01 to 0.05, min samples 16) bought nothing over simply fewer samples.
- Timings on the dev machine: 800x1000 at 64 samples takes about 53 s. An 11.2M triangle part at 1600x2000 and 256 samples takes 30 to 38 min and a 3 GiB heap with no time limit.
- `?no-cycles` (development builds only) forces the raster fallback.
- Parity against native Blender is 51 to 70 dB PSNR. Recheck with `bun tools/parity/run.ts` after touching `cycles-upload.ts` or `cycles/api/`.
