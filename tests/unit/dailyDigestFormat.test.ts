import { describe, expect, it } from 'vitest';

import { formatTranscriptForDigest } from '../../src/useCase/dailyDigestUseCase';

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
