/**
 * Digest boundaries use the UTC calendar day (same instant worldwide).
 * For per-user local "today", add a timezone field later or run multiple cron jobs.
 */

/** YYYY-MM-DD in UTC for the instant `d`. */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Previous UTC calendar date relative to `now` (for a cron that runs just after midnight UTC). */
export function utcYesterdayDateString(now: Date = new Date()): string {
  const copy = new Date(now.getTime());
  copy.setUTCDate(copy.getUTCDate() - 1);
  return utcDateString(copy);
}

export function utcDayBounds(yyyyMmDd: string): { start: Date; end: Date } {
  const parts = yyyyMmDd.split('-').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid UTC date (expected YYYY-MM-DD): ${yyyyMmDd}`);
  }
  const [y, m, d] = parts;
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return { start, end };
}
