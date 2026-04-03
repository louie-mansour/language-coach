import dotenv from 'dotenv';
import { createApp } from './app';
import { startTelegramLongPollingIfEnabled } from './controller/telegramLongPollController';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = createApp();

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${host}:${port}`);
  startTelegramLongPollingIfEnabled();
});

