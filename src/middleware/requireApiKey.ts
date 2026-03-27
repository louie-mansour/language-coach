import type { RequestHandler } from 'express';

const API_KEY_HEADER = 'x-api-key';

function extractProvidedApiKey(authHeader: string | undefined, xApiKey: string | undefined): string {
  if (xApiKey && xApiKey.trim().length > 0) {
    return xApiKey.trim();
  }

  if (!authHeader) {
    return '';
  }

  const trimmed = authHeader.trim();
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }

  return trimmed;
}

/**
 * Global API key guard.
 *
 * Reads the expected key from API_KEY and accepts either:
 * - x-api-key: <key>
 * - Authorization: Bearer <key>
 */
export const requireApiKey: RequestHandler = (req, res, next) => {
  const expectedApiKey = process.env.API_KEY?.trim() ?? '';
  const providedApiKey = extractProvidedApiKey(
    req.header('authorization'),
    req.header(API_KEY_HEADER),
  );

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
