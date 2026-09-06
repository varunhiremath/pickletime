// The message you post to the group chat so everyone knows when to turn up and
// who they're opening against.
//
// The app has no push notifications — a static site can't send them — so this is
// how people actually find out a session exists. See docs/ROADMAP.md.
//
// All pure, so the formatting is tested rather than eyeballed.

import { resolveBracket } from './bracket.js';
import { bracketTreeLines } from './bracketTree.js';
import { sessionEntrants } from './entrants.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-08-09" → "Sun 9 Aug".
 *
 * Built from UTC parts on purpose. A date-only string fed to `new Date()` is
 * parsed as UTC midnight but formatted in local time, so anyone west of
 * Greenwich sees the day before — the classic off-by-one that would tell half
 * the club to show up on Saturday.
 */
export function formatSessionDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const dt = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC silently rolls 2026-02-31 into March, so confirm it survived intact.
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;

  return `${DAYS[dt.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

/** "09:00" → "9:00 am". Returns null for anything unparseable. */
export function formatSessionTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;

  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;

  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** How a format is named wherever it is shown. Exported so there is one list. */
export const FORMAT_LABEL = {
  singles: 'Singles round robin',
  doubles_americano: 'Doubles · Americano',
  doubles_pairs: 'Doubles · Fixed pairs',
};

/** The format's name, falling back to the raw value rather than to a guess. */
export const formatLabel = (format) => FORMAT_LABEL[format] ?? format ?? '';

/**
 * The caption that travels with a shared picture.
 *
 * Deliberately two lines. The card already shows the teams, the scores and the
 * table, so repeating them here would be noise in the chat — but a picture
 * cannot carry a tappable link, and that is the whole job of this text.
 *
 * @param session   the session row
 * @param url       link to the app
 * @param headline  optional extra first-line detail, e.g. who won
 * @param icon      the emoji to lead with
 * @param linkLabel what the link is for
 */
function caption({ session, url, headline, icon, linkLabel }) {
  if (!session) return '';

  const when = [formatSessionDate(session.date), formatSessionTime(session.startTime)]
    .filter(Boolean)
    .join(', ');

  const lines = [`${icon} ${session.name}${when ? ` — ${when}` : ''}`];
  if (headline) lines.push(headline);
  if (url) lines.push('', `${linkLabel}: ${url}`);
  return lines.join('\n');
}

/** Caption for the results picture. `champion` is a name, when there is one. */
export function buildResultsCaption({ session, url, champion } = {}) {
  return caption({
    session,
    url,
    // 🥇 rather than a second 🏆: the trophy is already the session's icon on
    // the line above, and repeating it makes the two lines read as one thing.
    headline: champion ? `🥇 ${champion}` : null,
    icon: '🏆',
    linkLabel: 'Full results',
  });
}

/** Caption for the session announcement picture. */
export function buildSessionCaption({ session, url } = {}) {
  const a = announcement({ session });
  return caption({
    session,
    url,
    headline: a?.details?.length ? a.details.join(' · ') : null,
    icon: '🥒',
    linkLabel: 'Full schedule',
  });
}

/**
 * Everything an announcement says, as data.
 *
 * Extracted so the message and the picture (utils/sessionImage.js) are two
 * renderings of one derivation. When they each worked it out for themselves
 * they could disagree, and a chat with a picture saying one thing and a caption
 * saying another is worse than either alone.
 *
 * @returns {{
 *   name, when, details: string[], teams: string[][],
 *   round1: {court, teamA, teamB}[], multiCourt, byes: string[], playing
 * }}
 */
export function announcement({ session, games = [] } = {}) {
  if (!session) return null;

  const when = [formatSessionDate(session.date), formatSessionTime(session.startTime)]
    .filter(Boolean)
    .join(', ');

  const details = [formatLabel(session.format)];
  if (session.format !== 'singles' && session.numGames) {
    // Four players in fixed pairs is two teams and therefore one game, which
    // read as "1 games".
    details.push(`${session.numGames} game${session.numGames === 1 ? '' : 's'}`);
  }
  if (session.pointsTo) details.push(`to ${session.pointsTo}`);

  // Round 1 only. Later rounds depend on who is still rotating, and a wall of
  // fixtures in a group chat is not read by anyone.
  const round1 = games
    .filter((g) => g.round === (games[0]?.round ?? 1))
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((g) => ({ court: g.court, teamA: g.teamA ?? [], teamB: g.teamB ?? [] }));

  const teams = [];
  if (session.format === 'doubles_pairs') {
    const seen = new Map();
    for (const g of games) {
      for (const side of [g.teamA, g.teamB]) {
        if (side?.length !== 2) continue;
        const key = [...side].sort().join('+');
        if (!seen.has(key)) seen.set(key, side);
      }
    }
    teams.push(...seen.values());
  }

  return {
    name: session.name,
    when,
    details,
    teams,
    round1,
    multiCourt: (session.courts ?? 1) > 1,
    byes: games.filter((g) => g.round === (games[0]?.round ?? 1))[0]?.byes ?? [],
    playing: session.playerIds?.length ?? 0,
  };
}

/**
 * Build the announcement message.
 *
 * @param session  the session row
 * @param games    its games (only round 1 is listed — the rest rotates anyway)
 * @param members  the club roster, for names
 * @param url      link to the app
 */
export function buildSessionShare({ session, games = [], members = [], url } = {}) {
  const a = announcement({ session, games });
  if (!a) return '';

  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '—';
  const namesOf = (ids) => (ids ?? []).map(nameOf).join(' & ');

  const lines = [`🥒 ${a.name}${a.when ? ` — ${a.when}` : ''}`, a.details.join(' · ')];

  if (a.teams.length > 0) {
    lines.push('', 'Teams');
    a.teams.forEach((side, i) => lines.push(`${i + 1}. ${namesOf(side)}`));
  }

  if (a.round1.length > 0) {
    lines.push('', 'Round 1');
    for (const g of a.round1) {
      const prefix = a.multiCourt ? `Court ${g.court}: ` : '';
      lines.push(`${prefix}${namesOf(g.teamA)} vs ${namesOf(g.teamB)}`);
    }
    if (a.byes.length > 0) lines.push(`Sitting out: ${a.byes.map(nameOf).join(', ')}`);
  }

  if (a.playing > 0) lines.push('', `${a.playing} playing`);
  if (url) lines.push('', `Full schedule: ${url}`);

  return lines.join('\n');
}

/**
 * The message you post once the games are done: who won, how the playoffs went,
 * and the full table.
 *
 * Same reasoning as buildSessionShare — there are no push notifications, so the
 * group chat is where results actually land. Deliberately ordered result-first:
 * the champion is the thing people want, and a table nobody scrolls to is a
 * table nobody reads.
 *
 * No column alignment. Group chats render in proportional fonts, so padded
 * columns arrive ragged; "1. Varun — 4W 0L, +24" reads correctly everywhere.
 *
 * @param session  the session row
 * @param games    all of its games, round robin and knockout alike
 * @param members  the club roster, for names
 * @param url      link to the app
 */
export function buildResultsShare({ session, games = [], members = [], url } = {}) {
  if (!session) return '';

  // Entrants rather than players, so a fixed-pairs result reads "Ana & Ben"
  // throughout instead of listing eight individuals who never played alone.
  const { entrants } = sessionEntrants({ session, games, members });
  const bracket = resolveBracket(entrants, games);
  const nameOf = (ids) =>
    (ids ?? []).map((id) => members.find((m) => m.id === id)?.name ?? '—').join(' & ');

  const when = [formatSessionDate(session.date), formatSessionTime(session.startTime)]
    .filter(Boolean)
    .join(', ');

  const lines = [`🏆 ${session.name}${when ? ` — ${when}` : ''}`];

  if (bracket.rr.played === 0) {
    lines.push('', 'No games played yet.');
    if (url) lines.push('', url);
    return lines.join('\n');
  }

  // --- the result ---------------------------------------------------
  if (bracket.complete) {
    lines.push('');
    lines.push(`🥇 ${bracket.champion.name}`);
    if (bracket.runnerUp) lines.push(`🥈 ${bracket.runnerUp.name}`);
    if (bracket.third) lines.push(`🥉 ${bracket.third.name}`);
  } else {
    const leader = bracket.standings[0];
    if (leader?.gp > 0) {
      lines.push('', `🥇 ${leader.name} — ${record(leader)}`);
      // Naming a "winner" while a final is still outstanding would be wrong, so
      // say which table they lead and that the playoffs are unfinished.
      if (bracket.enabled) lines.push('(tops the round robin — playoffs still to finish)');
    }
  }

  // --- the playoffs -------------------------------------------------
  // A tree rather than a list of four results: the seeds each side came in on
  // and the "↳" line saying what the win was worth are what turn "these games
  // happened" into "this is how it was won". See utils/bracketTree.js.
  const tree = bracketTreeLines({ bracket, nameOf });
  if (tree.length > 0) lines.push('', ...tree);

  // --- the table ----------------------------------------------------
  const table = bracket.standings.filter((r) => r.gp > 0);
  if (table.length > 0) {
    lines.push('', bracket.enabled ? 'Round robin' : 'Final table');
    for (const row of table) {
      lines.push(`${row.rank}. ${row.name} — ${record(row)}`);
    }
  }

  lines.push('', `${bracket.rr.played} of ${bracket.rr.total} games played`);
  if (url) lines.push('', `Full results: ${url}`);

  return lines.join('\n');
}

const record = (row) =>
  `${row.w}W ${row.l}L, ${row.diff > 0 ? '+' : ''}${row.diff}`;
