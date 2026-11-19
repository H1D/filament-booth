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
| `tools/parity/` | Fixtures, the sceneToJson writer, the browser and Blender parity run |

Settings the Scene does not name are what Blender 5.2.3's sync writes for a factory scene rendered
with `blender -b`. Examples: blue-noise sampling, seed 0, light tree, glossy filter 1, approximate
shadow catcher, world MIS with an automatic map, lights invisible to the camera, lights and world
counted as shadow catchers. Both sides therefore sample the same paths, and parity differences come
from arithmetic, not from settings.

## Engine behaviour

- One worker per render, terminated when it settles. A wasm heap never shrinks, so a long-lived
  worker would keep the high-water mark of the largest part rendered (2.5 GiB at 10 million
  triangles) for the life of the tab. A fresh worker returns it and recovers from a trap. The C
  API supports several sessions in one module anyway: `tests/cycles-wasm.test.ts` renders three
  in a row, and the heap stops growing after the second.
- Abort with reason `"finish"` asks Cycles to stop after the batch of samples in flight. Cycles
  sizes a batch to about 1 s of work below 32 samples and 2 s above, so finish takes up to that
  long. It returns a frame in which every pixel has the same sample count.
- Any other abort rejects at once and posts `cancel` to the worker. The worker calls `cb_cancel`,
  frees the session and confirms, and only then is it terminated. Terminating it straight away
  is not enough. Cycles' threads are nested workers busy in wasm, and Chromium stops those by
  force only two seconds after their parent goes: 16 cores stayed busy for 2.2 to 2.5 s.
- Passes arrive about every 1 to 2 s as RGBA float, plus the denoising albedo and normal guides.
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

What limits these numbers: 16 hardware threads (8 cores with SMT, the machine otherwise idle
before and after each run by `top`), one run per configuration except where two are listed,
headless Chromium on localhost, native Blender 5.2.3 with its AVX2 kernel.

Parity, `bun tools/parity/run.ts`, 640 x 400, 256 samples, adaptive threshold 0.004, Standard
view transform, 8 bit. Fixture (d) is compared over 50 % grey because its film is transparent.

| Fixture | Checks | PSNR dB, native BVH2 | PSNR dB, native Embree | Mean abs diff /255 | Over 4/255 | Alpha mean abs diff /255 |
|---|---|---|---|---|---|---|
| a | bead material, per-vertex roughness, HDR world turned 30 degrees | 62.55 | 62.64 | 0.032 | 0.00 % | 0 |
| b | ellipse key with spread 60, part-only rim with spread 40, part-only scrim | 57.86 | 57.92 | 0.050 | 0.22 % | 0 |
| c | floor cards with a dark glossy part | 69.43 | 69.64 | 0.007 | 0.00 % | 0 |
| d | f/2.8 at 12 cm, transparent film, shadow catcher | 61.27 | 61.30 | 0.054 | 0.00 % | 0.014 |

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
