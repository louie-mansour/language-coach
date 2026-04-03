import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  isTelegramConfigured,
  sendTelegramMessage,
} from '../client/telegramClient';
import { handleIncomingMessage } from '../useCase/incomingMessageUseCase';

const ERROR_BACKOFF_MS = 5000;

/** Telegram long-poll duration (0–50). Shorter values are more reliable through some NATs / Docker Desktop. */
function pollTimeoutSeconds(): number {
  const raw = process.env.TELEGRAM_LONG_POLL_TIMEOUT?.trim();
  if (!raw) return 25;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 25;
  return Math.min(50, Math.max(0, n));
}

export type TelegramMessagePayload = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessagePayload;
};


function longPollingEnabled(): boolean {
  return process.env.TELEGRAM_LONG_POLLING?.trim().toLowerCase() === 'true';
}

/**
 * Telegram Bot API long polling (getUpdates with timeout). Mutually exclusive with webhooks:
 * on start we call deleteWebhook so Telegram delivers updates here.
 * Enable with TELEGRAM_LONG_POLLING=true and TELEGRAM_BOT_TOKEN set.
 */
export function startTelegramLongPollingIfEnabled(): void {
  if (!longPollingEnabled()) {
    return;
  }
  if (!isTelegramConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] TELEGRAM_LONG_POLLING is true but TELEGRAM_BOT_TOKEN is missing; skipping poller');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[telegram] Long polling enabled (getUpdates); clearing webhook if any');
  void runTelegramPollLoop();
}

async function runTelegramPollLoop(): Promise<void> {
  try {
    await deleteTelegramWebhook();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[telegram] deleteWebhook failed; long polling may not receive messages', err);
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
      const msg = err instanceof Error ? err.message : String(err);
      const oneLine = msg.replace(/\s+/g, ' ').slice(0, 220);
      // eslint-disable-next-line no-console
      console.error('[telegram] long poll error:', oneLine);
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }
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
