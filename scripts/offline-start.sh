#!/bin/sh
# Run only on the target NAS after verifying SHA256SUMS and preparing permissions.
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'Install/start QNAP Container Station first.' >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo 'This bundle requires x86-64 NAS.' >&2; exit 1; }
[ -f image/idrac-list-amd64.tar ] || { echo 'Missing image archive. This is NOT an offline-ready bundle.' >&2; exit 1; }
[ -f .env ] || { echo 'Missing release .env; see deployment/NAS_DEPLOYMENT.md.' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo 'Docker Compose v2 required. See QNAP guide / docker run fallback.' >&2; exit 1; }
# Never delete/reinitialize existing Data/Logs or recursively change permissions here.
mkdir -p Data Logs
docker load -i image/idrac-list-amd64.tar
docker compose --env-file .env -f compose.offline.yaml config >/dev/null
docker compose --env-file .env -f compose.offline.yaml up -d --no-build --pull never
docker compose --env-file .env -f compose.offline.yaml ps
