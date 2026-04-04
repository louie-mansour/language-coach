import { describe, expect, it } from 'vitest';

import { formatTranscriptForDigest, shouldSendEmailDigest } from '../../src/useCase/dailyDigestUseCase';

describe('shouldSendEmailDigest', () => {
  const studentMsg = (createdAt: Date) => ({
    id: '1',
    studentId: 's',
    channel: 'sms' as const,
    from: 'student' as const,
    message: 'hi',
    createdAt,
  });
  const coachMsg = (createdAt: Date) => ({
    id: '2',
    studentId: 's',
    channel: 'sms' as const,
    from: 'model' as const,
    message: 'hey',
    createdAt,
  });

  it('first digest: requires a student message in the window', () => {
    const t = new Date('2026-04-03T12:00:00.000Z');
    expect(shouldSendEmailDigest([studentMsg(t)], null)).toBe(true);
    expect(shouldSendEmailDigest([coachMsg(t)], null)).toBe(false);
  });

  it('after a prior digest: requires student message after lastDigestSentAt', () => {
    const lastSent = new Date('2026-04-03T10:00:00.000Z');
    const before = new Date('2026-04-03T09:00:00.000Z');
    const after = new Date('2026-04-03T11:00:00.000Z');
    expect(shouldSendEmailDigest([studentMsg(before), coachMsg(after)], lastSent)).toBe(false);
    expect(shouldSendEmailDigest([coachMsg(before), studentMsg(after)], lastSent)).toBe(true);
  });
});

describe('formatTranscriptForDigest', () => {
  it('labels user and coach lines', () => {
    const lines = formatTranscriptForDigest([
      {
        id: '1',
        studentId: 's',
        channel: 'sms',
        from: 'student',
        message: 'Bonjour',
        createdAt: new Date(),
      },
      {
        id: '2',
        studentId: 's',
        channel: 'sms',
        from: 'model',
        message: 'Très bien!',
        createdAt: new Date(),
      },
    ]);
    expect(lines).toContain('U:Bonjour');
    expect(lines).toContain('C:Très bien!');
  });
});
