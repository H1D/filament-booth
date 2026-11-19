#!/usr/bin/env bash
# Configure and build standalone Cycles plus the booth C API (cycles/api/) for wasm32, then
# copy the module into public/cycles/. Needs cycles/setup_sources.sh and cycles/build_deps.sh.
set -euo pipefail
source "$(dirname "$0")/common.sh"
use_toolchain
mkdir -p "$CYCLES_BUILD"

sources="$(ls "$CYCLES_DIR"/api/*.cpp | paste -sd';')"

# The pool is sized by the page (Module.boothPoolSize) because Cycles starts one TBB worker per
# hardware thread plus its session thread, and a browser cannot start a worker while a thread
# that waits for it blocks the event loop.
LINK_FLAGS="-O3 $WEB_FLAGS \
-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=256MB -sMAXIMUM_MEMORY=4GB -sMALLOC=mimalloc \
-sSTACK_SIZE=4MB -sDEFAULT_PTHREAD_STACK_SIZE=2MB \
-sPTHREAD_POOL_SIZE=Module.boothPoolSize -sPTHREAD_POOL_SIZE_STRICT=0 \
-sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=CyclesBooth -sENVIRONMENT=web,worker,node \
-sEXPORTED_FUNCTIONS=_malloc,_free \
-sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAPU8,HEAPU32,UTF8ToString,stringToUTF8,lengthBytesUTF8,wasmMemory"

echo "== configure (log $LOGS/cycles-configure.log)"
emcmake cmake -S "$CYCLES_SRC" -B "$CYCLES_BUILD" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
  -DCMAKE_C_FLAGS="$WEB_FLAGS" -DCMAKE_CXX_FLAGS="$WEB_FLAGS" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm32 \
  -DWITH_LIBS_PRECOMPILED=OFF \
  -DWITH_CYCLES_ALEMBIC=OFF -DWITH_CYCLES_EMBREE=OFF -DWITH_CYCLES_OPENIMAGEDENOISE=OFF \
  -DWITH_CYCLES_OPENSUBDIV=OFF -DWITH_CYCLES_OPENVDB=OFF -DWITH_CYCLES_NANOVDB=OFF \
  -DWITH_CYCLES_OSL=OFF -DWITH_CYCLES_USD=OFF -DWITH_CYCLES_HYDRA_RENDER_DELEGATE=OFF \
  -DWITH_CYCLES_PUGIXML=OFF -DWITH_CYCLES_LOGGING=OFF -DWITH_CYCLES_STANDALONE_GUI=OFF \
  -DWITH_CYCLES_DEVICE_CUDA=OFF -DWITH_CYCLES_DEVICE_OPTIX=OFF -DWITH_CYCLES_DEVICE_HIP=OFF \
  -DWITH_CYCLES_DEVICE_HIPRT=OFF -DWITH_CYCLES_DEVICE_METAL=OFF -DWITH_CYCLES_DEVICE_ONEAPI=OFF \
  -DWITH_CYCLES_PATH_GUIDING=OFF -DWITH_GTESTS=OFF \
  -DCYCLES_BOOTH_SOURCES="$sources" -DCYCLES_BOOTH_LINK_FLAGS="$LINK_FLAGS" \
  > "$LOGS/cycles-configure.log" 2>&1 || { tail -40 "$LOGS/cycles-configure.log"; exit 1; }

echo "== build (log $LOGS/cycles-build.log)"
t0=$(date +%s)
if ! cmake --build "$CYCLES_BUILD" --target cycles_booth -j "$JOBS" > "$LOGS/cycles-build.log" 2>&1; then
  grep -n "error:" "$LOGS/cycles-build.log" | head -30
  tail -30 "$LOGS/cycles-build.log"
  exit 1
fi
echo "   built in $(( $(date +%s) - t0 )) s"

out="$REPO/public/cycles"
mkdir -p "$out"
cp "$CYCLES_BUILD/bin/cycles_booth.mjs" "$CYCLES_BUILD/bin/cycles_booth.wasm" "$out/"
for f in "$out"/cycles_booth.mjs "$out"/cycles_booth.wasm; do
  printf '%s  %d bytes raw, %d gzip -9\n' "$(basename "$f")" "$(stat -c%s "$f")" "$(gzip -9c "$f" | wc -c)"
done
