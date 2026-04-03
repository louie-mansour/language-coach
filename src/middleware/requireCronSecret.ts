import type { RequestHandler } from 'express';

/**
 * For scheduled jobs (e.g. Railway cron). Set CRON_SECRET and send:
 * Authorization: Bearer <CRON_SECRET>  or  x-cron-secret: <CRON_SECRET>
 */
export const requireCronSecret: RequestHandler = (req, res, next) => {
  const expected = process.env.CRON_SECRET?.trim() ?? '';
  const auth = req.header('authorization')?.trim() ?? '';
  const header = req.header('x-cron-secret')?.trim() ?? '';

  let provided = header;
  if (!provided && auth.toLowerCase().startsWith('bearer ')) {
    provided = auth.slice(7).trim();
  }

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
