# Paths and pinned versions for the Cycles WebAssembly build. Sourced by the build scripts.
#
# Everything heavy (toolchain, sources, dependency libraries, build trees, about 3 GB) lives
# under CYCLES_WASM_ROOT, outside the checkout. Only the linked artifact is copied back into
# public/cycles/.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CYCLES_DIR="$REPO/cycles"
export CYCLES_WASM_ROOT="${CYCLES_WASM_ROOT:-$HOME/.t3/scratch/booth-spikes/cycles-wasm}"
ROOT="$CYCLES_WASM_ROOT"

EMSDK_VERSION=7.0.0
NINJA_VERSION=1.13.1
CYCLES_URL=https://projects.blender.org/blender/cycles.git
CYCLES_BRANCH=release/5.2
CYCLES_COMMIT=c2dc903f88163ffc2aca8d7c7ff386f69d1118c2 # "Release: Bump to 5.2.3 release"

CYCLES_SRC="$ROOT/src/cycles-booth"
DEPS_SRC="$ROOT/deps/src"
DEPS_BUILD="$ROOT/deps/build"
PREFIX="$ROOT/deps/install"
CYCLES_BUILD="$ROOT/build/booth"
LOGS="$ROOT/logs/booth"
JOBS="${JOBS:-$(nproc)}"

# Every object in the link must agree on threads, exception handling and SIMD, or wasm-ld
# rejects the mix (shared memory needs atomics and bulk memory in every object).
WEB_FLAGS="-pthread -fwasm-exceptions -msimd128"

mkdir -p "$ROOT" "$LOGS"

use_toolchain() {
  [ -f "$ROOT/emsdk/emsdk_env.sh" ] || { echo "no emsdk in $ROOT; run cycles/setup_sources.sh" >&2; exit 1; }
  export EMSDK_QUIET=1
  # shellcheck disable=SC1091
  source "$ROOT/emsdk/emsdk_env.sh" >/dev/null 2>&1
  export PATH="$ROOT/tools/bin:$PATH"
}
