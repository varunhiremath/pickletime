import { describe, it, expect } from 'vitest';
import { resolveDeepLink } from './deepLink.js';

// Regression guard for a bug that was live on the deployed site.
//
// The restoration ran in main.jsx's body, which executes AFTER its imports —
// so createBrowserRouter had already snapshotted the un-restored URL and every
// deep link landed on the default page. Verified in a browser: an invite link
// arriving via the Pages 404 bounce ended up on /today with the code lost.

const BASE = '/pickletime/';

describe('resolveDeepLink', () => {
  it('restores a plain path', () => {
    expect(resolveDeepLink('?redirect=standings', BASE)).toBe('/pickletime/standings');
  });

  it('restores a path that carries its own query string', () => {
    // The invite-link case: /join?code=PT-7Q2K-9XR4
    expect(resolveDeepLink(`?redirect=${encodeURIComponent('join?code=PT-7Q2K-9XR4')}`, BASE)).toBe(
      '/pickletime/join?code=PT-7Q2K-9XR4'
    );
  });

  it('restores a nested path', () => {
    expect(resolveDeepLink(`?redirect=${encodeURIComponent('players/abc-123')}`, BASE)).toBe(
      '/pickletime/players/abc-123'
    );
  });

  it('keeps a hash fragment', () => {
    expect(resolveDeepLink(`?redirect=${encodeURIComponent('matches#round-2')}`, BASE)).toBe(
      '/pickletime/matches#round-2'
    );
  });

  it('works at the site root, as the APK WebView serves it', () => {
    expect(resolveDeepLink('?redirect=standings', '/')).toBe('/standings');
  });

  it('tolerates a leading slash on the redirect value', () => {
    expect(resolveDeepLink('?redirect=%2Fstandings', BASE)).toBe('/pickletime/standings');
  });

  it('is null when there is nothing to restore', () => {
    expect(resolveDeepLink('', BASE)).toBeNull();
    expect(resolveDeepLink('?other=1', BASE)).toBeNull();
    expect(resolveDeepLink(null, BASE)).toBeNull();
  });

  describe('refuses to become an open redirect', () => {
    // `redirect` is just a query parameter, so anyone can craft one. It must
    // only ever resolve to a path on this origin.
    it('rejects an absolute URL', () => {
      expect(resolveDeepLink(`?redirect=${encodeURIComponent('https://evil.example')}`, BASE)).toBeNull();
    });

    it('rejects a protocol-relative URL', () => {
      expect(resolveDeepLink(`?redirect=${encodeURIComponent('//evil.example')}`, BASE)).toBeNull();
    });

    it('rejects a javascript: URL', () => {
      expect(resolveDeepLink(`?redirect=${encodeURIComponent('javascript:alert(1)')}`, BASE)).toBeNull();
    });
  });
});
