import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_BANDS, getCategory } from '../../src/scoring/categories.js';

describe('category bands', () => {
  it('lists the five categories from weakest to strongest', () => {
    expect(CATEGORIES).toEqual(['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']);
  });

  it('uses the approved band boundaries', () => {
    expect(CATEGORY_BANDS.map((band) => band.min)).toEqual([0, 20, 40, 60, 80]);
  });

  it('maps boundary scores to the correct category', () => {
    const cases = [
      [0, 'Very Weak'],
      [19, 'Very Weak'],
      [19.9, 'Very Weak'],
      [20, 'Weak'],
      [39, 'Weak'],
      [40, 'Fair'],
      [59, 'Fair'],
      [60, 'Strong'],
      [79, 'Strong'],
      [80, 'Very Strong'],
      [100, 'Very Strong'],
    ];
    for (const [score, category] of cases) {
      expect(getCategory(score), `score ${score}`).toBe(category);
    }
  });

  it('rejects scores outside 0 to 100 and non-numbers', () => {
    for (const score of [-1, 101, Number.NaN, '50', undefined]) {
      expect(() => getCategory(score), `score ${String(score)}`).toThrow(RangeError);
    }
  });
});
