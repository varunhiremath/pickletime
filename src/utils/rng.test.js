import { describe, it, expect } from 'vitest';
import { mulberry32, seedFromString, randomSeed, shuffle } from './rng.js';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const one = mulberry32(1);
    const two = mulberry32(2);
    const a = Array.from({ length: 10 }, () => one());
    const b = Array.from({ length: 10 }, () => two());
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is reasonably uniform across ten buckets', () => {
    const rng = mulberry32(7);
    const buckets = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++;
    // Each bucket should hold roughly n/10; allow a generous 40% band so this
    // asserts "not obviously broken" rather than testing the PRNG's pedigree.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 * 0.6);
      expect(count).toBeLessThan(n / 10 * 1.4);
    }
  });
});

describe('seedFromString', () => {
  it('is stable for the same string', () => {
    expect(seedFromString('pickle')).toBe(seedFromString('pickle'));
  });

  it('differs for different strings', () => {
    expect(seedFromString('pickle')).not.toBe(seedFromString('pickled'));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'saturday-morning', '🥒']) {
      const v = seedFromString(s);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('randomSeed', () => {
  it('returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 50; i++) {
      const v = randomSeed();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('shuffle', () => {
  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    shuffle(input, mulberry32(1));
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves every element', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, mulberry32(42));
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('is deterministic for a given seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffle(input, mulberry32(9))).toEqual(shuffle(input, mulberry32(9)));
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['x'], mulberry32(1))).toEqual(['x']);
  });
});
