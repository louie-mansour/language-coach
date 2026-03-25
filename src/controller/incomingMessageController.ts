import { Request, Router } from 'express';

import { handleIncomingMessage } from '../handler/incomingMessageHandler';
import type { IncomingMessage, OutgoingMessage } from '../model/message';

const router = Router();

router.post(
  '/message',
  async (req: Request<{}, unknown, IncomingMessage>, res, next) => {
    try {
      const { message, phoneNumber } = req.body;
      const incomingMessage: IncomingMessage = { message, phoneNumber };

      const outgoingMessage = await handleIncomingMessage(incomingMessage);

      res.status(200).json(outgoingMessage);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
