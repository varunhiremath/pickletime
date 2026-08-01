import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  generateInviteCode,
  format,
  normalizeInviteCode,
  isValidInviteCode,
} from './inviteCode.js';

// Deterministic byte source so generated codes are predictable in tests.
const bytesFrom = (...values) => (n) => Uint8Array.from({ length: n }, (_, i) => values[i % values.length]);

describe('ALPHABET', () => {
  it('excludes the glyphs people misread', () => {
    for (const ch of ['I', 'L', 'O', 'U']) {
      expect(ALPHABET).not.toContain(ch);
    }
  });

  it('is 32 distinct characters', () => {
    expect(ALPHABET).toHaveLength(32);
    expect(new Set(ALPHABET).size).toBe(32);
  });
});

describe('generateInviteCode', () => {
  it('produces the PT-XXXX-XXXX shape', () => {
    expect(generateInviteCode()).toMatch(/^PT-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('only uses characters from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const body = generateInviteCode().replace(/^PT-/, '').replace('-', '');
      expect([...body].every((ch) => ALPHABET.includes(ch))).toBe(true);
    }
  });

  it('is driven entirely by the byte source', () => {
    const code = generateInviteCode(bytesFrom(0));
    expect(code).toBe('PT-0000-0000');
  });

  it('maps bytes through the alphabet by modulo', () => {
    // index 1 → '1', index 2 → '2'
    expect(generateInviteCode(bytesFrom(1, 2))).toBe('PT-1212-1212');
  });

  it('generates different codes across calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    // 32^8 keyspace — 200 draws colliding would signal a broken random source.
    expect(codes.size).toBe(200);
  });
});

describe('format', () => {
  it('groups a bare body into the display form', () => {
    expect(format('7Q2K9XR4')).toBe('PT-7Q2K-9XR4');
  });

  it('uppercases and strips punctuation', () => {
    expect(format('7q2k-9xr4')).toBe('PT-7Q2K-9XR4');
  });
});

describe('normalizeInviteCode', () => {
  it('accepts the canonical form unchanged', () => {
    expect(normalizeInviteCode('PT-7Q2K-9XR4')).toBe('PT-7Q2K-9XR4');
  });

  it('is case-insensitive', () => {
    expect(normalizeInviteCode('pt-7q2k-9xr4')).toBe('PT-7Q2K-9XR4');
  });

  it('ignores spaces and dashes anywhere', () => {
    expect(normalizeInviteCode('  PT 7Q2K 9XR4 ')).toBe('PT-7Q2K-9XR4');
    expect(normalizeInviteCode('PT7Q2K9XR4')).toBe('PT-7Q2K-9XR4');
  });

  it('works without the PT prefix', () => {
    expect(normalizeInviteCode('7Q2K9XR4')).toBe('PT-7Q2K-9XR4');
  });

  it('repairs the ambiguous glyphs', () => {
    // I and L read as 1, O reads as 0, U reads as V.
    expect(normalizeInviteCode('PT-I23L-O56U')).toBe('PT-1231-056V');
  });

  it('rejects the wrong length', () => {
    expect(normalizeInviteCode('PT-7Q2K-9XR')).toBeNull();
    expect(normalizeInviteCode('PT-7Q2K-9XR45')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });

  it('rejects characters outside the alphabet', () => {
    expect(normalizeInviteCode('PT-7Q2K-9XR!')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeInviteCode(null)).toBeNull();
    expect(normalizeInviteCode(12345678)).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
  });

  it('round-trips every generated code', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      expect(normalizeInviteCode(code)).toBe(code);
    }
  });
});

describe('isValidInviteCode', () => {
  it('agrees with normalize', () => {
    expect(isValidInviteCode('pt 7q2k 9xr4')).toBe(true);
    expect(isValidInviteCode('nope')).toBe(false);
  });
});
