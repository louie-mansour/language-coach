import cors from 'cors';
import express from 'express';
import healthRouter from './controller/healthController';
import incomingMessageRouter from './controller/incomingMessageController';
import { requireApiKey } from './middleware/requireApiKey';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  // /health must stay public so load balancers (e.g. Railway) can probe without API keys.
  app.use(healthRouter);
  app.use(requireApiKey);
  app.use(incomingMessageRouter);

  return app;
}

