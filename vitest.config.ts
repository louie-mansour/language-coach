import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Preserve DATABASE_URL from the shell (e.g. `make test` pointing at languagecoach_test) so .env / .env.test
// cannot accidentally override the isolated test DB URL.
const databaseUrlFromShell = process.env.DATABASE_URL;

config({ path: '.env' });
config({ path: '.env.test', override: true });

if (databaseUrlFromShell) {
  process.env.DATABASE_URL = databaseUrlFromShell;
}

process.env.API_KEY ??= 'test-api-key-integration';
process.env.GEMINI_API_KEY ??= 'test-gemini-key';
process.env.GEMINI_MODEL ??= 'gemini-2.5-flash-lite';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    maxConcurrency: 1,
    testTimeout: 60_000,
  },
});
