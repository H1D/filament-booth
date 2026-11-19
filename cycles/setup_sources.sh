#!/usr/bin/env bash
# Fetch the toolchain and the patched Cycles sources into $CYCLES_WASM_ROOT. Safe to re-run:
# it only fetches what is missing and re-applies the patch when the patch file changed.
set -euo pipefail
source "$(dirname "$0")/common.sh"
cd "$ROOT"

if [ ! -d emsdk ]; then
  git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git
fi
(cd emsdk && ./emsdk install "$EMSDK_VERSION" >/dev/null && ./emsdk activate "$EMSDK_VERSION" >/dev/null)

if [ ! -x tools/bin/ninja ]; then
  mkdir -p tools/bin
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/ninja.zip" "https://github.com/ninja-build/ninja/releases/download/v$NINJA_VERSION/ninja-linux.zip"
  python3 -c "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$tmp/ninja.zip" tools/bin
  chmod +x tools/bin/ninja
  rm -rf "$tmp"
fi

if [ ! -d "$CYCLES_SRC/.git" ]; then
  mkdir -p "$(dirname "$CYCLES_SRC")"
  git clone -q --branch "$CYCLES_BRANCH" --single-branch "$CYCLES_URL" "$CYCLES_SRC"
fi

patch="$CYCLES_DIR/patches/cycles-5.2.3-wasm.patch"
stamp="$CYCLES_SRC/.booth-patch"
want="$CYCLES_COMMIT $(sha256sum "$patch" | cut -d' ' -f1)"
if [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
  git -C "$CYCLES_SRC" checkout -q --force "$CYCLES_COMMIT"
  git -C "$CYCLES_SRC" clean -qfd
  git -C "$CYCLES_SRC" apply "$patch"
  echo "$want" > "$stamp"
  echo "patched Cycles at $CYCLES_COMMIT"
fi
echo "sources ready in $ROOT"
