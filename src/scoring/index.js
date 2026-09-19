// Password scoring engine public interface.
// The engine is pure: it never logs, stores, or transmits the password.
//
// Model, in two stages:
// 1. Baseline: estimate guessing work in bits. Each character contributes log2 of the pool
//    implied by the character classes present. Parts of the password that match a detected
//    pattern are instead charged only the few bits an attacker needs to guess that pattern.
//    One bit is worth one point, up to 100.
// 2. Caps: severe weaknesses set a ceiling that length or variety cannot overcome.

import { getCategory } from './categories.js';
import { COMMON_PASSWORDS } from './common-passwords.js';
import {
  findCommonPassword,
  findKeyboardPatterns,
  findRepeatedBlocks,
  findRepeatedCharacters,
  findSequences,
  getUniquenessRatio,
  splitPredictableSuffix,
  toCharacters,
} from './detectors.js';

export { CATEGORIES, CATEGORY_BANDS, SCORE_MAX, SCORE_MIN, getCategory } from './categories.js';

export const FINDING_TYPES = Object.freeze([
  'too-short',
  'common-password',
  'predictable-substitution',
  'predictable-suffix',
  'sequence',
  'keyboard-pattern',
  'repeated-characters',
  'repeated-block',
  'low-uniqueness',
]);

// Character pools used for the baseline estimate.
const POOL = { lower: 26, upper: 26, digit: 10, symbol: 32, space: 1, other: 100 };

// Bits an attacker needs to guess each kind of predictable part.
const BITS = {
  pattern: 5, // one sequence, keyboard run, or repeated-character run
  repeatedBlock: 1, // on top of guessing the block itself once
  maxSuffix: 6, // a year or short ending, roughly 100 likely choices
  commonPassword: Math.log2(COMMON_PASSWORDS.size),
  caseVariant: 1,
  substitutionVariant: 2,
};

const SCORE_PER_BIT = 1;

// Ceilings applied after the baseline.
const CAPS = {
  commonPassword: 15, // Very Weak
  veryShort: 19, // Very Weak, under VERY_SHORT_LENGTH characters
  short: 39, // at most Weak, under SHORT_LENGTH characters
  dominantPattern: 19, // Very Weak, when patterns cover most of the password
};

