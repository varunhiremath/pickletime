import { describe, it, expect } from 'vitest';
import { parseHex, luminance, contrastRatio, meetsAA, readableTextOn } from './contrast.js';

describe('parseHex', () => {
  it('parses six-digit hex', () => {
    expect(parseHex('#FF8000')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('expands three-digit shorthand', () => {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('tolerates a missing hash and surrounding space', () => {
    expect(parseHex('  00ff00 ')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('returns null for junk', () => {
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('')).toBeNull();
  });
});

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('orders colours sensibly', () => {
    expect(luminance('#FFFFFF')).toBeGreaterThan(luminance('#808080'));
    expect(luminance('#808080')).toBeGreaterThan(luminance('#000000'));
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1 for identical colours', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0B1220', '#D7F205')).toBeCloseTo(contrastRatio('#D7F205', '#0B1220'), 5);
  });

  it('returns null when a colour cannot be parsed', () => {
    expect(contrastRatio('nope', '#FFFFFF')).toBeNull();
  });
});

describe('meetsAA', () => {
  it('passes black on white', () => {
    expect(meetsAA('#000000', '#FFFFFF')).toBe(true);
  });

  it('fails white on the optic yellow — the pairing the rule forbids', () => {
    expect(meetsAA('#FFFFFF', '#D7F205')).toBe(false);
  });

  it('passes near-black on the optic yellow — the pairing the rule requires', () => {
    expect(meetsAA('#0B1220', '#D7F205')).toBe(true);
  });

  it('applies the relaxed threshold for large text', () => {
    // A pairing between the two thresholds passes as large but not as normal.
    const fg = '#767676';
    const bg = '#FFFFFF';
    expect(meetsAA(fg, bg, { large: true })).toBe(true);
    expect(contrastRatio(fg, bg)).toBeGreaterThan(3);
  });
});

describe('readableTextOn', () => {
  it('picks dark text on a light background', () => {
    expect(readableTextOn('#D7F205')).toBe('#0B1220');
  });

  it('picks light text on a dark background', () => {
    expect(readableTextOn('#0B1220')).toBe('#F1F5F9');
  });

  it('gives every player avatar colour a readable label', () => {
    const players = ['#1B9AAA', '#FF5C39', '#A78BFA', '#34D399', '#F472B6', '#FBBF24', '#60A5FA', '#FB923C'];
    for (const bg of players) {
      const fg = readableTextOn(bg);
      // Avatar initials are large, bold text — the AA-large threshold applies.
      expect(meetsAA(fg, bg, { large: true })).toBe(true);
    }
  });
});
