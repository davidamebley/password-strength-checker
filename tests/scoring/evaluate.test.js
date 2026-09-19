import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, FINDING_TYPES, evaluatePassword } from '../../src/scoring/index.js';

const score = (password) => evaluatePassword(password).score;
const findingTypes = (password) => evaluatePassword(password).findings.map((f) => f.type);

// Fixtures chosen to avoid the common-password list and accidental patterns.
const PASSPHRASE_SPACES = 'velvet orbit maple tundra';
const PASSPHRASE_HYPHENS = 'velvet-orbit-maple-tundra';
const PASSPHRASE_SEPARATED = 'copper-lantern-drifts-quietly';
const PASSPHRASE_LONG = 'the lighthouse keeper paints purple thunder';
const RANDOM_MIXED_16 = 'k7#Qv9!mZ2@wL4$x';
const RANDOM_MIXED_8 = 'k7#Qv9!m';
const RANDOM_LOWER_16 = 'qmzvtrkplxwnbhgd';
const RANDOM_LOWER_8 = 'qmzvtrkp';

const SAMPLE_PASSWORDS = [
  '',
  'a',
  '123456',
  'password',
  'P@ssw0rd123!',
  'aaaaaaaaaaaa',
  'abc123xyz',
  'Coffee2026',
  'Tiger#Lamp2019',
  PASSPHRASE_SPACES,
  PASSPHRASE_LONG,
  RANDOM_MIXED_16,
  RANDOM_LOWER_16,
];

