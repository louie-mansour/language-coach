#!/usr/bin/env node
/**
 * POST /message with the SMS body as normal CLI args (avoids Make variable quirks).
 *
 *   npm run curl-message -- I would like to learn French please
 *   PORT=3001 npm run curl-message -- hello
 */

const port = process.env.PORT || '3000';
const phone = process.env.PHONE || '+15551234567';
const message = process.argv.slice(2).join(' ').trim();

if (!message) {
  console.error('Usage: npm run curl-message -- <message text>');
  console.error('Example: npm run curl-message -- I would like to learn French please');
  process.exit(2);
}

const url = `http://localhost:${port}/message`;
const body = JSON.stringify({ phoneNumber: phone, message });

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${text}`);
  process.exit(1);
}

console.log(text);
