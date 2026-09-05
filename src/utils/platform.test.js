import { describe, it, expect } from 'vitest';
import { isIos, isStandalone, shouldOfferIosInstall } from './platform.js';

// Real strings, so the test fails if a rewrite breaks against actual devices.
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OS13 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('isIos', () => {
  it('recognises an iPhone', () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true);
  });

  it('recognises an iPad, which claims to be a Mac since iPadOS 13', () => {
    expect(isIos({ userAgent: IPAD_OS13, maxTouchPoints: 5 })).toBe(true);
  });

  it('does not mistake a real Mac for one', () => {
    // Same user agent as the iPad; only the touch points differ.
    expect(isIos({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
  });

  it('is false for Android', () => {
    expect(isIos({ userAgent: ANDROID })).toBe(false);
  });

  it('copes with nothing at all', () => {
    expect(isIos()).toBe(false);
    expect(isIos({})).toBe(false);
  });
});

describe('isStandalone', () => {
  it('reads the iOS flag', () => {
    expect(isStandalone({ standalone: true })).toBe(true);
  });

  it('reads the display-mode media query', () => {
    expect(isStandalone({ displayMode: true })).toBe(true);
  });

  it('is false in a browser tab', () => {
    expect(isStandalone({ standalone: false, displayMode: false })).toBe(false);
    expect(isStandalone()).toBe(false);
  });
});

describe('shouldOfferIosInstall', () => {
  it('offers on an iPhone in Safari', () => {
    expect(shouldOfferIosInstall({ userAgent: IPHONE })).toBe(true);
  });

  it('stays quiet once installed', () => {
    expect(shouldOfferIosInstall({ userAgent: IPHONE, standalone: true })).toBe(false);
  });

  it('stays quiet on Android, which has its own install prompt', () => {
    expect(shouldOfferIosInstall({ userAgent: ANDROID })).toBe(false);
  });
});
