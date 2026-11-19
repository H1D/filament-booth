#!/usr/bin/env bash
# Build the static wasm32 libraries that standalone Cycles links against, into $PREFIX.
#
# Usage: cycles/build_deps.sh [package ...]
#   No arguments: every package that has no build stamp yet. Named packages are always rebuilt.
# Each package's build tree is deleted after install, so only sources and the install remain.
set -euo pipefail
source "$(dirname "$0")/common.sh"
use_toolchain
mkdir -p "$DEPS_SRC" "$DEPS_BUILD" "$PREFIX" "$LOGS/deps"

# fetch <name> git <url> <ref> | fetch <name> tar <url>
fetch() {
  local dir="$DEPS_SRC/$1"
  [ -d "$dir" ] && return 0
  if [ "$2" = git ]; then
    git -c advice.detachedHead=false clone -q --depth 1 --branch "$4" "$3" "$dir"
  else
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL --retry 4 -o "$tmp/src.tar" "$3"
    mkdir -p "$dir" && tar -xf "$tmp/src.tar" -C "$dir" --strip-components=1
    rm -rf "$tmp"
  fi
}

# apply_patch <name> <patch file>: applies once, recognises an already patched tree.
apply_patch() {
  local dir="$DEPS_SRC/$1" patch="$CYCLES_DIR/patches/$2"
  if git -C "$dir" apply --reverse --check "$patch" 2>/dev/null; then return 0; fi
  git -C "$dir" apply "$patch"
}

# cmake_install <name> <source dir> [cmake options...]
cmake_install() {
  local name="$1" src="$2"; shift 2
  emcmake cmake -S "$src" -B "$DEPS_BUILD/$name" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_PREFIX_PATH="$PREFIX" -DCMAKE_FIND_ROOT_PATH="$PREFIX" \
    -DCMAKE_C_FLAGS="$WEB_FLAGS" -DCMAKE_CXX_FLAGS="$WEB_FLAGS" -DCMAKE_EXE_LINKER_FLAGS="$WEB_FLAGS" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DEMSCRIPTEN_SYSTEM_PROCESSOR=wasm32 "$@"
  cmake --build "$DEPS_BUILD/$name" -j "$JOBS"
  cmake --install "$DEPS_BUILD/$name"
  rm -rf "${DEPS_BUILD:?}/$name"
}

