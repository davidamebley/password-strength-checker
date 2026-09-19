// Password generator. Pure apart from its use of the Web Crypto API, and never
// stores or transmits what it produces.

export const CHARACTER_SETS = Object.freeze({
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
});

export const SET_KEYS = Object.freeze(Object.keys(CHARACTER_SETS));

export const LENGTH = Object.freeze({ min: 8, max: 64, default: 16 });

function getRandomValues(array) {
  const source = globalThis.crypto;
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new Error('This browser does not provide secure random values.');
  }
  return source.getRandomValues(array);
}

/**
 * Returns a uniformly distributed integer in [0, maxExclusive) using rejection
 * sampling, so no value is favoured by the modulo.
 * @param {number} maxExclusive
 * @returns {number}
 */
export function randomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError('maxExclusive must be a positive integer');
  }

  const buffer = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;

  let value;
  do {
    getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % maxExclusive;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function pick(characters) {
  return characters[randomInt(characters.length)];
}

/**
 * Generates a password of the requested length from the selected character sets.
 * Every selected set that fits in the length is represented at least once.
 * @param {{ length: number, sets: string[] }} options
 * @returns {string}
 */
export function generatePassword({ length, sets }) {
  if (!Number.isInteger(length) || length < LENGTH.min || length > LENGTH.max) {
    throw new RangeError(`Length must be an integer from ${LENGTH.min} to ${LENGTH.max}`);
  }
  if (!Array.isArray(sets) || sets.length === 0) {
    throw new RangeError('At least one character set must be selected');
  }

  const selected = SET_KEYS.filter((key) => sets.includes(key));
  if (selected.length !== sets.length) {
    throw new RangeError('Unknown character set requested');
  }

  const pool = selected.map((key) => CHARACTER_SETS[key]).join('');
  const characters = selected.slice(0, length).map((key) => pick(CHARACTER_SETS[key]));

  while (characters.length < length) {
    characters.push(pick(pool));
  }

  return shuffle(characters).join('');
}
