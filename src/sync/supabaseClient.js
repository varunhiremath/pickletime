import { createClient } from '@supabase/supabase-js';

// The Supabase connection.
//
// Both values are compiled into the bundle at build time. That is fine for the
// anon key — it is designed to be public, and row-level security
// (supabase/policies.sql) is what actually protects the data. The service_role
// key must never appear here or anywhere else in this repo.

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** True when a server is configured. False → the app runs single-device. */
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

/**
 * Make sure this device has an identity.
 *
 * Anonymous sign-in gives every phone a real `auth.uid()` with no email, no
 * password and nothing to forget — which is what lets the permission rules in
 * policies.sql be genuine rather than decorative.
 *
 * Returns the user, or null if there is no server configured.
 */
export async function ensureSignedIn() {
  if (!supabase) return null;

  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session?.user) return existing.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // The overwhelmingly common cause is anonymous sign-in being switched off
    // in the dashboard, so say that rather than surfacing a bare 422.
    throw new Error(
      `Could not sign in to the server. If this is a new project, check that ` +
        `Anonymous Sign-Ins are enabled (see docs/SETUP_SUPABASE.md). [${error.message}]`
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
