#!/usr/bin/env sh
# Start docker-compose Postgres if needed and ensure an isolated test database exists.
# Does not modify the default "languagecoach" dev database — only creates languagecoach_test (or TEST_DB_NAME).

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose}"
COMPOSE="$DOCKER_COMPOSE -f docker-compose.yml"
TEST_DB_NAME="${TEST_DB_NAME:-languagecoach_test}"

if $COMPOSE up -d --wait postgres 2>/dev/null; then
  :
else
  $COMPOSE up -d postgres
  i=0
  while [ "$i" -lt 45 ]; do
    if $COMPOSE exec -T postgres pg_isready -U languagecoach -d languagecoach >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
fi

EXISTS="$($COMPOSE exec -T postgres psql -U languagecoach -d languagecoach -tAc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" | tr -d '[:space:]')"
if [ "$EXISTS" != "1" ]; then
  $COMPOSE exec -T postgres psql -U languagecoach -d languagecoach -c "CREATE DATABASE ${TEST_DB_NAME};"
fi
