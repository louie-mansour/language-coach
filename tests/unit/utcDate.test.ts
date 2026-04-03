import { describe, expect, it } from 'vitest';

import { utcDateString, utcDayBounds, utcYesterdayDateString } from '../../src/util/utcDate';

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
});
