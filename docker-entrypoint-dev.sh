#!/bin/sh
set -eu
cd /app

echo "Applying Prisma migrations (schema: ./prisma/schema.prisma)..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

if [ "${ENABLE_NODE_DEBUG:-}" = "1" ]; then
  # tsx + the inspector often leaves breakpoints "unbound" (source maps vs disk verification).
  # Run compiled JS + inline source maps so Cursor/VS Code can map dist/*.js → src/*.ts reliably.
  echo "Debug mode: tsc watch + node --inspect dist/server.js (set breakpoints in src/). Restart the api container to load code changes."
  npx prisma generate --schema=./prisma/schema.prisma
  npx tsc -p tsconfig.json
  if [ -d src/generated ]; then
    rm -rf dist/generated
    cp -R src/generated dist/generated
  fi
  npx tsc -p tsconfig.json --watch --preserveWatchOutput &
  TSC_PID=$!
  trap 'kill "$TSC_PID" 2>/dev/null' EXIT INT TERM
  exec node --inspect=0.0.0.0:9229 dist/server.js
fi

echo "Starting API (tsx watch — edit src/ on the host to hot reload)..."
exec npx tsx watch src/server.ts
