import { execSync } from 'node:child_process';

import { config } from 'dotenv';

/**
 * Runs once before tests. Requires Postgres reachable via DATABASE_URL
 * (from `.env` / `.env.test` loaded in vitest.config.ts).
 */
export default function globalSetup(): void {
  config({ path: '.env' });
  config({ path: '.env.test', override: true });

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      'DATABASE_URL must be set for integration tests. Start Postgres and set DATABASE_URL in .env or .env.test (see .env.test.example).',
    );
  }

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    throw new Error(
      'prisma migrate deploy failed. Is Postgres running and DATABASE_URL correct in .env / .env.test?',
      { cause: err },
    );
  }
}
