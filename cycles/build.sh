#!/usr/bin/env bash
# The one rebuild command: toolchain and sources, dependency libraries, Cycles and the C API.
# Every step skips work that is already done, so a re-run after an API change only relinks.
set -euo pipefail
here="$(dirname "$0")"
"$here/setup_sources.sh"
"$here/build_deps.sh"
"$here/build_cycles.sh"
