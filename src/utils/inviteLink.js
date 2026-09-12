import { normalizeInviteCode } from './inviteCode.js';

// Building the invite a friend actually receives.
//
// Originally the share button sent only the bare code, which left the recipient
// holding "PT-7Q2K-9XR4" and no idea where to put it — the admin had to send the
// app's address separately, ten times over. These build the link and the message
// around it.

/**
 * A link that opens the app with the code already filled in.
 *
 * @param code   the invite code, in any typed form
 * @param origin e.g. "https://varunhiremath.github.io" (no trailing slash)
 * @param base   the app's base path, e.g. "/pickletime/" or "/"
 * @returns the URL, or null if the code isn't valid
 */
export function buildJoinUrl(code, { origin = '', base = '/' } = {}) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;

  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanBase = base.startsWith('/') ? base : `/${base}`;
  const withSlash = cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`;

  return `${cleanOrigin}${withSlash}join?code=${encodeURIComponent(normalized)}`;
}

/**
 * How to keep the app, rather than losing it in a forest of browser tabs.
 *
 * This exists because of a real failure: friends opened the link, played, and
 * then could not find it again — a shared URL in a group chat scrolls away, and
 * nothing about a web app tells you it can be installed. Both platforms are
 * spelled out because neither prompts reliably, and iOS does not prompt at all.
 */
export const INSTALL_STEPS = [
  'Keep it on your phone:',
  '• iPhone: open in Safari → Share → Add to Home Screen',
  '• Android: open in Chrome → ⋮ → Add to Home screen',
];

/**
 * The message to send.
 *
 * Carries the raw code as well as the link on purpose: messaging apps mangle
 * links, and someone may read it on a laptop and join on a phone. A code they
 * can retype is the fallback that always works.
 */
export function buildInviteMessage({ clubName, memberName, url, code } = {}) {
  const normalized = normalizeInviteCode(code);
  const who = memberName?.trim();
  const club = clubName?.trim();

  const opener = who
    ? `${who} — you're on the roster${club ? ` for ${club}` : ''}.`
    : `You're invited${club ? ` to ${club}` : ''}.`;

  const lines = [`${opener} 🥒`];
  if (url) lines.push('', `Tap to join: ${url}`);
  if (normalized) {
    lines.push(url ? `(or enter code ${normalized} in the app)` : `Your code: ${normalized}`);
  }
  if (url) lines.push('', ...INSTALL_STEPS);
  return lines.join('\n');
}

/**
 * The message for somebody who has already joined and just needs the app again.
 *
 * Their invite code is spent — claim_invite refuses a second use — so sending it
 * again would be worse than useless. What they need is the address and how to
 * keep hold of it, which is exactly what the group-chat announcement does not
 * explain.
 *
 * @param url  the app's home address, NOT a join link
 */
export function buildAppLinkMessage({ clubName, memberName, url } = {}) {
  const who = memberName?.trim();
  const club = clubName?.trim();

  const opener = who
    ? `${who} — here's ${club ?? 'the club'} again 🥒`
    : `Here's ${club ?? 'the club'} again 🥒`;

  const lines = [opener];
  if (url) lines.push('', url, '', ...INSTALL_STEPS);
  lines.push('', "You're already on the roster, so it opens straight to the games.");
  return lines.join('\n');
}

/** Pull a code out of a join link's query string. Returns null if absent or junk. */
export function codeFromSearch(search) {
  if (!search) return null;
  try {
    return normalizeInviteCode(new URLSearchParams(search).get('code'));
  } catch {
    return null;
  }
}
