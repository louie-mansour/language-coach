import { Router } from 'express';

import { requireCronSecret } from '../middleware/requireCronSecret';
import { runDailyDigestForAllStudents } from '../useCase/dailyDigestUseCase';

const router = Router();

router.post('/internal/daily-digest', requireCronSecret, async (req, res, next) => {
  try {
    const summary = await runDailyDigestForAllStudents();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
