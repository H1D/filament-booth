# Cycles wasm

The build of Blender's standalone Cycles 5.2 CPU kernel to wasm32, with a thin C API the app calls from a worker. The built module is committed, so the app builds without the toolchain.

```toon
status: stable
depends_on[0]:
entry_point: cycles/build.sh
output[2]: public/cycles/cycles_booth.mjs,public/cycles/cycles_booth.wasm

files[9]{path,purpose}:
  cycles/README.md,provenance and patches and build switches and timing tables
  cycles/build.sh,top-level build
  cycles/setup_sources.sh,fetches emsdk and pinned sources
  cycles/build_deps.sh,builds the dependency libraries
  cycles/build_cycles.sh,builds Cycles and links the module
  cycles/common.sh,shared paths and version pins
  cycles/api/booth.h,the C API the app sees
  cycles/api/scene.cpp,scene construction from uploaded buffers
  cycles/api/session.cpp,render session and progress and passes and cancel
```

## Design Notes

- Emscripten with pthreads, wasm exceptions, `-msimd128`, mimalloc and a 4 GB maximum heap.
- The module is about 12.6 MB raw and 4.3 MB gzipped.
- The JS side of the API is `src/photo/cycles-upload.ts`. Change both together.
- Sources and emsdk are fetched on first build, about 3 GB outside the checkout.

## Gotchas

- Rebuild only after a change to `cycles/api/`, a patch or a version pin. Then rerun `bun tools/parity/run.ts`.
- Pointers cross to JS as signed 32-bit. Read them unsigned.
- Sampling time is set by the scene (frame coverage of the dense part, bead shader, HDR world). Bounce limits and the pixel filter cost nothing measurable. Adaptive sampling was only measured at 64 samples, below its automatic minimum of 84. See the table in `cycles/README.md`.
- The part has two bead shaders: triangles with a vertex on the bed get the plate's bump, the rest a copy without it (`wallTriangles`, `cb_mesh_shader_index`). That saves about a tenth of sampling, and parity against native Blender is unchanged.
- Passes cross to JavaScript bottom row first. Progress snapshots hold the colour only; the albedo and normal guides arrive with the final frame, for the denoiser.
- Licences of Cycles and its libraries are listed in `cycles/README.md`. Ship their notices with the app.
