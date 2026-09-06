// Publishing a device-local club to the server.
//
// The club was built offline with locally generated ids. Uploading it means
// minting fresh ids and rewriting every reference — member ids appear inside
// `session.playerIds` and inside each game's `teamA`, `teamB` and `byes` arrays,
// so a missed rewrite produces a schedule full of players who don't exist and
// standings that silently drop people.
//
// That is the part with real failure modes, so it is pure and tested here; the
// upload itself is then a thin loop of ordinary inserts.
//
// The admin is a special case: `create_club` has already inserted them
// server-side (bound to the caller's auth account), so their local id maps to
// that existing row rather than to a new one, and they are excluded from the
// members to insert.

import { isKnockout } from './bracket.js';

/**
 * @param local  { club, members, sessions, games, adminId }
 * @param clubId          the server club id from create_club()
 * @param adminMemberId   the server member id from create_club()
 * @param newId           () => string id factory
 * @returns { members, sessions, games, idMap, skipped }
 */
export function buildPublishPlan(local, { clubId, adminMemberId, newId } = {}) {
  const members = local?.members ?? [];
  const sessions = local?.sessions ?? [];
  const games = local?.games ?? [];

  // Local member id → server member id.
  const idMap = new Map();
  const outMembers = [];

  for (const m of members) {
    if (m.id === local.adminId) {
      // Already created by create_club(); don't insert a duplicate.
      idMap.set(m.id, adminMemberId);
      continue;
    }
    const id = newId();
    idMap.set(m.id, id);
    outMembers.push({
      id,
      clubId,
      name: m.name,
      // Whatever the roster already said. An admin who has not claimed a device
      // can do nothing — every RLS check matches on user_id, which is still
      // NULL — so carrying the role across is safe, and dropping it would
      // silently undo a decision the club made before publishing.
      role: m.role === 'admin' ? 'admin' : 'player',
      colorIndex: m.colorIndex ?? outMembers.length % 8,
      createdAt: m.createdAt,
    });
  }

  const mapIds = (ids) => (ids ?? []).map((id) => idMap.get(id)).filter(Boolean);

  const sessionIdMap = new Map();
  const outSessions = [];
  for (const s of sessions) {
    const id = newId();
    sessionIdMap.set(s.id, id);
    outSessions.push({
      ...s,
      id,
      clubId,
      createdBy: adminMemberId,
      playerIds: mapIds(s.playerIds),
      imported: true,
    });
  }

  const outGames = [];
  const skipped = [];

  for (const g of games) {
    const sessionId = sessionIdMap.get(g.sessionId);
    const teamA = mapIds(g.teamA);
    const teamB = mapIds(g.teamB);

    // A game whose session vanished, or that lost a whole side to a player who
    // is no longer on the roster, cannot be represented. Dropping it beats
    // uploading a fixture that renders as "— vs —".
    //
    // An UNPLAYED knockout fixture is the deliberate exception: those rows are
    // created with empty sides because nobody knows who plays a semifinal until
    // the round robin is finished. Applying the rule to them would quietly
    // publish a tournament with its whole bracket missing.
    const emptyOk = isKnockout(g) && !g.played;
    if (!sessionId || (!emptyOk && (teamA.length === 0 || teamB.length === 0))) {
      skipped.push(g.id);
      continue;
    }

    outGames.push({
      ...g,
      id: newId(),
      sessionId,
      teamA,
      teamB,
      byes: mapIds(g.byes),
      scoredBy: null, // the local scorer has no server identity yet
    });
  }

  // Renumber each session's games so ordinals stay contiguous after any drops,
  // and keep num_games honest.
  const bySession = new Map();
  for (const g of outGames) {
    if (!bySession.has(g.sessionId)) bySession.set(g.sessionId, []);
    bySession.get(g.sessionId).push(g);
  }
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.ordinal - b.ordinal);
    list.forEach((g, i) => {
      g.ordinal = i + 1;
    });
    const session = outSessions.find((s) => s.id === sessionId);
    if (session) session.numGames = list.length;
  }
  for (const s of outSessions) {
    if (!bySession.has(s.id)) s.numGames = 0;
  }

  return { members: outMembers, sessions: outSessions, games: outGames, idMap, skipped };
}
