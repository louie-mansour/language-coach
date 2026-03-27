import nock from 'nock';
import fetch from 'node-fetch';
import { afterEach } from 'vitest';

/**
 * Gemini client uses `fetch`. Node's native `fetch` is undici-based and does not go through
 * `http`/`https` the way nock patches—so tests use `node-fetch`, which nock can intercept.
 */
globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

// Fail fast if HTTP leaves the process without a matching nock (avoids accidental real Gemini calls).
nock.disableNetConnect();
nock.enableNetConnect((host) => host.includes('127.0.0.1') || host.includes('localhost'));

afterEach(() => {
  nock.cleanAll();
});
