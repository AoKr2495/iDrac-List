#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f frontend/dist/index.html ]; then
  echo 'Build frontend first. See README.md.' >&2
  exit 1
fi
exec .venv/bin/python -m backend "$@"
