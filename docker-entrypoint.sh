#!/bin/sh
set -eu
cd /app

echo "Applying Prisma migrations (schema: ./prisma/schema.prisma)..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting API..."
if [ "${ENABLE_NODE_DEBUG:-}" = "1" ]; then
  # Listen on all interfaces so the host can attach to the container (port mapped in compose).
  exec node --inspect=0.0.0.0:9229 dist/server.js
else
  exec node dist/server.js
fi
