#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache
export TMPDIR="$PWD/.cache"
.venv/bin/python -m pytest -q --basetemp=.cache/pytest
"${NODE_BIN:-node}" frontend/node_modules/typescript/bin/tsc -b frontend
"${NODE_BIN:-node}" frontend/node_modules/vite/bin/vite.js build frontend
