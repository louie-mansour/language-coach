# backend

Express + TypeScript API with Postgres (Prisma), with Vitest + Supertest and ESLint/Prettier.

## Prereqs

- Node.js 20+
- Postgres running locally (for Prisma)

## Setup

```bash
cp .env.example .env
```

Install dependencies (pnpm via npx):

```bash
npx -y pnpm@9.12.3 install
```

Generate Prisma client:

```bash
npx -y pnpm@9.12.3 prisma:generate
```

Run migrations (optional for this scaffold):

```bash
npx -y pnpm@9.12.3 prisma:migrate
```

## Run dev server

```bash
npx -y pnpm@9.12.3 dev
```

## Test

```bash
npx -y pnpm@9.12.3 test
```

