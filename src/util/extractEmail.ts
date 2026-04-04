/** Rough email pattern for chat messages (first plausible address wins). */
const EMAIL_IN_TEXT =
  /\b[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g;

const MAX_EMAIL_LEN = 254;

/**
 * Returns the first substring that looks like an email, lowercased, or null.
 */
export function extractFirstEmailFromText(text: string): string | null {
  const m = text.match(EMAIL_IN_TEXT);
  if (!m?.[0]) return null;
  const raw = m[0].toLowerCase();
  if (raw.length > MAX_EMAIL_LEN) return null;
  return raw;
}
