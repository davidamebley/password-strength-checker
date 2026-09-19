// Pure pattern detectors used by the scoring engine.
// Detectors never log, store, or transmit their input.

import { COMMON_PASSWORDS } from './common-passwords.js';

const MAX_SUBSTITUTION_VARIANTS = 64;
const MIN_SEQUENCE_LENGTH = 3;
const MIN_KEYBOARD_LENGTH = 4;
const MIN_REPEAT_LENGTH = 3;

const SUBSTITUTIONS = {
  '@': ['a'],
  4: ['a'],
  0: ['o'],
  3: ['e'],
  $: ['s'],
  5: ['s'],
  1: ['i', 'l'],
  7: ['t'],
};

const SUFFIX_PATTERN = /(?:\d+[!@#$%^&*?.]*|[!@#$%^&*?.]+\d*)$/;
const SUFFIX_ONLY_PATTERN = /^[\d!@#$%^&*?.]*$/;
const TRAILING_SYMBOLS_PATTERN = /[!@#$%^&*?.]+$/;
const SYMBOLS_ONLY_PATTERN = /^[!@#$%^&*?.]*$/;

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KEYBOARD_POSITIONS = new Map(
  KEYBOARD_ROWS.flatMap((row, rowIndex) =>
    [...row].map((key, column) => [key, { group: rowIndex, position: column }]),
  ),
);

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Splits text into user-perceived characters with their string offsets.
 * Falls back to code points where grapheme segmentation is unavailable.
 * @param {string} text
 * @returns {{ char: string, offset: number }[]}
 */
export function toCharacters(text) {
  if (segmenter) {
    return Array.from(segmenter.segment(text), ({ segment, index }) => ({
      char: segment,
      offset: index,
    }));
  }
  const characters = [];
  let offset = 0;
  for (const char of text) {
    characters.push({ char, offset });
    offset += char.length;
  }
  return characters;
}

/**
 * Finds runs where each character is one step from the previous one, in a consistent direction,
 * within the same group. `locate` returns `{ group, position }` for a character, or null.
 */
function findSteppedRuns(password, locate, minLength) {
  const characters = toCharacters(password);
  const locations = characters.map(({ char }) => locate(char));
  const runs = [];

  const stepBetween = (i) => {
    const previous = locations[i - 1];
    const current = locations[i];
    if (!previous || !current || previous.group !== current.group) {
      return 0;
    }
    const step = current.position - previous.position;
    return step === 1 || step === -1 ? step : 0;
  };

  const closeRun = (start, end, step) => {
    if (end - start >= minLength) {
      const offset = characters[start].offset;
      const endOffset = end < characters.length ? characters[end].offset : password.length;
      runs.push({
        group: locations[start].group,
        direction: step === 1 ? 'ascending' : 'descending',
        token: password.slice(offset, endOffset),
        start: offset,
      });
    }
  };

  let start = 0;
  let direction = 0;
  for (let i = 1; i <= characters.length; i += 1) {
    const step = i < characters.length ? stepBetween(i) : 0;
    if (step !== 0 && (direction === 0 || step === direction)) {
      direction = step;
      continue;
    }
    closeRun(start, i, direction);
    // A change of direction still links the previous character to this one.
    start = step !== 0 ? i - 1 : i;
    direction = step;
  }

  return runs;
}

function locateSequenceCharacter(char) {
  if (char.length !== 1) {
    return null;
  }
  if (char >= '0' && char <= '9') {
    return { group: 'numeric', position: char.charCodeAt(0) - 48 };
  }
  const lower = char.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    return { group: 'alphabetic', position: lower.charCodeAt(0) - 97 };
  }
  return null;
}

function locateKeyboardCharacter(char) {
  return KEYBOARD_POSITIONS.get(char.toLowerCase()) ?? null;
}

/**
 * Returns lowercase candidates produced by undoing predictable substitutions
 * (@ and 4 to a, 0 to o, 3 to e, $ and 5 to s, 1 to i or l, 7 to t).
 * Each substituted character may also be left as is, so the plain lowercase form is always
 * included first. The number of candidates is capped at 64.
 * @param {string} password
 * @returns {string[]}
 */
export function getSubstitutionVariants(password) {
  let variants = [''];
  for (const char of password.toLowerCase()) {
    const options = [char, ...(SUBSTITUTIONS[char] ?? [])];
    const next = [];
    for (const variant of variants) {
      for (const option of options) {
        if (next.length < MAX_SUBSTITUTION_VARIANTS) {
          next.push(variant + option);
        }
      }
    }
    variants = next;
  }
  return [...new Set(variants)];
}

/**
 * Splits a trailing predictable suffix (digits, years, and a few common symbols) from the base.
 * The suffix never consumes the whole password. When a digit-and-symbol suffix would leave no
 * meaningful base (as in "123456!"), only the trailing symbols are split off.
 * @param {string} password
 * @returns {{ base: string, suffix: string }}
 */
export function splitPredictableSuffix(password) {
  const match = SUFFIX_PATTERN.exec(password);
  if (!match) {
    return { base: password, suffix: '' };
  }
  const base = password.slice(0, match.index);
  if (!SUFFIX_ONLY_PATTERN.test(base)) {
    return { base, suffix: match[0] };
  }
  const symbols = TRAILING_SYMBOLS_PATTERN.exec(password);
  const symbolBase = symbols ? password.slice(0, symbols.index) : '';
  if (symbols && !SYMBOLS_ONLY_PATTERN.test(symbolBase)) {
    return { base: symbolBase, suffix: symbols[0] };
  }
  return { base: password, suffix: '' };
}

function matchCommonBase(base) {
  if (COMMON_PASSWORDS.has(base)) {
    return { base, variant: 'exact' };
  }
  const lower = base.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { base: lower, variant: 'case-insensitive' };
  }
  const substituted = getSubstitutionVariants(base).find((variant) =>
    COMMON_PASSWORDS.has(variant),
  );
  return substituted ? { base: substituted, variant: 'substitution' } : null;
}

/**
 * Matches the whole password, optionally without a predictable suffix, against the common list.
 * Substrings inside otherwise unrelated passwords are not matched.
 * @param {string} password
 * @returns {{ base: string, variant: 'exact' | 'case-insensitive' | 'substitution', suffix: string } | null}
 */
export function findCommonPassword(password) {
  if (password === '') {
    return null;
  }
  const whole = matchCommonBase(password);
  if (whole) {
    return { ...whole, suffix: '' };
  }
  const { base, suffix } = splitPredictableSuffix(password);
  if (suffix === '') {
    return null;
  }
  const trimmed = matchCommonBase(base);
  return trimmed ? { ...trimmed, suffix } : null;
}

/**
 * Finds ascending or descending runs of consecutive digits or letters (case-insensitive), length 3 or more.
 * @param {string} password
 * @returns {{ kind: 'numeric' | 'alphabetic', direction: 'ascending' | 'descending', token: string, start: number }[]}
 */
export function findSequences(password) {
  return findSteppedRuns(password, locateSequenceCharacter, MIN_SEQUENCE_LENGTH).map(
    ({ group, direction, token, start }) => ({ kind: group, direction, token, start }),
  );
}

/**
 * Finds runs of horizontally adjacent QWERTY letter-row keys (either direction, case-insensitive), length 4 or more.
 * @param {string} password
 * @returns {{ token: string, start: number }[]}
 */
export function findKeyboardPatterns(password) {
  return findSteppedRuns(password, locateKeyboardCharacter, MIN_KEYBOARD_LENGTH).map(
    ({ token, start }) => ({ token, start }),
  );
}

/**
 * Finds runs of the same character repeated 3 or more times.
 * @param {string} password
 * @returns {{ char: string, token: string, start: number, length: number }[]}
 */
export function findRepeatedCharacters(password) {
  const characters = toCharacters(password);
  const runs = [];
  let start = 0;
  for (let i = 1; i <= characters.length; i += 1) {
    if (i < characters.length && characters[i].char === characters[start].char) {
      continue;
    }
    const length = i - start;
    if (length >= MIN_REPEAT_LENGTH) {
      const offset = characters[start].offset;
      const endOffset = i < characters.length ? characters[i].offset : password.length;
      runs.push({
        char: characters[start].char,
        token: password.slice(offset, endOffset),
        start: offset,
        length,
      });
    }
    start = i;
  }
  return runs;
}

/**
 * Finds blocks of 2 or more characters repeated back to back 2 or more times.
 * Blocks made of one repeated character are left to findRepeatedCharacters.
 * Matches are non-overlapping, scanned left to right, using the shortest repeating unit.
 * @param {string} password
 * @returns {{ block: string, token: string, count: number, start: number }[]}
 */
export function findRepeatedBlocks(password) {
  const characters = toCharacters(password);
  const chars = characters.map(({ char }) => char);
  const offsets = characters.map(({ offset }) => offset);
  const n = chars.length;

  // sameRun[i] is how many identical characters start at i, so uniform blocks are skipped in O(1).
  const sameRun = new Array(n).fill(1);
  for (let i = n - 2; i >= 0; i -= 1) {
    if (chars[i] === chars[i + 1]) {
      sameRun[i] = sameRun[i + 1] + 1;
    }
  }

  const repeatsAt = (from, length) => {
    for (let k = 0; k < length; k += 1) {
      if (chars[from + k] !== chars[from - length + k]) {
        return false;
      }
    }
    return true;
  };

  const offsetAt = (index) => (index < n ? offsets[index] : password.length);
  const blocks = [];
  let i = 0;
  while (i < n) {
    let found = null;
    for (let length = 2; length * 2 <= n - i; length += 1) {
      if (sameRun[i] >= length) {
        continue;
      }
      let count = 1;
      while (i + (count + 1) * length <= n && repeatsAt(i + count * length, length)) {
        count += 1;
      }
      if (count >= 2) {
        found = { length, count };
        break;
      }
    }

    if (!found) {
      i += 1;
      continue;
    }

    const end = i + found.length * found.count;
    blocks.push({
      block: password.slice(offsetAt(i), offsetAt(i + found.length)),
      token: password.slice(offsetAt(i), offsetAt(end)),
      count: found.count,
      start: offsetAt(i),
    });
    i = end;
  }
  return blocks;
}

/**
 * Ratio of distinct user-perceived characters to total length. 0 for an empty password.
 * @param {string} password
 * @returns {number}
 */
export function getUniquenessRatio(password) {
  const characters = toCharacters(password).map(({ char }) => char);
  if (characters.length === 0) {
    return 0;
  }
  return new Set(characters).size / characters.length;
}
