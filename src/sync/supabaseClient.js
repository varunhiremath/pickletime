import { createClient } from '@supabase/supabase-js';

// The Supabase connection.
//
// Both values are compiled into the bundle at build time. That is fine for the
// anon key — it is designed to be public, and row-level security
// (supabase/policies.sql) is what actually protects the data. The service_role
// key must never appear here or anywhere else in this repo.

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * The dashboard address is not the API address, and pasting the former is the
 * easy mistake — it is what's in the browser bar when you go looking for the
 * key. It happened once in this project's own deploy: the build succeeded, the
 * app loaded, and it silently reached nothing.
 *
 * The project ref is right there in the dashboard URL, so the mistake is
 * detectable. Report it loudly rather than spending an afternoon wondering why
 * scores aren't syncing.
 */
export function describeUrlProblem(value) {
  if (!value) return null;
  const dashboard = value.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dashboard) {
    return (
      `VITE_SUPABASE_URL is the dashboard address, not the API address. ` +
      `Use https://${dashboard[1]}.supabase.co instead.`
    );
  }
  if (!/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(value)) {
    return `VITE_SUPABASE_URL should be a bare host like https://<project-ref>.supabase.co (got "${value}").`;
  }
  return null;
}

export const urlProblem = describeUrlProblem(rawUrl);
const url = urlProblem ? null : rawUrl;

if (urlProblem) {
  // Surfaced in the UI too (see components/layout/ServerNotice.jsx); logging it
  // means it is also findable in a phone's remote console.
  console.error(`[PickleTime] ${urlProblem}`);
}

/** True when a *usable* server is configured. False → the app runs single-device. */
export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export const supabase = isSupabaseConfigured()
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The session lives in localStorage under this key, so a phone stays
        // signed in across app restarts and never re-prompts for a code.
        storageKey: 'pickletime_auth',
      },
      realtime: {
        // A handful of friends scoring games — no need for the default rate.
        params: { eventsPerSecond: 5 },
      },
    })
  : null;

/** Reject after `ms`, so a hanging network call can't hold up the whole boot. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}

// How long to wait for sign-in before giving up and opening on cached data.
//
// This is not arbitrary. auth-js retries a failed sign-in several times with
// backoff, so an unreachable project takes ~13 seconds to fail on its own —
// measured, not guessed. Thirteen seconds of splash screen on a court with bad
// signal is indistinguishable from a broken app, and the cached data we would
// show instead is already sitting in IndexedDB.
const SIGN_IN_TIMEOUT_MS = 5000;

/**
 * Make sure this device has an identity.
 *
 * Anonymous sign-in gives every phone a real `auth.uid()` with no email, no
 * password and nothing to forget — which is what lets the permission rules in
 * policies.sql be genuine rather than decorative.
 *
 * Returns the user, or null if there is no server configured. Throws on failure;
 * callers are expected to fall back to cached data rather than propagate.
 */
export async function ensureSignedIn() {
  if (!supabase) return null;

  const { data: existing } = await supabase.auth
    .getSession()
    .catch(() => ({ data: null }));
  if (existing?.session?.user) return existing.session.user;

  const { data, error } = await withTimeout(
    supabase.auth.signInAnonymously(),
    SIGN_IN_TIMEOUT_MS,
    'Sign-in'
  ).catch((err) => ({ data: null, error: err }));

  if (error) {
    // Anonymous sign-in being switched off in the dashboard is by far the most
    // common cause on a new project, and a bare 422 sends people hunting in the
    // wrong place.
    const disabled = /anonymous/i.test(error.message ?? '');
    throw new Error(
      disabled
        ? 'Anonymous sign-ins are disabled for this project. Enable them under ' +
          'Authentication → Sign In / Providers (see docs/SETUP_SUPABASE.md).'
        : `Could not sign in to the server. [${error.message}]`
    );
  }
  return data.user;
}

/** Current auth user id, or null. */
export async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
}
