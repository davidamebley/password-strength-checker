import { describe, expect, it } from 'vitest';
import {
  findCommonPassword,
  findKeyboardPatterns,
  findRepeatedBlocks,
  findRepeatedCharacters,
  findSequences,
  getSubstitutionVariants,
  getUniquenessRatio,
  splitPredictableSuffix,
} from '../../src/scoring/detectors.js';

// Inputs that should never trigger a pattern detector.
const CLEAN = ['velvet orbit maple tundra', 'k7#Qv9!mZ2@wL4$x'];

const expectNoMatches = (detector, inputs) => {
  for (const input of inputs) {
    expect(detector(input), JSON.stringify(input)).toEqual([]);
  }
};

describe('getSubstitutionVariants', () => {
  it('undoes predictable substitutions', () => {
    const cases = [
      ['P@ssw0rd', 'password'],
      ['p4$$w0rd', 'password'],
      ['Pa55word', 'password'],
      ['l3tm3in', 'letmein'],
      ['1loveyou', 'iloveyou'],
      ['he11o', 'hello'],
      ['7rustno1', 'trustno1'],
    ];
    for (const [input, expected] of cases) {
      expect(getSubstitutionVariants(input), input).toContain(expected);
    }
  });

  it('always includes the plain lowercase form', () => {
    expect(getSubstitutionVariants('Maple')).toEqual(['maple']);
    expect(getSubstitutionVariants('B4con')).toContain('b4con');
  });

  it('keeps the number of variants bounded', () => {
    expect(getSubstitutionVariants('1'.repeat(40)).length).toBeLessThanOrEqual(64);
  });
});

describe('splitPredictableSuffix', () => {
  it('splits trailing digits, years, and symbols', () => {
    const cases = [
      ['Password1!', 'Password', '1!'],
      ['qwerty2026', 'qwerty', '2026'],
      ['P@ssw0rd123!', 'P@ssw0rd', '123!'],
      ['summer!!', 'summer', '!!'],
      ['password12345', 'password', '12345'],
      ['dragon!2024', 'dragon', '!2024'],
    ];
    for (const [input, base, suffix] of cases) {
      expect(splitPredictableSuffix(input), input).toEqual({ base, suffix });
    }
  });

  it('returns an empty suffix when there is none or it would consume the whole password', () => {
    for (const input of ['password', ...CLEAN, '123456', '!!!!']) {
      expect(splitPredictableSuffix(input), input).toEqual({ base: input, suffix: '' });
    }
  });
});

describe('findCommonPassword', () => {
  it('matches exact, case, substitution, and suffixed variants', () => {
    const cases = [
      ['password', 'password', 'exact', ''],
      ['123456', '123456', 'exact', ''],
      ['PASSWORD', 'password', 'case-insensitive', ''],
      ['P@ssw0rd', 'password', 'substitution', ''],
      ['Password1!', 'password', 'case-insensitive', '1!'],
      ['P@ssw0rd123!', 'password', 'substitution', '123!'],
      ['qwerty2026', 'qwerty', 'exact', '2026'],
    ];
    for (const [input, base, variant, suffix] of cases) {
      expect(findCommonPassword(input), input).toEqual({ base, variant, suffix });
    }
  });

  it('returns null for passwords not on the list', () => {
    for (const input of ['', ...CLEAN, 'Coffee2026', 'xk9password']) {
      expect(findCommonPassword(input), input).toBeNull();
    }
  });
});

describe('findSequences', () => {
  it('finds ascending and descending sequences of digits or letters', () => {
    const cases = [
      ['123456', 'numeric', 'ascending'],
      ['654321', 'numeric', 'descending'],
      ['abcdef', 'alphabetic', 'ascending'],
      ['ZYXw', 'alphabetic', 'descending'],
    ];
    for (const [input, kind, direction] of cases) {
      expect(findSequences(input), input).toEqual([{ kind, direction, token: input, start: 0 }]);
    }
  });

  it('finds several embedded sequences with positions', () => {
    expect(findSequences('abc123xyz').map(({ token, start }) => [token, start])).toEqual([
      ['abc', 0],
      ['123', 3],
      ['xyz', 6],
    ]);
  });

  it('ignores runs shorter than three and non-consecutive steps', () => {
    expectNoMatches(findSequences, ['ab', '12', '135', 'a1b2c3', ...CLEAN]);
  });
});

describe('findKeyboardPatterns', () => {
  it('finds horizontal QWERTY runs in either direction', () => {
    const cases = [
      ['qwerty', 'qwerty', 0],
      ['ASDFGH', 'ASDFGH', 0],
      ['zxcvbn', 'zxcvbn', 0],
      ['poiuy', 'poiuy', 0],
      ['qwerty2026', 'qwerty', 0],
      ['my-asdf-key', 'asdf', 3],
    ];
    for (const [input, token, start] of cases) {
      expect(findKeyboardPatterns(input), input).toEqual([{ token, start }]);
    }
  });

  it('ignores short runs and ordinary words', () => {
    expectNoMatches(findKeyboardPatterns, ['qwe', 'typewriter', ...CLEAN]);
  });
});

describe('findRepeatedCharacters', () => {
  it('finds runs of three or more identical characters', () => {
    expect(findRepeatedCharacters('aaaaaaaaaaaa')).toEqual([
      { char: 'a', token: 'aaaaaaaaaaaa', start: 0, length: 12 },
    ]);
    expect(findRepeatedCharacters('baaab')).toEqual([
      { char: 'a', token: 'aaa', start: 1, length: 3 },
    ]);
    expect(findRepeatedCharacters('    ')).toEqual([
      { char: ' ', token: '    ', start: 0, length: 4 },
    ]);
  });

  it('ignores doubled letters', () => {
    expectNoMatches(findRepeatedCharacters, ['hello', 'aabbcc', ...CLEAN]);
  });
});

describe('findRepeatedBlocks', () => {
  it('finds back-to-back repeated blocks using the shortest unit', () => {
    const cases = [
      ['abcabcabc', [{ block: 'abc', token: 'abcabcabc', count: 3, start: 0 }]],
      ['passwordpassword', [{ block: 'password', token: 'passwordpassword', count: 2, start: 0 }]],
      ['abababab', [{ block: 'ab', token: 'abababab', count: 4, start: 0 }]],
      [
        'abcabc123123',
        [
          { block: 'abc', token: 'abcabc', count: 2, start: 0 },
          { block: '123', token: '123123', count: 2, start: 6 },
        ],
      ],
    ];
    for (const [input, expected] of cases) {
      expect(findRepeatedBlocks(input), input).toEqual(expected);
    }
  });

  it('leaves single-character runs and non-repeating text alone', () => {
    expectNoMatches(findRepeatedBlocks, ['aaaaaa', 'abcdef', ...CLEAN]);
  });
});

describe('getUniquenessRatio', () => {
  it('returns distinct characters divided by length', () => {
    const cases = [
      ['', 0],
      ['aaaa', 0.25],
      ['aabb', 0.5],
      ['abcd', 1],
      ['\u{1F600}\u{1F600}', 0.5],
    ];
    for (const [input, ratio] of cases) {
      expect(getUniquenessRatio(input), JSON.stringify(input)).toBeCloseTo(ratio);
    }
  });
});
