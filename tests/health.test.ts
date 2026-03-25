import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

describe('Health', () => {
  it('GET /health returns ok: true', async () => {
    const app = createApp();

    await request(app)
      .get('/health')
      .expect(200)
      .expect({ ok: true });
  });
});

