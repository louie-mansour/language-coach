import https from 'node:https';

import type { TelegramUpdate } from '../controller/telegramLongPollController';

/** Extra socket time beyond Telegram's long-poll `timeout` (seconds). */
const GETUPDATES_SOCKET_BUFFER_SEC = 20;

function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
}

/**
 * Telegram Bot API sendMessage.
 * @see https://core.telegram.org/bots/api#sendmessage
 */
export function isTelegramConfigured(): boolean {
  return Boolean(getTelegramBotToken());
}

/**
 * Long polling: Telegram holds the request until updates arrive or timeout (max 50s).
 * Do not use while a webhook is set — call deleteTelegramWebhook first.
 *
 * Uses `node:https` (no keep-alive) instead of `fetch`/Undici: long `getUpdates` requests
 * often fail under Docker with `UND_ERR_SOCKET` / "other side closed" when the HTTP client
 * pools or closes the connection unexpectedly.
 * @see https://core.telegram.org/bots/api#getupdates
 */
export async function getTelegramUpdates(params: {
  offset: number;
  timeoutSeconds: number;
}): Promise<TelegramUpdate[]> {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }

  const timeout = Math.min(50, Math.max(0, params.timeoutSeconds));
  const url = new URL(`https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates`);
  url.searchParams.set('offset', String(params.offset));
  url.searchParams.set('timeout', String(timeout));
  url.searchParams.set('allowed_updates', JSON.stringify(['message']));

  const bodyText = await new Promise<string>((resolve, reject) => {
    const socketMs = (timeout + GETUPDATES_SOCKET_BUFFER_SEC) * 1000;
    const req = https.request(
      url,
      {
        method: 'GET',
        agent: new https.Agent({ keepAlive: false }),
        headers: { Connection: 'close' },
        timeout: socketMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            reject(
              new Error(
                `Telegram getUpdates HTTP ${code}: ${text.slice(0, 300)}`,
              ),
            );
            return;
          }
          resolve(text);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('getUpdates socket timeout'));
    });
    req.end();
  });

  let json: { ok: boolean; result?: TelegramUpdate[]; description?: string };
  try {
    json = JSON.parse(bodyText) as typeof json;
  } catch {
    throw new Error(`getUpdates invalid JSON: ${bodyText.slice(0, 200)}`);
  }

  if (!json.ok) {
    throw new Error(json.description ?? 'Telegram getUpdates ok:false');
  }

  return json.result ?? [];
}

/**
 * Removes webhook so getUpdates can receive messages.
 * @see https://core.telegram.org/bots/api#deletewebhook
 */
export async function deleteTelegramWebhook(): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/deleteWebhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };

  if (!res.ok || !json.ok) {
    throw new Error(json.description ?? `Telegram deleteWebhook HTTP ${res.status}`);
  }
}


export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
}): Promise<void> {
  const token = getTelegramBotToken();
  if (!token) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set; skipping sendMessage');
    return;
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
}
