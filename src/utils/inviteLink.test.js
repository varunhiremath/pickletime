import { describe, it, expect } from 'vitest';
import { buildJoinUrl, buildInviteMessage, codeFromSearch } from './inviteLink.js';

const ORIGIN = 'https://varunhiremath.github.io';
const BASE = '/pickletime/';

describe('buildJoinUrl', () => {
  it('builds a link that carries the code', () => {
    expect(buildJoinUrl('PT-7Q2K-9XR4', { origin: ORIGIN, base: BASE })).toBe(
      'https://varunhiremath.github.io/pickletime/join?code=PT-7Q2K-9XR4'
    );
  });

  it('normalises a sloppily typed code before putting it in the link', () => {
    expect(buildJoinUrl('  pt 7q2k 9xr4 ', { origin: ORIGIN, base: BASE })).toContain(
      'code=PT-7Q2K-9XR4'
    );
  });

  it('works at the site root, as the APK WebView serves it', () => {
    expect(buildJoinUrl('PT-7Q2K-9XR4', { origin: ORIGIN, base: '/' })).toBe(
      'https://varunhiremath.github.io/join?code=PT-7Q2K-9XR4'
    );
  });

  it('tolerates a base without a trailing slash', () => {
    expect(buildJoinUrl('PT-7Q2K-9XR4', { origin: ORIGIN, base: '/pickletime' })).toBe(
      'https://varunhiremath.github.io/pickletime/join?code=PT-7Q2K-9XR4'
    );
  });

  it('tolerates an origin with a trailing slash', () => {
    expect(buildJoinUrl('PT-7Q2K-9XR4', { origin: `${ORIGIN}/`, base: BASE })).toBe(
      'https://varunhiremath.github.io/pickletime/join?code=PT-7Q2K-9XR4'
    );
  });

  it('is null for a code that could never work', () => {
    expect(buildJoinUrl('nope', { origin: ORIGIN, base: BASE })).toBeNull();
    expect(buildJoinUrl('', { origin: ORIGIN, base: BASE })).toBeNull();
    expect(buildJoinUrl(null, { origin: ORIGIN, base: BASE })).toBeNull();
  });

  it('round-trips through codeFromSearch', () => {
    const url = buildJoinUrl('PT-7Q2K-9XR4', { origin: ORIGIN, base: BASE });
    expect(codeFromSearch(new URL(url).search)).toBe('PT-7Q2K-9XR4');
  });
});

describe('buildInviteMessage', () => {
  const args = {
    clubName: 'Sunday Picklers',
    memberName: 'Priya',
    url: 'https://varunhiremath.github.io/pickletime/join?code=PT-7Q2K-9XR4',
    code: 'PT-7Q2K-9XR4',
  };

  it('names the person and the club', () => {
    const msg = buildInviteMessage(args);
    expect(msg).toContain('Priya');
    expect(msg).toContain('Sunday Picklers');
  });

  it('includes the link — the thing that was missing before', () => {
    expect(buildInviteMessage(args)).toContain(args.url);
  });

  it('includes the raw code as a fallback alongside the link', () => {
    // Messaging apps mangle links, and people read on one device and join on
    // another. A retypable code is the fallback that always works.
    expect(buildInviteMessage(args)).toContain('PT-7Q2K-9XR4');
  });

  it('still reads sensibly with no link', () => {
    const msg = buildInviteMessage({ ...args, url: null });
    expect(msg).toContain('Your code: PT-7Q2K-9XR4');
    expect(msg).not.toContain('Tap to join');
  });

  it('falls back gracefully with no member name', () => {
    const msg = buildInviteMessage({ ...args, memberName: '' });
    expect(msg).toContain("You're invited to Sunday Picklers");
  });

  it('falls back gracefully with no club name', () => {
    const msg = buildInviteMessage({ ...args, clubName: '' });
    expect(msg).toContain("Priya — you're on the roster.");
  });

  it('normalises the code it prints', () => {
    expect(buildInviteMessage({ ...args, code: 'pt7q2k9xr4' })).toContain('PT-7Q2K-9XR4');
  });
});

describe('codeFromSearch', () => {
  it('reads a code from a query string', () => {
    expect(codeFromSearch('?code=PT-7Q2K-9XR4')).toBe('PT-7Q2K-9XR4');
  });

  it('normalises what it finds', () => {
    expect(codeFromSearch('?code=pt7q2k9xr4')).toBe('PT-7Q2K-9XR4');
  });

  it('ignores other parameters', () => {
    expect(codeFromSearch('?utm=x&code=PT-7Q2K-9XR4&y=1')).toBe('PT-7Q2K-9XR4');
  });

  it('is null when there is no code', () => {
    expect(codeFromSearch('?other=1')).toBeNull();
    expect(codeFromSearch('')).toBeNull();
    expect(codeFromSearch(null)).toBeNull();
  });

  it('is null for a malformed code rather than passing junk to the server', () => {
    expect(codeFromSearch('?code=hello')).toBeNull();
  });
});
