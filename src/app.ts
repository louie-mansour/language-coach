import cors from 'cors';
import express from 'express';
import dailyDigestRouter from './controller/dailyDigestController';
import healthRouter from './controller/healthController';
import incomingMessageRouter from './controller/incomingMessageController';
import { requireApiKey } from './middleware/requireApiKey';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  // /health must stay public so load balancers (e.g. Railway) can probe without API keys.
  app.use(healthRouter);
  // Cron / scheduled jobs use CRON_SECRET, not API_KEY.
  app.use(dailyDigestRouter);
  app.use(requireApiKey);
  app.use(incomingMessageRouter);

  return app;
}

