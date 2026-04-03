/**
 * Twilio REST API for outbound SMS. If TWILIO_* env vars are unset, sending is a no-op.
 * @see https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource
 */
export function isSmsConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  const from = process.env.TWILIO_FROM_NUMBER?.trim() ?? '';
  return sid.length > 0 && token.length > 0 && from.length > 0;
}

export async function sendSms(params: { to: string; body: string }): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    // eslint-disable-next-line no-console
    console.warn('[sms] TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER not set; skipping send');
    return;
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: params.to,
        From: from,
        Body: params.body,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twilio HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
}
