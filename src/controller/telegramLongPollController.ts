/* eslint-disable no-console -- long-poll worker logs to stdout/stderr */
import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  isTelegramConfigured,
  sendTelegramMessage,
} from '../client/telegramClient';
import { handleIncomingMessage } from '../useCase/incomingMessageUseCase';

export type TelegramMessagePayload = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessagePayload;
};

/**
 * Long polling (getUpdates). Mutually exclusive with webhooks: we deleteWebhook on start.
 * Set TELEGRAM_LONG_POLLING=true and TELEGRAM_BOT_TOKEN.
 */
export function startTelegramLongPollingIfEnabled(): void {
  if (!longPollingEnabled()) {
    logWarn(
      'TELEGRAM_LONG_POLLING is not "true"; long polling disabled. Set TELEGRAM_LONG_POLLING=true if you want to use long polling.',
    );
  }
  if (!isTelegramConfigured()) {
    logError(
      'TELEGRAM_BOT_TOKEN is not set. Set TELEGRAM_LONG_POLLING=true and TELEGRAM_BOT_TOKEN in Railway variables to enable.',
    );
  }

  logInfo('Long polling enabled (getUpdates); clearing webhook if any');
  void runTelegramPollLoop();
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || msg.chat.type !== 'private') {
    return;
  }

  const text = msg.text?.trim();
  if (!text) {
    return;
  }

  const chatId = String(msg.chat.id);
  const outgoing = await handleIncomingMessage({
    channel: 'telegram',
    telegramChatId: chatId,
    message: text,
  });

  if (outgoing.channel !== 'telegram') {
    throw new Error('Expected telegram channel from handleIncomingMessage');
  }

  await sendTelegramMessage({
    chatId: outgoing.telegramChatId,
    text: outgoing.message,
  });
}

// --- internals ---

const ERROR_BACKOFF_MS = 5000;
const LOG_PREFIX = '[telegram]';

/** Long-poll `timeout` in seconds (0–50; default 25). Env: TELEGRAM_LONG_POLL_TIMEOUT. */
function pollTimeoutSeconds(): number {
  const raw = process.env.TELEGRAM_LONG_POLL_TIMEOUT?.trim();
  if (!raw) return 25;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 25;
  return Math.min(50, Math.max(0, n));
}

function longPollingEnabled(): boolean {
  return process.env.TELEGRAM_LONG_POLLING?.trim().toLowerCase() === 'true';
}

function logInfo(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

function logWarn(message: string): void {
  console.warn(`${LOG_PREFIX} ${message}`);
}

function logError(message: string, err?: unknown): void {
  if (err !== undefined) {
    console.error(`${LOG_PREFIX} ${message}`, err);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

function formatErrorOneLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, ' ').slice(0, 220);
}

async function runTelegramPollLoop(): Promise<void> {
  try {
    await deleteTelegramWebhook();
  } catch (err) {
    logError('deleteWebhook failed; long polling may not receive messages', err);
  }

  let offset = 0;
  for (;;) {
    try {
      const updates = await getTelegramUpdates({
        offset,
        timeoutSeconds: pollTimeoutSeconds(),
      });

      for (const u of updates) {
        await processTelegramUpdate(u);
      }

      if (updates.length > 0) {
        offset = updates[updates.length - 1].update_id + 1;
      }
    } catch (err) {
      logError(`long poll error: ${formatErrorOneLine(err)}`);
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
}