// Phrase baseline. Ordinary words are far more guessable than the same number of random
// characters, so a phrase is scored from how many words it has, not from its length.
const PHRASE = {
  base: 18,
  perWord: 14, // 2 words 46, 3 words 60, 4 words 74, 5 words 88, 6 words 100
  minWords: 2,
  minWordLength: 3,
  minLetterShare: 0.7, // the words must make up most of the password
};
const WORD_SEPARATORS = /[\s-]+/;
const WORD_PATTERN = /^[\p{L}'’]+$/u;

const VERY_SHORT_LENGTH = 6;
const SHORT_LENGTH = 8;
const DOMINANT_PATTERN_COVERAGE = 0.75;
const LOW_UNIQUENESS_RATIO = 0.5;
const LOW_UNIQUENESS_MAX_DISTINCT = 7;
const LOW_UNIQUENESS_MIN_LENGTH = 4;
const SUFFIX_FINDING_MIN_LENGTH = 2;
const MAX_SUGGESTIONS = 3;
const STRONG_SCORE = 60;
const VERY_STRONG_SCORE = 80;

const MESSAGES = {
  'too-short': 'Too short to hold up against guessing.',
  'common-password': 'Appears on lists that attackers try first.',
  'predictable-substitution': 'Uses look-alike swaps that attackers expect.',
  'predictable-suffix': 'Ends with a predictable year, number, or symbol.',
  sequence: 'Contains an alphabetic or numeric sequence.',
  'keyboard-pattern': 'Contains a run of neighboring keyboard keys.',
  'repeated-characters': 'Repeats the same character several times.',
  'repeated-block': 'Repeats the same group of characters.',
  'low-uniqueness': 'Uses very few different characters.',
};

// Ordered by priority. Each entry lists the findings it addresses.
const SUGGESTIONS = [
  {
    types: ['common-password', 'predictable-substitution'],
    text: 'Avoid well-known choices, even with look-alike swaps.',
  },
  { types: ['too-short'], text: 'Make it longer. Several unrelated words work well.' },
  {
    types: ['repeated-characters', 'repeated-block', 'low-uniqueness'],
    text: 'Avoid repeated characters and repeated chunks.',
  },
  { types: ['sequence', 'keyboard-pattern'], text: 'Avoid sequences and keyboard runs.' },
  {
    types: ['predictable-suffix'],
    text: 'Avoid ending with a year or other predictable addition.',
  },
];
const WEAK_FALLBACK_SUGGESTION = 'Use a longer phrase of unrelated words.';
const STRONG_FALLBACK_SUGGESTION = 'Add another unrelated word to make it even stronger.';

function classifyCharacter(char) {
  if (/^[a-z]$/.test(char)) return 'lower';
  if (/^[A-Z]$/.test(char)) return 'upper';
  if (/^[0-9]$/.test(char)) return 'digit';
  if (char === ' ') return 'space';
  if (/^[\x21-\x7e]$/.test(char)) return 'symbol';
  return 'other';
}

function bitsPerCharacter(chars) {
  const classes = new Set(chars.map(classifyCharacter));
  const pool = [...classes].reduce((total, name) => total + POOL[name], 0);
  return pool > 1 ? Math.log2(pool) : 0;
}

/**
 * Counts the words of a phrase-shaped password, or returns 0 when it is not phrase shaped.
 * Words are alphabetic tokens separated by spaces or hyphens, and they must make up most
 * of the password so that a random password with a word appended is not treated as a phrase.
 */
function countPhraseWords(password, length) {
  const words = password
    .split(WORD_SEPARATORS)
    .filter((token) => WORD_PATTERN.test(token) && token.length >= PHRASE.minWordLength);
  if (words.length < PHRASE.minWords) {
    return 0;
  }
  const letters = words.reduce((total, word) => total + word.length, 0);
  return letters / length >= PHRASE.minLetterShare ? words.length : 0;
}

function isLowUniqueness(chars, password) {
  const distinct = new Set(chars).size;
  return (
    chars.length >= LOW_UNIQUENESS_MIN_LENGTH &&
    distinct <= LOW_UNIQUENESS_MAX_DISTINCT &&
    getUniquenessRatio(password) < LOW_UNIQUENESS_RATIO
  );
}

/**
 * Picks non-overlapping pattern tokens, preferring longer ones, then cheaper ones.
 * Each token is `{ start, end, bits, counts }`, where `counts` marks it as structural
 * (it counts toward pattern dominance) rather than a suffix.
 */
function selectTokens(tokens) {
  const sorted = [...tokens].sort((a, b) => b.end - b.start - (a.end - a.start) || a.bits - b.bits);
  const chosen = [];
  for (const token of sorted) {
    if (chosen.every((other) => token.end <= other.start || token.start >= other.end)) {
      chosen.push(token);
    }
  }
  return chosen;
}

/**
 * Analyzes a non-empty password: estimated bits, pattern coverage, and raw detections.
 */
function analyze(password) {
  const characters = toCharacters(password);
  const chars = characters.map(({ char }) => char);
  const perChar = bitsPerCharacter(chars);
  const common = findCommonPassword(password);
  const suffix = common ? common.suffix : splitPredictableSuffix(password).suffix;
  const sequences = findSequences(password);
  const keyboard = findKeyboardPatterns(password);
  const repeats = findRepeatedCharacters(password);
  const blocks = findRepeatedBlocks(password);
  const lowUniqueness = isLowUniqueness(chars, password);
  const suffixBits = Math.min(toCharacters(suffix).length * perChar, BITS.maxSuffix);

  let bits;
  let coverage = 0;

  if (common) {
    bits =
      BITS.commonPassword +
      (common.variant === 'case-insensitive' ? BITS.caseVariant : 0) +
      (common.variant === 'substitution' ? BITS.substitutionVariant : 0) +
      (suffix ? suffixBits : 0);
  } else {
    const span = (start, token) => ({ start, end: start + token.length });
    const tokens = [
      ...sequences.map((m) => ({ ...span(m.start, m.token), bits: BITS.pattern, counts: true })),
      ...keyboard.map((m) => ({ ...span(m.start, m.token), bits: BITS.pattern, counts: true })),
      ...repeats.map((m) => ({ ...span(m.start, m.token), bits: BITS.pattern, counts: true })),
      ...blocks.map((m) => ({
        ...span(m.start, m.token),
        bits: analyze(m.block).bits + BITS.repeatedBlock,
        counts: true,
      })),
    ];
    if (suffix) {
      tokens.push({ ...span(password.length - suffix.length, suffix), bits: suffixBits });
    }

    const chosen = selectTokens(tokens);
    const inToken = ({ offset }) => chosen.find((t) => offset >= t.start && offset < t.end);
    const free = characters.filter((c) => !inToken(c)).length;
    const structural = characters.filter((c) => inToken(c)?.counts).length;

    bits = free * perChar + chosen.reduce((total, token) => total + token.bits, 0);
    coverage = structural / characters.length;
  }

  if (lowUniqueness) {
    // An attacker who guesses the small alphabet only searches that alphabet.
    const distinct = new Set(chars).size;
    bits = Math.min(bits, chars.length * Math.log2(Math.max(distinct, 2)));
  }

  return {
    bits,
    length: chars.length,
    words: countPhraseWords(password, chars.length),
    coverage,
    common,
    suffix,
    detected: {
      sequence: sequences.length > 0,
      'keyboard-pattern': keyboard.length > 0,
      'repeated-characters': repeats.length > 0,
      'repeated-block': blocks.length > 0,
      'low-uniqueness': lowUniqueness,
    },
  };
}

function scoreFrom(analysis) {
  let score = Math.min(analysis.bits * SCORE_PER_BIT, 100);
  if (analysis.words > 0) {
    // A phrase is only as strong as its word count allows, however long it is.
    score = Math.min(score, PHRASE.base + PHRASE.perWord * analysis.words);
  }
  if (analysis.common) score = Math.min(score, CAPS.commonPassword);
  if (analysis.length < VERY_SHORT_LENGTH) score = Math.min(score, CAPS.veryShort);
  else if (analysis.length < SHORT_LENGTH) score = Math.min(score, CAPS.short);
  if (analysis.coverage >= DOMINANT_PATTERN_COVERAGE) {
    score = Math.min(score, CAPS.dominantPattern);
  }
  return Math.max(0, Math.round(score));
}

function findingTypesFrom(analysis) {
  const present = new Set();
  if (analysis.length < SHORT_LENGTH) present.add('too-short');
  if (analysis.common) present.add('common-password');
  if (analysis.common?.variant === 'substitution') present.add('predictable-substitution');
  if (analysis.suffix.length >= SUFFIX_FINDING_MIN_LENGTH || (analysis.common && analysis.suffix)) {
    present.add('predictable-suffix');
  }
  for (const [type, found] of Object.entries(analysis.detected)) {
    if (found) present.add(type);
  }
  return FINDING_TYPES.filter((type) => present.has(type));
}

function suggestionsFor(types, score) {
  const suggestions = SUGGESTIONS.filter(({ types: addressed }) =>
    addressed.some((type) => types.includes(type)),
  ).map(({ text }) => text);

  if (suggestions.length === 0 && score < STRONG_SCORE) {
    suggestions.push(WEAK_FALLBACK_SUGGESTION);
  } else if (suggestions.length === 0 && score < VERY_STRONG_SCORE) {
    suggestions.push(STRONG_FALLBACK_SUGGESTION);
  } else if (score < STRONG_SCORE && !types.includes('too-short')) {
    suggestions.push(WEAK_FALLBACK_SUGGESTION);
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/**
 * @typedef {object} Finding
 * @property {string} type One of FINDING_TYPES.
 * @property {string} message Short user-facing description. Never contains the password.
 */

/**
 * @typedef {object} Evaluation
 * @property {number} score Integer from 0 to 100.
 * @property {'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong'} category
 * @property {Finding[]} findings
 * @property {string[]} suggestions At most 3 short suggestions.
 */

/**
 * Evaluates a password.
 * @param {string} password
 * @returns {Evaluation}
 */
export function evaluatePassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('Password must be a string');
  }
  if (password === '') {
    return { score: 0, category: getCategory(0), findings: [], suggestions: [] };
  }

  const analysis = analyze(password);
  const score = scoreFrom(analysis);
  const types = findingTypesFrom(analysis);

  return {
    score,
    category: getCategory(score),
    findings: types.map((type) => ({ type, message: MESSAGES[type] })),
    suggestions: suggestionsFor(types, score),
  };
}
