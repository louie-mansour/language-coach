#!/bin/sh
set -eu
cd /app

echo "Applying Prisma migrations (schema: ./prisma/schema.prisma)..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting API (tsx watch — edit src/ on the host to hot reload)..."
if [ "${ENABLE_NODE_DEBUG:-}" = "1" ]; then
  export NODE_OPTIONS="--inspect=0.0.0.0:9229"
fi
exec npx tsx watch src/server.ts
