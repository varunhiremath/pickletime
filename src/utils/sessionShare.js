// The message you post to the group chat so everyone knows when to turn up and
// who they're opening against.
//
// The app has no push notifications — a static site can't send them — so this is
// how people actually find out a session exists. See docs/ROADMAP.md.
//
// All pure, so the formatting is tested rather than eyeballed.

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

const FORMAT_LABEL = {
  singles: 'Singles round robin',
  doubles_americano: 'Doubles · Americano',
};

/**
 * Build the announcement.
 *
 * @param session  the session row
 * @param games    its games (only round 1 is listed — the rest rotates anyway)
 * @param members  the club roster, for names
 * @param url      link to the app
 */
export function buildSessionShare({ session, games = [], members = [], url } = {}) {
  if (!session) return '';

  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '—';
  const namesOf = (ids) => (ids ?? []).map(nameOf).join(' & ');

  const when = [formatSessionDate(session.date), formatSessionTime(session.startTime)]
    .filter(Boolean)
    .join(', ');

  const lines = [`🥒 ${session.name}${when ? ` — ${when}` : ''}`];

  const details = [FORMAT_LABEL[session.format] ?? session.format];
  if (session.format !== 'singles' && session.numGames) {
    details.push(`${session.numGames} games`);
  }
  if (session.pointsTo) details.push(`to ${session.pointsTo}`);
  lines.push(details.join(' · '));

  // Round 1 only. Later rounds depend on who is still rotating, and a wall of
  // fixtures in a group chat is not read by anyone.
  const firstRound = games
    .filter((g) => g.round === (games[0]?.round ?? 1))
    .sort((a, b) => a.ordinal - b.ordinal);

  if (firstRound.length > 0) {
    lines.push('', 'Round 1');
    const multiCourt = (session.courts ?? 1) > 1;
    for (const g of firstRound) {
      const prefix = multiCourt ? `Court ${g.court}: ` : '';
      lines.push(`${prefix}${namesOf(g.teamA)} vs ${namesOf(g.teamB)}`);
    }
    const byes = firstRound[0]?.byes ?? [];
    if (byes.length > 0) lines.push(`Sitting out: ${byes.map(nameOf).join(', ')}`);
  }

  const playing = session.playerIds?.length ?? 0;
  if (playing > 0) lines.push('', `${playing} playing`);

  if (url) lines.push('', `Full schedule: ${url}`);

  return lines.join('\n');
}
