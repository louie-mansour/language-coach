/**
 * Resend HTTP API (no SMTP). If RESEND_API_KEY / EMAIL_FROM are unset, sending is a no-op.
 * @see https://resend.com/docs/api-reference/emails/send-email
 */
export function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim() ?? '';
  const from = process.env.EMAIL_FROM?.trim() ?? '';
  return key.length > 0 && from.length > 0;
}

export async function sendHtmlEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) {
    // eslint-disable-next-line no-console
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM not set; skipping send');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
}
