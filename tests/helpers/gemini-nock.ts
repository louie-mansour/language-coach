import nock from 'nock';

import type { ConversationTurnPayload } from '../../src/client/gemeniClient';

const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

/**
 * Intercepts POST .../v1beta/models/:model:generateContent (any query string, incl. ?key=).
 */
export function mockGeminiGenerateContent(payload: ConversationTurnPayload) {
  const text = JSON.stringify(payload);
  return nock(GEMINI_HOST)
    .post(/\/v1beta\/models\/[^:]+:generateContent/)
    .query(true)
    .reply(200, {
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    });
}
