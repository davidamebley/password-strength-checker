export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

// Ordered from weakest to strongest. Each band covers scores from `min` up to the next band's `min`.
export const CATEGORY_BANDS = Object.freeze([
  Object.freeze({ category: 'Very Weak', min: 0 }),
  Object.freeze({ category: 'Weak', min: 20 }),
  Object.freeze({ category: 'Fair', min: 40 }),
  Object.freeze({ category: 'Strong', min: 60 }),
  Object.freeze({ category: 'Very Strong', min: 80 }),
]);

export const CATEGORIES = Object.freeze(CATEGORY_BANDS.map((band) => band.category));

/**
 * Maps a score from 0 to 100 to its category.
 * @param {number} score
 * @returns {'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong'}
 */
export function getCategory(score) {
  if (typeof score !== 'number' || Number.isNaN(score) || score < SCORE_MIN || score > SCORE_MAX) {
    throw new RangeError(`Score must be a number from ${SCORE_MIN} to ${SCORE_MAX}`);
  }

  for (let i = CATEGORY_BANDS.length - 1; i >= 0; i -= 1) {
    if (score >= CATEGORY_BANDS[i].min) {
      return CATEGORY_BANDS[i].category;
    }
  }

  return CATEGORY_BANDS[0].category;
}
