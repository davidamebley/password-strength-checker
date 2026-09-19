import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from '../../src/scoring/common-passwords.js';

describe('common password list', () => {
  it('stays compact', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(50);
    expect(COMMON_PASSWORDS.size).toBeLessThanOrEqual(500);
  });

  it('stores lowercase, trimmed base forms only', () => {
    for (const entry of COMMON_PASSWORDS) {
      expect(entry).toBe(entry.toLowerCase().trim());
    }
  });

  it('includes the most common passwords', () => {
    for (const entry of ['password', '123456', 'qwerty', 'iloveyou', 'letmein', 'admin']) {
      expect(COMMON_PASSWORDS.has(entry), entry).toBe(true);
    }
  });
});
