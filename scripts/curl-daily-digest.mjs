#!/usr/bin/env node
/**
 * POST /internal/daily-digest (email digest cron). Uses CRON_SECRET from env or .env.
 * Digest window is always the last 24 hours (no body).
 *
 *   npm run curl-digest
 *   PORT=3001 npm run curl-digest
 */

import fs from 'node:fs';

const port = process.env.PORT || '3000';
const domain = process.env.DOMAIN || 'localhost';

const cronSecret =
  process.env.CRON_SECRET?.trim() ||
  (() => {
    try {
      const s = fs.readFileSync('.env', 'utf8');
      const m = s.match(/^CRON_SECRET=(.*)$/m);
      const v = m?.[1]?.trim() ?? '';
      return v.replace(/^["']|["']$/g, '');
    } catch {
      return '';
    }
  })();

if (!cronSecret) {
  console.error('Set CRON_SECRET in env or .env (same as Railway cron).');
  process.exit(2);
}

const res = await fetch(`http://${domain}:${port}/internal/daily-digest`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-cron-secret': cronSecret,
  },
  body: '{}',
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${text}`);
  process.exit(1);
}

console.log(text);
