# Cycles in the browser

PHOTO renders with Blender's Cycles path tracer, compiled to WebAssembly: standalone Cycles 5.2.3
with its CPU kernel, no GPU devices, plus a C API for the booth scene (`api/`). The built module
is committed in `public/cycles/` (`cycles_booth.mjs` and `cycles_booth.wasm`), so the app builds
without this toolchain. Only rebuild after changing `api/`, a patch or a version pin.

## Rebuild

```sh
cycles/build.sh
```

That one command runs three steps. Each skips work already done, so after an `api/` change it only
recompiles the API and relinks (about 15 s).

1. `setup_sources.sh` fetches emsdk 7.0.0 and Ninja and clones Cycles `release/5.2` at
   `c2dc903f` (5.2.3). It applies `patches/cycles-5.2.3-wasm.patch` and re-applies it when the
   patch file changes.
2. `build_deps.sh` builds the wasm32 static libraries Cycles links (19 packages: OpenImageIO,
   OpenColorIO, OpenEXR, oneTBB and their dependencies) into `$CYCLES_WASM_ROOT/deps/install`.
   `build_deps.sh <package>` rebuilds one.
3. `build_cycles.sh` configures and builds Cycles and the API and copies the module to
   `public/cycles/`, printing its size.

Everything heavy goes under `CYCLES_WASM_ROOT`, outside the checkout. That covers emsdk, sources,
dependency installs and build trees, about 3 GB. It defaults to
`~/.t3/scratch/booth-spikes/cycles-wasm`, the proof-of-concept directory, whose dependency
libraries the scripts reuse. Point it anywhere else for a clean build. A clean build needs network
access and roughly 10 minutes on 16 threads.

Build switches that matter, all in `build_cycles.sh`:

- The generic kernel only (the patch), wasm SIMD by auto-vectorisation (`-msimd128`), wasm
  exceptions, pthreads.
- `-sMALLOC=mimalloc`. Emscripten's default dlmalloc has one global lock, so a 2-million-triangle
  BVH built slower on 16 threads than on one (measured in the proof).
- Heap 256 MB growing to 4 GB. One pthread pool worker per hardware thread plus 4, created up
  front.
- Embree, OSL, OpenVDB, OpenSubdiv, OpenImageDenoise, Alembic, USD, path guiding and the XML
  reader are off.

## What is in here

| File | What |
|---|---|
| `api/booth.h` | The C API's contract: call order, render states, object flags |
| `api/session.cpp` | Session, film, camera, render control, progressive pass snapshots |
| `api/scene.cpp` | Meshes and attributes, the bead and backdrop materials, area lights, scrims, floor cards, world |
| `src/photo/cycles-upload.ts` | Scene into the C API: per-vertex expansion, heap traffic, HDR decode, memory estimate |
| `src/photo/cycles-worker.ts` | Hosts the module for one render |
| `src/photo/cycles.ts` | `cyclesEngine(): PhotoEngine` |
| `tools/blender/render_scene.py` | The same scene in native Blender 5.2.3 |
| `tools/parity/` | Fixtures, the browser and Blender parity run |

Settings the Scene does not name are what Blender 5.2.3's sync writes for a factory scene rendered
with `blender -b`. Examples: blue-noise sampling, seed 0, light tree, glossy filter 1, approximate
shadow catcher, world MIS with an automatic map, lights invisible to the camera, lights and world
counted as shadow catchers. Both sides therefore sample the same paths, and parity differences come
from arithmetic, not from settings.

## Engine behaviour

- One worker per scene setup. A finished render's worker waits 2 min with its session; a photo
  that changes only the camera or the film renders again there (`cb_session_again`), which keeps
  every object, mesh and shader and so the BVH. Anything else terminates it and takes a fresh
  worker: a wasm heap never shrinks, so a long-lived worker would keep the high-water mark of the
  largest part rendered (2.5 GiB at 10 million triangles), and a fresh one recovers from a trap.
  `tests/cycles-wasm.test.ts` checks that a render again equals a fresh session's pixel for pixel
  across camera, size, sample count, transparency and depth of field, and after Finish. Cycles
  only raises a session's sample count on its own, so `cb_film` sets it every render. The C API
  supports several sessions in one module too: the heap stops growing after the second.
- Abort with reason `"finish"` asks Cycles to stop after the batch of samples in flight. Cycles
  sizes a batch to about 1 s of work below 32 samples and 2 s above, so finish takes up to that
  long. It returns a frame in which every pixel has the same sample count.
- Any other abort rejects at once and posts `cancel` to the worker. The worker calls `cb_cancel`,
  frees the session and confirms, and only then is it terminated. Terminating it straight away
  is not enough. Cycles' threads are nested workers busy in wasm, and Chromium stops those by
  force only two seconds after their parent goes: 16 cores stayed busy for 2.2 to 2.5 s.
