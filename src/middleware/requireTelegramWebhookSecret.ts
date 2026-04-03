import type { RequestHandler } from 'express';

const HEADER = 'x-telegram-bot-api-secret-token';

/**
 * When TELEGRAM_WEBHOOK_SECRET is set (recommended in production), Telegram sends it in
 * X-Telegram-Bot-Api-Secret-Token from setWebhook(secret_token=...).
 * If unset, verification is skipped (local dev only).
 */
export const requireTelegramWebhookSecret: RequestHandler = (req, res, next) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  if (!expected) {
    next();
    return;
  }

  const provided = req.header(HEADER)?.trim() ?? '';
  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
