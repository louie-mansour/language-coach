import { describe, expect, it } from 'vitest';

import {
  utcDateString,
  utcDayBounds,
  utcLast24HoursBounds,
  utcYesterdayDateString,
} from '../../src/util/utcDate';

describe('utcDate', () => {
  it('utcDayBounds covers one UTC calendar day', () => {
    const { start, end } = utcDayBounds('2026-03-15');
    expect(start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('utcYesterdayDateString is previous calendar day in UTC', () => {
    const d = new Date('2026-03-15T12:00:00.000Z');
    expect(utcYesterdayDateString(d)).toBe('2026-03-14');
  });

  it('utcDateString formats YYYY-MM-DD', () => {
    expect(utcDateString(new Date('2026-01-05T23:59:59.999Z'))).toBe('2026-01-05');
  });

  it('utcLast24HoursBounds is 24h ending at now', () => {
    const now = new Date('2026-04-03T15:30:00.000Z');
    const { start, end } = utcLast24HoursBounds(now);
    expect(end.toISOString()).toBe('2026-04-03T15:30:00.000Z');
    expect(start.toISOString()).toBe('2026-04-02T15:30:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
