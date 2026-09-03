// GitHub Pages has no SPA rewrite, so a deep link like /pickletime/standings
// gets served public/404.html, which bounces to the app root carrying the
// intended path in ?redirect=. This puts it back.
//
// TIMING IS THE WHOLE POINT. createBrowserRouter() reads window.location once,
// when router.jsx is evaluated. ES module imports are evaluated before the
// importing module's body, so doing this in main.jsx's body ran it *after* the
// router had already snapshotted the wrong URL — every deep link silently landed
// on the default page instead. It must run before createBrowserRouter, which is
// why router.jsx calls it at the top rather than main.jsx.

/**
 * Work out the URL a ?redirect= bounce was really asking for.
 * Returns null when there is nothing to restore.
 */
export function resolveDeepLink(search, base = '/') {
  if (!search) return null;

  let redirect;
  try {
    redirect = new URLSearchParams(search).get('redirect');
  } catch {
    return null;
  }
  if (!redirect) return null;

  // Only ever produce a path on this origin. A redirect value is attacker-
  // supplied in principle — it is just a query parameter — so "//evil.example"
  // or "https://evil.example" must not survive.
  //
  // The check runs on the RAW value, before slashes are stripped: normalising
  // first turns "//evil.example" into "evil.example", which then passes a
  // leading-slash test that was supposed to catch it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(redirect) || redirect.startsWith('//')) return null;

  const prefix = base.replace(/\/+$/, '');
  return `${prefix}/${redirect.replace(/^\/+/, '')}`;
}

/** Apply the restoration to browser history. No-op outside a browser. */
export function restoreDeepLink() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const target = resolveDeepLink(window.location.search, import.meta.env.BASE_URL ?? '/');
  if (target) window.history.replaceState(null, '', target);
}
