import { describe, expect, it } from 'vitest';

import { extractFirstEmailFromText } from '../../src/util/extractEmail';

describe('extractFirstEmailFromText', () => {
  it('extracts first email and lowercases', () => {
    expect(extractFirstEmailFromText('reach me at Jane.Doe@Example.COM thanks')).toBe('jane.doe@example.com');
  });

  it('returns null when none', () => {
    expect(extractFirstEmailFromText('no address here')).toBeNull();
  });

  it('picks first when multiple', () => {
    expect(extractFirstEmailFromText('a@b.co then c@d.co')).toBe('a@b.co');
  });
});
