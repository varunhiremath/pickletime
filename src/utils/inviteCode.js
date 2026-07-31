// Admin-issued personal invite codes.
//
// The admin mints one code per friend and sends it to them directly. The server
// only ever stores the SHA-256 hash (see supabase/functions.sql), so reading the
// invites table never reveals an unclaimed code.
//
// Alphabet is Crockford base32 minus the ambiguous glyphs: no I, L, O or U, so
// nobody has to guess whether that's a 1 or an l when reading a code off a phone
// screen. Codes are grouped as PT-XXXX-XXXX for legibility.

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PREFIX = 'PT';
const BODY_LENGTH = 8;

// Crockford's canonical confusions, applied on input so a friend who types
// "PT-I234-O567" still gets in.
const SUBSTITUTIONS = { I: '1', L: '1', O: '0', U: 'V' };

/**
 * Mint a code. Pass a random source for tests; defaults to crypto.
 * Returns the display form, e.g. "PT-7Q2K-9XR4".
 */
export function generateInviteCode(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(BODY_LENGTH);
  let body = '';
  for (let i = 0; i < BODY_LENGTH; i++) {
    body += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return format(body);
}

function defaultRandomBytes(n) {
  const out = new Uint8Array(n);
  // crypto.getRandomValues exists in browsers and in Node 19+.
  crypto.getRandomValues(out);
  return out;
}

/** "7Q2K9XR4" → "PT-7Q2K-9XR4" */
export function format(body) {
  const clean = body.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return `${PREFIX}-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Normalise anything a human might type into the canonical display form.
 * Case-insensitive, ignores spaces/dashes, fixes ambiguous glyphs, and tolerates
 * the PT prefix being present or absent.
 * Returns null if it isn't a plausible code.
 */
export function normalizeInviteCode(input) {
  if (typeof input !== 'string') return null;

  let s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length);
  s = s.replace(/[ILOU]/g, (ch) => SUBSTITUTIONS[ch]);

  if (s.length !== BODY_LENGTH) return null;
  if (![...s].every((ch) => ALPHABET.includes(ch))) return null;

  return format(s);
}

export function isValidInviteCode(input) {
  return normalizeInviteCode(input) !== null;
}

/**
 * SHA-256 of the *normalised* code, lowercase hex. The client hashes before
 * sending, and the server compares hashes, so a raw code never reaches storage.
 */
export async function hashInviteCode(input) {
  const normalized = normalizeInviteCode(input);
  if (!normalized) throw new Error('Invalid invite code');
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