pkg_zlib() {
  fetch zlib tar https://github.com/madler/zlib/releases/download/v1.3.1/zlib-1.3.1.tar.gz
  cmake_install zlib "$DEPS_SRC/zlib" -DZLIB_BUILD_EXAMPLES=OFF
  rm -f "$PREFIX"/lib/libz.so*
}
pkg_zstd() {
  fetch zstd tar https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz
  cmake_install zstd "$DEPS_SRC/zstd/build/cmake" -DZSTD_BUILD_PROGRAMS=OFF -DZSTD_BUILD_SHARED=OFF \
    -DZSTD_BUILD_STATIC=ON -DZSTD_BUILD_TESTS=OFF
}
pkg_png() {
  fetch png tar http://prdownloads.sourceforge.net/libpng/libpng-1.6.58.tar.xz
  cmake_install png "$DEPS_SRC/png" -DPNG_SHARED=OFF -DPNG_STATIC=ON -DPNG_TESTS=OFF -DPNG_TOOLS=OFF \
    -DPNG_FRAMEWORK=OFF -DPNG_HARDWARE_OPTIMIZATIONS=OFF
}
pkg_jpeg() {
  fetch jpeg git https://github.com/libjpeg-turbo/libjpeg-turbo 2.1.3
  cmake_install jpeg "$DEPS_SRC/jpeg" -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_SIMD=OFF \
    -DWITH_JPEG8=ON -DWITH_TURBOJPEG=OFF
}
pkg_fmt() {
  fetch fmt git https://github.com/fmtlib/fmt 12.1.0
  cmake_install fmt "$DEPS_SRC/fmt" -DFMT_DOC=OFF -DFMT_TEST=OFF
}
pkg_imath() {
  fetch imath git https://github.com/AcademySoftwareFoundation/Imath v3.2.2
  cmake_install imath "$DEPS_SRC/imath" -DPYTHON=OFF -DIMATH_INSTALL_PKG_CONFIG=ON
}
pkg_deflate() {
  fetch deflate git https://github.com/ebiggers/libdeflate v1.18
  cmake_install deflate "$DEPS_SRC/deflate" -DLIBDEFLATE_BUILD_SHARED_LIB=OFF \
    -DLIBDEFLATE_BUILD_STATIC_LIB=ON -DLIBDEFLATE_BUILD_GZIP=OFF
}
pkg_openjph() {
  fetch openjph git https://github.com/aous72/OpenJPH 0.25.2
  cmake_install openjph "$DEPS_SRC/openjph" -DOJPH_BUILD_EXECUTABLES=OFF -DOJPH_ENABLE_TIFF_SUPPORT=OFF \
    -DOJPH_BUILD_TESTS=OFF -DOJPH_DISABLE_SIMD=ON
}
pkg_openexr() {
  fetch openexr git https://github.com/AcademySoftwareFoundation/openexr v3.4.10
  cmake_install openexr "$DEPS_SRC/openexr" -DOPENEXR_BUILD_TOOLS=OFF -DOPENEXR_INSTALL_TOOLS=OFF \
    -DOPENEXR_BUILD_EXAMPLES=OFF -DOPENEXR_BUILD_PYTHON=OFF -DOPENEXR_BUILD_DOCS=OFF \
    -DOPENEXR_FORCE_INTERNAL_DEFLATE=OFF -DOPENEXR_FORCE_INTERNAL_IMATH=OFF \
    -DOPENEXR_FORCE_INTERNAL_OPENJPH=OFF -DOPENEXR_ENABLE_THREADING=ON \
    -DOPENEXR_TEST_LIBRARIES=OFF -DOPENEXR_TEST_TOOLS=OFF -DOPENEXR_TEST_PYTHON=OFF
}
pkg_tbb() {
  fetch tbb git https://github.com/uxlfoundation/oneTBB v2022.3.0
  apply_patch tbb onetbb-2022.3.0-include-algorithm.patch
  cmake_install tbb "$DEPS_SRC/tbb" -DTBB_TEST=OFF -DTBB_EXAMPLES=OFF -DTBB_STRICT=OFF \
    -DTBBMALLOC_BUILD=OFF -DTBBMALLOC_PROXY_BUILD=OFF -DTBB_DISABLE_HWLOC_AUTOMATIC_SEARCH=ON
}
pkg_tiff() {
  fetch tiff tar https://gitlab.com/libtiff/libtiff/-/archive/v4.7.1/libtiff-v4.7.1.tar.gz
  cmake_install tiff "$DEPS_SRC/tiff" -Dlzma=OFF -Djbig=OFF -Dzstd=OFF -Dwebp=OFF -Dlerc=OFF \
    -Dlibdeflate=OFF -Dcxx=OFF -Dtiff-tests=OFF -Dtiff-tools=OFF -Dtiff-docs=OFF -Dtiff-contrib=OFF \
    -Dsphinx=OFF
}
pkg_robinmap() {
  fetch robinmap git https://github.com/Tessil/robin-map v1.3.0
  cmake_install robinmap "$DEPS_SRC/robinmap"
}
pkg_expat() {
  fetch expat git https://github.com/libexpat/libexpat R_2_7_5
  cmake_install expat "$DEPS_SRC/expat/expat" -DEXPAT_BUILD_TOOLS=OFF -DEXPAT_BUILD_EXAMPLES=OFF \
    -DEXPAT_BUILD_TESTS=OFF -DEXPAT_BUILD_DOCS=OFF -DEXPAT_SHARED_LIBS=OFF -DEXPAT_BUILD_PKGCONFIG=ON
}
pkg_yamlcpp() {
  fetch yamlcpp git https://github.com/jbeder/yaml-cpp 0.8.0
  cmake_install yamlcpp "$DEPS_SRC/yamlcpp" -DYAML_CPP_BUILD_TESTS=OFF -DYAML_CPP_BUILD_TOOLS=OFF \
    -DYAML_CPP_BUILD_CONTRIB=OFF -DYAML_BUILD_SHARED_LIBS=OFF
}
pkg_pystring() {
  fetch pystring git https://github.com/imageworks/pystring v1.1.3
  # pystring ships no CMake install rules for a static library; OpenColorIO only needs one.
  cat > "$DEPS_SRC/pystring/CMakeLists.txt" <<'EOF'
cmake_minimum_required(VERSION 3.10)
project(pystring CXX)
add_library(pystring STATIC pystring.cpp)
install(TARGETS pystring ARCHIVE DESTINATION lib)
install(FILES pystring.h DESTINATION include/pystring)
EOF
  cmake_install pystring "$DEPS_SRC/pystring"
}
pkg_minizipng() {
  fetch minizipng git https://github.com/zlib-ng/minizip-ng 4.2.2
  cmake_install minizipng "$DEPS_SRC/minizipng" -DMZ_FETCH_LIBS=OFF -DMZ_LIBCOMP=OFF -DMZ_PKCRYPT=OFF \
    -DMZ_WZAES=OFF -DMZ_OPENSSL=OFF -DMZ_SIGNING=OFF -DMZ_PPMD=OFF -DMZ_LZMA=OFF -DMZ_ZSTD=OFF \
    -DMZ_BZIP2=OFF -DMZ_ICONV=OFF -DMZ_ZLIB=ON -DMZ_ZLIB_FLAVOR=zlib -DMZ_COMPAT=OFF \
    -DCMAKE_INSTALL_INCLUDEDIR="$PREFIX/include/minizip-ng"
}
pkg_opencolorio() {
  fetch opencolorio git https://github.com/AcademySoftwareFoundation/OpenColorIO v2.5.0
  cmake_install opencolorio "$DEPS_SRC/opencolorio" -DOCIO_BUILD_APPS=OFF -DOCIO_BUILD_PYTHON=OFF \
    -DOCIO_BUILD_NUKE=OFF -DOCIO_BUILD_JAVA=OFF -DOCIO_BUILD_DOCS=OFF -DOCIO_BUILD_TESTS=OFF \
    -DOCIO_BUILD_GPU_TESTS=OFF -DOCIO_BUILD_OPENFX=OFF -DOCIO_USE_SIMD=OFF -DOCIO_USE_SSE2NEON=OFF \
    -DOCIO_INSTALL_EXT_PACKAGES=NONE -Dminizip-ng_INCLUDE_DIR="$PREFIX/include/minizip-ng/minizip" \
    -Dminizip-ng_LIBRARY="$PREFIX/lib/libminizip.a"
}
pkg_pugixml() {
  fetch pugixml git https://github.com/zeux/pugixml v1.15
  cmake_install pugixml "$DEPS_SRC/pugixml" -DPUGIXML_BUILD_TESTS=OFF
}
pkg_openimageio() {
  fetch openimageio git https://github.com/AcademySoftwareFoundation/OpenImageIO v3.1.16.0
  if [ "${OIIO_UNPATCHED:-0}" = 1 ]; then
    git -C "$DEPS_SRC/openimageio" checkout -q -- src/libutil/ustring.cpp
  else
    apply_patch openimageio openimageio-3.1.16.0-libcxx-string-layout.patch
  fi
  cmake_install openimageio "$DEPS_SRC/openimageio" -DZLIB_LIBRARY="$PREFIX/lib/libz.a" \
    -DOIIO_BUILD_TOOLS=OFF -DOIIO_BUILD_TESTS=OFF -DOIIO_BUILD_DOCS=OFF -DINSTALL_DOCS=OFF \
    -DOpenImageIO_BUILD_MISSING_DEPS="" -DSTOP_ON_WARNING=OFF -DUSE_SIMD=0 -DEMBEDPLUGINS=ON \
    -DUSE_PYTHON=OFF -DUSE_QT=OFF -DUSE_NUKE=OFF -DUSE_OPENVDB=OFF -DUSE_FREETYPE=OFF -DUSE_DCMTK=OFF \
    -DUSE_TBB=OFF -DUSE_GIF=OFF -DUSE_OPENCV=OFF -DUSE_OPENJPEG=OFF -DUSE_FFMPEG=OFF -DUSE_PTEX=OFF \
    -DUSE_LIBHEIF=OFF -DUSE_LIBRAW=OFF -DUSE_JXL=OFF -DUSE_WEBP=OFF -DUSE_OPENCOLORIO=ON \
    -DUSE_LIBUHDR=OFF -DUSE_R3DSDK=OFF -DUSE_EXTERNAL_PUGIXML=OFF -DUSE_BZIP2=OFF \
    -DOpenImageIO_REQUIRED_DEPS="libjpeg-turbo;TIFF;OpenEXR;PNG;fmt;Robinmap;ZLIB"
}

# Dependency order: a package's own dependencies come before it.
PACKAGES=(zlib zstd png jpeg fmt imath deflate openjph openexr tbb tiff robinmap expat yamlcpp
  pystring minizipng opencolorio pugixml openimageio)

wanted=("$@")
[ ${#wanted[@]} -eq 0 ] && wanted=("${PACKAGES[@]}")
for pkg in "${wanted[@]}"; do
  stamp="$PREFIX/.built-$pkg"
  if [ $# -eq 0 ] && [ -f "$stamp" ]; then continue; fi
  echo "== $pkg (log $LOGS/deps/$pkg.log)"
  t0=$(date +%s)
  if ! "pkg_$pkg" > "$LOGS/deps/$pkg.log" 2>&1; then
    echo "!! $pkg failed:"; tail -25 "$LOGS/deps/$pkg.log"; exit 1
  fi
  touch "$stamp"
  echo "   $pkg built in $(( $(date +%s) - t0 )) s"
done
echo "dependencies installed in $PREFIX"
