# syntax=docker/dockerfile:1

# Build: compile TypeScript and Prisma client.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# prisma/schema must exist before `pnpm install` — postinstall runs `prisma generate`.
RUN mkdir -p src
COPY prisma ./prisma

RUN corepack prepare pnpm@9 --activate \
  && (pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile)

COPY tsconfig.json ./
COPY src ./src

RUN pnpm exec prisma generate
# Prisma output lives under src/generated (JS); tsc does not copy it — runtime resolves ./generated from dist/prisma.js
RUN pnpm run build && cp -R src/generated dist/generated

# Run: production Node + compiled app (includes dev node_modules for simpler Prisma engine layout).
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

RUN chown -R node:node /app
USER node

EXPOSE 3000

# Set at runtime: DATABASE_URL, GEMINI_API_KEY, optional GEMINI_MODEL, PORT (default 3000 in app).
ENTRYPOINT ["./docker-entrypoint.sh"]
