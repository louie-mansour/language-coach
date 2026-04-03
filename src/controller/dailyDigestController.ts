import { Router } from 'express';

import { requireCronSecret } from '../middleware/requireCronSecret';
import { runDailyDigestForAllStudents } from '../useCase/dailyDigestUseCase';

const router = Router();

router.post('/internal/daily-digest', requireCronSecret, async (req, res, next) => {
  try {
    const raw = req.body?.date;
    const date =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
    if (raw !== undefined && raw !== null && !date) {
      res.status(400).json({ error: 'Invalid date (use YYYY-MM-DD, UTC calendar day)' });
      return;
    }

    const summary = await runDailyDigestForAllStudents(date);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
