import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_SETS,
  LENGTH,
  SET_KEYS,
  generatePassword,
  randomInt,
} from '../../src/ui/generator.js';

const containsOnly = (password, sets) => {
  const allowed = new Set(sets.flatMap((key) => [...CHARACTER_SETS[key]]));
  return [...password].every((char) => allowed.has(char));
};

const containsAnyOf = (password, key) =>
  [...password].some((char) => CHARACTER_SETS[key].includes(char));

describe('randomInt', () => {
  it('uses the Web Crypto API rather than Math.random', () => {
    const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const mathSpy = vi.spyOn(Math, 'random');

    randomInt(10);

    expect(cryptoSpy).toHaveBeenCalled();
    expect(mathSpy).not.toHaveBeenCalled();

    cryptoSpy.mockRestore();
    mathSpy.mockRestore();
  });

  it('stays inside the requested range', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = randomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('rejects an invalid bound', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
  });
});

describe('generatePassword', () => {
  it('returns a password of the requested length', () => {
    for (const length of [LENGTH.min, 16, LENGTH.max]) {
      expect(generatePassword({ length, sets: [...SET_KEYS] })).toHaveLength(length);
    }
  });

  it('uses only characters from the selected sets', () => {
    const cases = [
      ['lowercase'],
      ['lowercase', 'numbers'],
      ['uppercase', 'symbols'],
      [...SET_KEYS],
    ];

    for (const sets of cases) {
      for (let i = 0; i < 25; i += 1) {
        expect(containsOnly(generatePassword({ length: 16, sets }), sets)).toBe(true);
      }
    }
  });

  it('includes at least one character from every selected set', () => {
    for (let i = 0; i < 25; i += 1) {
      const password = generatePassword({ length: LENGTH.min, sets: [...SET_KEYS] });
      for (const key of SET_KEYS) {
        expect(containsAnyOf(password, key)).toBe(true);
      }
    }
  });

  it('produces a different password each time', () => {
    const values = new Set(
      Array.from({ length: 20 }, () => generatePassword({ length: 16, sets: [...SET_KEYS] })),
    );
    expect(values.size).toBe(20);
  });

  it('rejects an empty set selection', () => {
    expect(() => generatePassword({ length: 16, sets: [] })).toThrow(RangeError);
  });

  it('rejects an unknown set', () => {
    expect(() => generatePassword({ length: 16, sets: ['emoji'] })).toThrow(RangeError);
  });

  it('rejects a length outside the supported bounds', () => {
    expect(() => generatePassword({ length: LENGTH.min - 1, sets: ['lowercase'] })).toThrow(
      RangeError,
    );
    expect(() => generatePassword({ length: LENGTH.max + 1, sets: ['lowercase'] })).toThrow(
      RangeError,
    );
  });
});