- Passes arrive every 1 to 6 s (Cycles spaces its updates out as a render goes on) as RGBA float,
  bottom row first; `readPasses` flips them in the worker. Cycles copies them on its session thread
  between batches, with no path traced meanwhile, so progress copies the colour only. The denoising
  albedo and normal guides are copied once, with the final tile, which Cycles also writes when a
  render is finished early. At 1600 x 2000 on the scale fixture this took the copies from 1.14 s
  (16 snapshots, 71 ms each, when every snapshot held all three passes, flipped and widened on
  that thread) to 0.34 s (17 snapshots) over about 100 s of sampling. `RenderStats.snapshotMs`
  reports it.
- Posting the scene structured-clones the part's mesh on the main thread: 106 to 154 ms over four
  renders of 10 million triangles (about 280 MB). The print pipeline could make this free by
  allocating `BeadMesh` buffers on a `SharedArrayBuffer`. The page is cross-origin isolated
  anyway.

## How each side expresses the scene

| Feature | Here (C API) | Native Blender (`render_scene.py`) |
|---|---|---|
| Part-only lights and scrims | Part object `receiver_light_set = 1`, emitter `light_set_membership = 1 << 1` | `light_linking.receiver_collection` set to a collection that holds the part |
| Scrims invisible to the camera | Object visibility without `PATH_RAY_VISIBILITY_CAMERA` | `visible_camera = False` |
| Floor cards seen by glossy rays only | Visibility `PATH_RAY_VISIBILITY_GLOSSY`, plus linking to the part | `visible_glossy` only, plus `receiver_collection` |
| Scrim gradient | Per-vertex `radiance` attribute (exact: affine in y) | render.py's Generated Y into Map Range |
| Area lights | `AreaLight` object, local -Z along the frame normal, invisible to the camera | Area light object with the same matrix (Blender's default camera visibility is off) |
| Shadow catcher | `Object::is_shadow_catcher` on the backdrop, transparent background, approximate shadow catcher | `is_shadow_catcher`, `film_transparent` |
| World | In-memory `ImageLoader` fed from JavaScript's RGBE decode | The .hdr file, read by OpenImageIO; both decode without the half-step offset |
| Camera | The vertical field of view and aperture radius given | Lens, 36 mm sensor, AUTO fit, f-stop |
| BVH | BVH2 (no Embree in wasm) | `--bvh bvh2` (default) or `embree`; needs the developer UI and Cycles debug preferences on |

Path tangent: both sides name the attribute `path_tangent`. Cycles resolves an Attribute node
named `tangent` to the UV tangent, not to a mesh attribute of that name. Checked in Blender 5.2.3:
it returns (0.99, 0, 0), the default tangent, where the mesh stores (0.25, 0.5, 0.75). So the
reference `render.py` stretched its highlights along a tangent derived from generated
coordinates, not along the print path its comment describes.

## Measured

Parity, `bun tools/parity/run.ts`, 256 samples, adaptive threshold 0.004, Standard view transform,
8 bit. Fixtures a to d are hand-built scenes at 640 x 400. Fixtures e to g go `defaultDocument()`
and two looks through the app's own path (G-code, print session, named edits, `compileScene`) on a
real bead mesh, at 512 x 640 (the document's 4:5 at a 640 px long edge). Fixture (d) is compared
over 50 % grey because its film is transparent.

| Fixture | Checks | PSNR dB, native BVH2 | PSNR dB, native Embree | Mean abs diff /255 | Over 4/255 | Alpha mean abs diff /255 |
|---|---|---|---|---|---|---|
| a | bead material, per-vertex roughness, HDR world turned 30 degrees | 62.55 | 62.64 | 0.032 | 0.00 % | 0 |
| b | ellipse key with spread 60, part-only rim with spread 40, part-only scrim | 57.86 | 57.92 | 0.050 | 0.22 % | 0 |
| c | floor cards (the faded disc) with a dark glossy part | 67.52 | not run | 0.010 | 0.00 % | 0 |
| d | f/2.8 at 12 cm, transparent film, shadow catcher | 61.27 | 61.30 | 0.054 | 0.00 % | 0.014 |
| e | the default document: PETG Basic under the studio look | 61.42 | not run | 0.039 | 0.01 % | 0 |
| f | the dark look (part-only strips and scrims) with PLA Matte | 58.88 | not run | 0.032 | 0.04 % | 0 |
| g | the gradient look (floor card ring), turntable 40 degrees, resting on the right face | 54.48 | not run | 0.184 | 0.05 % | 0 |

Fixture (c) was 69.43 dB before the floor ring became the faded disc its contract describes (it
was a hard-edged annulus). It moved because the scene changed, not the agreement: the table
fixture's glossy reflections now carry a radial fade that both sides compute.

What limits these numbers: 16 hardware threads (8 cores with SMT) shared with other work on the
machine whose load was not measured, so the seconds are indicative and the image statistics are
not affected, one run per configuration, headless Chromium on localhost, native Blender 5.2.3 with
its AVX2 kernel. The browser renders are deterministic: fixtures a to d came out byte-identical
across two builds of the tree. For e to g the part is
`bsch04/sliced/plate_1.gcode` from the LEKV2 reference folder (8.66 million triangles), and Node
and the page each compile the scene from that text. `run.ts` stops unless the SHA-256 of their two
scene files is equal, so the compile cannot differ between them unseen. Fixture (g) is the highest
at 0.184 because of its plate face: 157 of the 159 pixels over 4/255 lie in a box that is 9 % of
the frame around that face, where the mean difference is 0.50 against 0.15 elsewhere. The face
carries the grain, a Voronoi and noise bump at 6000 per metre on a 25 mm face. The likely cause is
that the two kernels round that float arithmetic differently and the bump amplifies it. That is
inferred from where the difference sits, not isolated.

The BVH does not limit agreement: Embree and BVH2 agree to 0.2 dB. What differs is arithmetic.
The native AVX2 kernel and the wasm kernel, auto-vectorised by a different compiler with a
different libm, round differently. A path whose random decisions sit near a threshold then takes
another branch. Fixture (b) differs most because its rim and scrim highlights on the anisotropic
walls are the highest-variance pixels.

Scale, `bun tools/parity/run.ts --scale`: 10.08 million part triangles, 1280 x 720, 64 samples,
rendered twice in one page:

| Run | BVH build | Start to first sample | Sampling | Wasm heap | Cycles peak |
|---|---|---|---|---|---|
| 1 | 8.2 s | 10.1 s | 52.0 s | 2539 MiB | 855 MiB |
| 2 | 8.1 s | 9.8 s | 51.4 s | 2539 MiB | 855 MiB |

Why the proof sampled the same triangle count in 24 s and this engine takes about 52 s. One run
each of `run.ts --scale --repeat 1 --query <change>`; three baseline runs gave 52.1 to 56.9 s, so
differences under about 5 s are noise on this shared machine. The proof's own page, rerun the
same day, still sampled its scene in 22.5 and 22.8 s, so the machine is not the difference.

| Change from the scale fixture | Sampling, 64 spp |
|---|---|
| none | 52.1 to 56.9 s |
| adaptive sampling off | 53.1 s |
| every bounce limit 8, as the proof | 51.9 s |
| pixel filter 1.0 px | 58.5 s |
| mottle amplitude 0 (the noise node stays in the graph) | 51.8 s |
| no plate bump (Voronoi and noise height) | 47.4 s |
| the plate bump on plate triangles only (now the default, see below) | 44.9 to 50.8 s |
| world strength 0 | 45.6 s |
| adaptive off, bounces 8, no plate bump | 48.3 s |
| anisotropy 0, mottle 0, no plate bump, world 0 | 36.8 s |
| camera 2.5 times further back | 31.9 s |

Bounces, the adaptive threshold and the pixel filter cost nothing measurable. What the time is
made of is the scene: how much of the frame, and of the bounce rays off the sweep, lands on the
10-million-triangle part (the fixture's camera fills the frame with it; the proof's vase stood
on a plane under an empty sky), and the bead shader with the HDR world (anisotropic GGX, the plate
bump evaluated on every bead hit, world importance sampling) against the proof's plain Principled
BSDF and constant world.

The plate bump used to be computed on every bead hit and only shows on the plate face. Its
strength is the plate mask, which is 0 on any triangle with no vertex on the bed, and a bump of
strength 0 returns the normal it was given. So `uploadPart` gives such triangles the bead shader
built without the Voronoi, the noise and their three evaluations for the bump
(`cb_mesh_shader_index`, two shaders on `cb_object`); triangles on the plate keep the full one.
Parity against native Blender, which keeps the bump on every bead, is unchanged for all seven
fixtures (within 0.01 dB of the table above). In one session: 52.6 and 54.5 s of sampling before, 44.9, 47.0, 49.0
and 50.8 s after, 45.7 and 47.3 s with no plate bump at all (`--query plate=0`).

Adaptive sampling cannot show up in this table: at the threshold 0.004 Cycles' automatic minimum
is ceil(16 / 0.004^0.3) = 84 samples, so at 64 samples it never stops a pixel. At the default 256
samples it can, which these runs do not measure.

Cancel, `bun tools/parity/run.ts --cancel`, Chromium's CPU time sampled every 50 ms: with 13 to
18 cores busy before the abort, Chromium is under one core 130 ms after a cancel while sampling
and 138 ms after a cancel during the 10-million-triangle BVH build. The promise settles in under
1 ms. Under Node, `cb_cancel` itself returns in 11 ms while sampling and 394 ms during a BVH
build.

Size: `cycles_booth.wasm` 12,582,741 bytes, 4,262,537 gzip -9. `cycles_booth.mjs` 90,829
bytes, 23,843 gzip -9.

## Patches and provenance

Each patch below was derived from its underlying cause for this build and is described in our own
words. None of the artifact's code comes from a GPL source.

1. `patches/cycles-5.2.3-wasm.patch` (against Apache-2.0 Cycles, written here):
   - `src/util/stack_allocator.h`. **The one fix the build cannot run without.** Cycles builds BVH
     leaves in `std::vector`s with a `StackAllocator` that hands out storage inside the allocator
     object, and its copy constructor gives the copy fresh in-object storage too. The libc++ 23 in
     emsdk 7 grows a vector through a split buffer that holds the allocator *by value*. It
     allocates the new storage from that copy, moves the storage into the vector and destroys the
     split buffer, so the vector points into a dead object. The BVH comes out corrupt and the
     mesh disappears. The fix lets a copied allocator use only the heap, which is correct with any
     standard library. The proof's version disabled stack storage under `__EMSCRIPTEN__`, modelled
     on WACOMalt/blender PR #15 (a GPL repository). This one fixes the copy constructor instead,
     derived from reading libc++'s `__split_buffer`.
   - `src/CMakeLists.txt`: generic kernel only on Emscripten, because WebAssembly has none of the
     x86 kernel variants. WACOMalt PR #15 makes the same obvious change. This is written
     independently.
   - `src/cmake/configure_build.cmake`: no `-fPIC` for one static wasm module.
   - `src/cmake/macros.cmake`: no `-lutil`, which Emscripten's libc lacks.
   - `src/app/CMakeLists.txt`: the `cycles_booth` target, built from `api/` outside the tree.
   - The proof's opt-in SSE-to-wasm-SIMD changes are dropped. They were measured as no faster
     and are unused by the default build.
2. `patches/openimageio-3.1.16.0-libcxx-string-layout.patch` (against Apache-2.0 OpenImageIO,
   written here). **Still needed.** `ustring.cpp` writes libc++'s `std::string` fields directly
   to avoid storing characters twice. It picks the field layout by testing
   `_LIBCPP_ALTERNATE_STRING_LAYOUT`, a macro libc++ has since renamed to
   `_LIBCPP_ABI_ALTERNATE_STRING_LAYOUT`. Emscripten builds libc++ with ABI version 2, which
   selects the alternate layout (data pointer first, long flag in the top bit). OIIO therefore
   writes the capacity into the pointer field. Apple arm64 uses the same layout, which is why OIIO
   already skips the trick on `__aarch64__`. The patch skips it whenever the alternate layout is in
   use, falling back to an ordinary string copy. The proof's one-line condition tested
   `__EMSCRIPTEN__` and came from the WACOMalt build script (GPL). This one tests the cause.
   Tested both ways. Built without the patch, the module still passes `tests/cycles-wasm.test.ts`,
   because Cycles reads a ustring's characters and length from OIIO's table, not from that
   `std::string`. OIIO's exact writes replayed on emsdk 7's libc++ show the damage: a 16-character
   name's `std::string` reads back as size 0, pointing into itself. So `ustring::string()`
   returns "" for every name of 11 characters or more. The patch stays, because that is a
   correctness bug waiting for the first caller.
3. `patches/onetbb-2022.3.0-include-algorithm.patch` (against Apache-2.0 oneTBB, from the proof,
   own): `concurrent_queue.h` uses `std::equal` without including `<algorithm>`, which emsdk 7's
   libc++ no longer pulls in transitively.
4. `build_deps.sh` is newly written here. The proof's dependency recipe was first assembled while
   reading the WACOMalt build script (GPL). What the script encodes is facts: which libraries
   Cycles and OpenImageIO need, their release tags, and each project's documented CMake switches
   for turning features off. The script is a build recipe and none of it ends up in the module.

## Licences of what is linked

Cycles (Apache-2.0); OpenImageIO, oneTBB (Apache-2.0); OpenColorIO, OpenEXR, Imath, pystring
(BSD-3-Clause); OpenJPH (BSD-2-Clause); libtiff (libtiff licence, BSD-like); libpng (libpng
licence); libjpeg-turbo (IJG and BSD-3-Clause); zlib, minizip-ng (zlib); zstd (BSD); fmt,
robin-map, expat, yaml-cpp, pugixml, libdeflate (MIT); Emscripten's runtime, libc++ and mimalloc
(MIT and UIUC/Apache-2.0 with LLVM exception). All are compatible with distributing the module
under Apache-2.0 terms. Ship their notices with the app.