describe('evaluatePassword contract', () => {
  it('returns exactly score, category, findings, and suggestions', () => {
    const result = evaluatePassword('Coffee2026');
    expect(Object.keys(result).sort()).toEqual(['category', 'findings', 'score', 'suggestions']);
  });

  it('rejects non-string input', () => {
    for (const input of [undefined, null, 123456]) {
      expect(() => evaluatePassword(input)).toThrow(TypeError);
    }
  });

  it('returns an integer score from 0 to 100 whose category matches the bands', () => {
    const minimums = [0, 20, 40, 60, 80, 101];
    const inputs = [...SAMPLE_PASSWORDS, ' ', '\t\n', 'pässwörd', '\u{1F512}\u{1F511}\u{1F510}'];
    for (const password of inputs) {
      const { score: value, category } = evaluatePassword(password);
      const index = CATEGORIES.indexOf(category);
      expect(Number.isInteger(value), JSON.stringify(password)).toBe(true);
      expect(index, JSON.stringify(password)).toBeGreaterThanOrEqual(0);
      expect(value).toBeGreaterThanOrEqual(minimums[index]);
      expect(value).toBeLessThan(minimums[index + 1]);
    }
  });

  it('handles very long repetitive input', () => {
    expect(evaluatePassword('x'.repeat(1000)).category).toBe('Very Weak');
  });

  it('is deterministic', () => {
    for (const password of SAMPLE_PASSWORDS) {
      expect(evaluatePassword(password)).toEqual(evaluatePassword(password));
    }
  });

  it('scores the empty password as 0 with no findings or suggestions', () => {
    expect(evaluatePassword('')).toEqual({
      score: 0,
      category: 'Very Weak',
      findings: [],
      suggestions: [],
    });
  });

  it('describes each finding once, with a known type and a message', () => {
    for (const password of SAMPLE_PASSWORDS) {
      const { findings } = evaluatePassword(password);
      const types = findings.map((f) => f.type);
      expect(new Set(types).size, password).toBe(types.length);
      for (const finding of findings) {
        expect(FINDING_TYPES).toContain(finding.type);
        expect(finding.message).toEqual(expect.any(String));
        expect(finding.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('clearly weak passwords', () => {
  it.each([
    'a',
    '123456',
    'password',
    'PASSWORD',
    'Password1!',
    'P@ssw0rd123!',
    'qwerty',
    'qwerty2026',
    'abcdef',
    '654321',
    'aaaaaaaaaaaa',
    '111111111111',
    'abcabcabc',
  ])('rates %j as Very Weak', (password) => {
    expect(evaluatePassword(password).category).toBe('Very Weak');
  });

  it('keeps obvious combinations of patterns below Fair', () => {
    for (const password of [
      'abc123xyz',
      'qwerty123abc',
      'abcabc123123',
      'Qwerty2026!',
      'passwordpassword',
      'Dragon!2024',
    ]) {
      expect(score(password), password).toBeLessThan(40);
    }
  });
});

describe('middle-strength passwords', () => {
  it('rates a word with a year suffix below Strong', () => {
    expect(score('Coffee2026')).toBeLessThan(60);
  });

  it('rates two words with a symbol and year from Weak to Strong', () => {
    expect(score('Tiger#Lamp2019')).toBeGreaterThanOrEqual(20);
    expect(score('Tiger#Lamp2019')).toBeLessThan(80);
  });

  it('orders common, predictable, and passphrase passwords sensibly', () => {
    expect(score('Coffee2026')).toBeGreaterThan(score('Password1!'));
    expect(score('Tiger#Lamp2019')).toBeGreaterThan(score('Coffee2026'));
    expect(score(PASSPHRASE_SPACES)).toBeGreaterThan(score('Tiger#Lamp2019'));
  });

  it('rates several sequences above a single sequence', () => {
    expect(score('abc123xyz')).toBeGreaterThan(score('abcdef'));
  });
});

describe('strong passwords', () => {
  it('rates sensible four-word passphrases Strong, not automatically perfect', () => {
    for (const password of [PASSPHRASE_SPACES, PASSPHRASE_HYPHENS, PASSPHRASE_SEPARATED]) {
      expect(score(password), password).toBeGreaterThanOrEqual(60);
      expect(score(password), password).toBeLessThan(80);
    }
  });

  it('rates short everyday phrases below Strong', () => {
    for (const password of ['Hello World', 'summer in paris', 'my dog']) {
      expect(score(password), password).toBeLessThan(60);
    }
  });

  it('rates a longer six-word passphrase as Very Strong', () => {
    expect(evaluatePassword(PASSPHRASE_LONG).category).toBe('Very Strong');
  });

  it('rates a long random-looking mixed password as Very Strong', () => {
    expect(evaluatePassword(RANDOM_MIXED_16).category).toBe('Very Strong');
  });

  it('does not require uppercase, digits, or symbols to reach Strong', () => {
    expect(score(RANDOM_LOWER_16)).toBeGreaterThanOrEqual(60);
  });

  it('keeps a passphrase Strong when a year is appended', () => {
    expect(score(`${PASSPHRASE_SPACES} 2026`)).toBeGreaterThanOrEqual(60);
  });
});

describe('relationships', () => {
  it('does not let substitutions and suffixes lift a common password substantially', () => {
    expect(score('P@ssw0rd123!') - score('password')).toBeLessThanOrEqual(10);
    expect(score('Password1!') - score('password')).toBeLessThanOrEqual(10);
  });

  it('never lifts a common password to Fair by growing a predictable suffix', () => {
    for (const password of [
      'password1',
      'password123',
      'password12345678',
      'Password2026!',
      'Password2026!!!',
    ]) {
      expect(score(password), password).toBeLessThan(40);
    }
  });

  it('scores single-character repetition far below an equally long diverse password', () => {
    expect(score(RANDOM_MIXED_16) - score('aaaaaaaaaaaaaaaa')).toBeGreaterThanOrEqual(50);
  });

  it('scores longer unpredictable passwords above shorter ones', () => {
    expect(score(RANDOM_MIXED_16)).toBeGreaterThan(score(RANDOM_MIXED_8));
    expect(score(RANDOM_LOWER_16)).toBeGreaterThan(score(RANDOM_LOWER_8));
    expect(score('k7#Qv9!mZ2@')).toBeGreaterThanOrEqual(score('k7#Qv9!mZ2'));
  });

  it('treats spaces and hyphens as equivalent separators', () => {
    expect(Math.abs(score(PASSPHRASE_SPACES) - score(PASSPHRASE_HYPHENS))).toBeLessThanOrEqual(10);
  });

  it('scores a passphrase well above a short common password with every character class', () => {
    expect(score(PASSPHRASE_SPACES)).toBeGreaterThan(score('P@ssw0rd123!') + 40);
  });
});

describe('findings', () => {
  it.each([
    ['a', ['too-short']],
    ['password', ['common-password']],
    ['P@ssw0rd123!', ['common-password', 'predictable-substitution', 'predictable-suffix']],
    ['qwerty2026', ['common-password', 'keyboard-pattern', 'predictable-suffix']],
    ['654321', ['sequence']],
    ['aaaaaaaaaaaa', ['repeated-characters', 'low-uniqueness']],
    ['abcabcabc', ['repeated-block']],
  ])('reports the expected weaknesses for %j', (password, expected) => {
    expect(findingTypes(password)).toEqual(expect.arrayContaining(expected));
  });

  it('reports no weaknesses for passphrases made of ordinary words', () => {
    for (const password of [PASSPHRASE_SPACES, PASSPHRASE_SEPARATED, PASSPHRASE_LONG]) {
      expect(evaluatePassword(password).findings, password).toEqual([]);
    }
  });

  it('reports no weaknesses for a long random password', () => {
    expect(evaluatePassword(RANDOM_MIXED_16).findings).toEqual([]);
  });
});

describe('suggestions', () => {
  it('offers at least one suggestion for weak passwords', () => {
    for (const password of ['a', 'password', 'P@ssw0rd123!', 'aaaaaaaaaaaa', 'Coffee2026']) {
      expect(evaluatePassword(password).suggestions.length, password).toBeGreaterThan(0);
    }
  });

  it('keeps suggestions compact, unique, and non-empty', () => {
    for (const password of SAMPLE_PASSWORDS) {
      const { suggestions } = evaluatePassword(password);
      expect(suggestions.length).toBeLessThanOrEqual(3);
      expect(new Set(suggestions).size).toBe(suggestions.length);
      for (const suggestion of suggestions) {
        expect(suggestion).toEqual(expect.any(String));
        expect(suggestion.length).toBeGreaterThan(0);
      }
    }
  });

  it('never tells a strong lowercase password to add character classes', () => {
    for (const password of [PASSPHRASE_SPACES, PASSPHRASE_LONG, RANDOM_LOWER_16]) {
      for (const suggestion of evaluatePassword(password).suggestions) {
        expect(suggestion).not.toMatch(/uppercase|capital|symbol|special|number|digit/i);
      }
    }
  });

  it('never uses em dashes in messages or suggestions', () => {
    for (const password of SAMPLE_PASSWORDS) {
      const { findings, suggestions } = evaluatePassword(password);
      const text = [...findings.map((f) => f.message), ...suggestions].join('\n');
      expect(text).not.toContain('—');
    }
  });
});

describe('privacy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never echoes the password in its result', () => {
    for (const password of ['P@ssw0rd123!', 'Coffee2026', PASSPHRASE_SPACES, RANDOM_MIXED_16]) {
      expect(JSON.stringify(evaluatePassword(password))).not.toContain(password);
    }
  });

  it('does not log or make network requests', () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Network access is not allowed');
    });

    for (const password of SAMPLE_PASSWORDS) {
      evaluatePassword(password);
    }

    for (const spy of [...spies, fetchSpy]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('edge cases', () => {
  it('handles whitespace-only input without crashing and rates it Very Weak', () => {
    for (const password of [' ', '   ', '        ', '\t\n\r']) {
      expect(evaluatePassword(password).category, JSON.stringify(password)).toBe('Very Weak');
    }
  });

  it('ignores surrounding whitespace, which an attacker would strip anyway', () => {
    for (const password of ['password', 'Password1!', 'Coffee2026', PASSPHRASE_SPACES]) {
      for (const padded of [` ${password}`, `${password} `, `  ${password}  `, `\t${password}\n`]) {
        expect(evaluatePassword(padded), padded).toEqual(evaluatePassword(password));
      }
    }
  });

  it('still flags a common password hidden behind padding', () => {
    expect(findingTypes(' password ')).toContain('common-password');
  });

  it('treats underscores, dots, and commas as separators, like spaces and hyphens', () => {
    for (const separator of ['_', '.', ',', '+', '/']) {
      const password = PASSPHRASE_SPACES.replaceAll(' ', separator);
      expect(Math.abs(score(password) - score(PASSPHRASE_SPACES)), password).toBeLessThanOrEqual(
        10,
      );
    }
  });

  it('rates Unicode letters and emoji without treating them as free strength', () => {
    expect(score('crème brûlée soleil')).toBeGreaterThanOrEqual(40);
    expect(evaluatePassword('🙂🙂🙂🙂').category).toBe('Very Weak');
    expect(findingTypes('ααααααα')).toEqual(
      expect.arrayContaining(['repeated-characters', 'low-uniqueness']),
    );
    expect(evaluatePassword('🙂🦀🌍🚀🎉🍕🐙🌵').category).not.toBe('Very Weak');
  });

  it('counts a grapheme cluster as one character rather than several', () => {
    expect(findingTypes('ééé')).toContain('repeated-characters');
  });

  it('rates very long passwords sensibly and quickly', () => {
    // Deterministic pseudo-random text, so the expectations cannot flake.
    let seed = 12345;
    const varied = Array.from({ length: 1000 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(33 + (seed % 94));
    }).join('');
    const repetitive = 'ab'.repeat(500);

    const start = performance.now();
    expect(evaluatePassword(varied).category).toBe('Very Strong');
    expect(evaluatePassword(repetitive).category).toBe('Very Weak');
    // A thousand characters is evaluated on every keystroke, so it has to stay fast.
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('repeated phrase separators', () => {
  const PHRASE_WITH_SHORT_WORD = 'my dog has fleas';

  it('does not let repeated spaces raise the score', () => {
    for (const spaces of ['  ', '   ', '    ']) {
      const padded = PHRASE_WITH_SHORT_WORD.replaceAll(' ', spaces);
      expect(score(padded), padded).toBe(score(PHRASE_WITH_SHORT_WORD));
    }
  });

  it('treats a run of any recognized separator as a single separator', () => {
    for (const separator of ['-', '_', '.', ',', '+', '/']) {
      const single = PHRASE_WITH_SHORT_WORD.replaceAll(' ', separator);
      const repeated = PHRASE_WITH_SHORT_WORD.replaceAll(' ', separator.repeat(3));
      expect(score(repeated), repeated).toBe(score(single));
      expect(score(single), single).toBe(score(PHRASE_WITH_SHORT_WORD));
    }
  });

  it('leaves ordinary phrases where they were', () => {
    for (const password of [PASSPHRASE_SPACES, PASSPHRASE_HYPHENS, PASSPHRASE_SEPARATED]) {
      expect(score(password), password).toBeGreaterThanOrEqual(60);
      expect(score(password), password).toBeLessThan(80);
      expect(score(password.replaceAll(/[\s-]/g, '  ')), password).toBe(score(password));
    }
    expect(evaluatePassword(PASSPHRASE_LONG).category).toBe('Very Strong');
  });

  it('does not treat a random password with words appended as a phrase', () => {
    for (const password of [
      `${RANDOM_MIXED_16} velvet orbit`,
      `velvet orbit ${RANDOM_MIXED_16}`,
      `${RANDOM_MIXED_16}  velvet  orbit`,
    ]) {
      expect(evaluatePassword(password).category, password).toBe('Very Strong');
    }
  });

  it('still does not treat # as a separator', () => {
    // Were it one, Tiger and Lamp would read as a two-word phrase and cap the score at Fair.
    expect(score('Tiger#Lamp2019')).toBeGreaterThanOrEqual(60);
    expect(score('Tiger#Lamp2019')).toBeLessThan(80);
  });
});
