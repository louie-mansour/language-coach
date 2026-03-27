import cors from 'cors';
import express from 'express';
import healthRouter from './controller/healthController';
import incomingMessageRouter from './controller/incomingMessageController';
import { requireApiKey } from './middleware/requireApiKey';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requireApiKey);
  app.use(healthRouter);
  app.use(incomingMessageRouter);

  return app;
}

