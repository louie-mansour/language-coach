#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

exec docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build "$@"
