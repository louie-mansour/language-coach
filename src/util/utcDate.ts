/**
 * Digest time range: rolling last 24 hours (UTC instants). For per-user local "today", add a timezone field later.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/** YYYY-MM-DD in UTC for the instant `d`. */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `[start, end)` where `end` is `now` and `start` is 24 hours earlier (message query uses `gte` / `lt`). */
export function utcLast24HoursBounds(now: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - 24 * MS_PER_HOUR);
  return { start, end };
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
