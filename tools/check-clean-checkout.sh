#!/usr/bin/env bash
# Builds and tests a fresh checkout of HEAD, so a file that only exists in
# someone's working tree (an ignored build output, an untracked asset) fails here.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
dir=$(mktemp -d -p "${BOOTH_TMP:-$HOME/.t3/scratch}" booth-clean-XXXXXX)
trap 'git -C "$repo" worktree remove --force "$dir" >/dev/null 2>&1 || true' EXIT
git -C "$repo" worktree add --detach "$dir" HEAD >/dev/null 2>&1
cd "$dir"
bun install --silent
bun run test 2>&1 | grep -E "FAIL|Test Files|Tests "
# Unused-symbol errors come from bodies that still throw "not implemented".
types=$(bun run typecheck 2>&1 | grep "error TS" | grep -vE "TS6133|TS6138|TS6196" || true)
if [ -n "$types" ]; then echo "$types"; exit 1; fi
echo "clean checkout ok"
