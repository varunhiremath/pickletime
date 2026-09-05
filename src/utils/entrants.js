// Who is being ranked.
//
// Most of the app assumed that was always "a player", which held while every
// format ranked individuals. Fixed-pairs doubles breaks it: partners never
// change, so the thing that wins or loses a game — and the thing that gets
// seeded into a semifinal — is the TEAM.
//
// An "entrant" is that unit:
//
//   singles / americano  → one player   { id: playerId, playerIds: [playerId] }
//   fixed pairs          → one team     { id: 'a+b',    playerIds: [a, b]     }
//
// Everything downstream (standings, bracket seeding, the podium, the shared
// results) works on entrants, so it does not need to care which format is in
// play. The one place that still ranks individuals on purpose is the per-player
// page, which is about a person's own record whatever the format.
//
// Teams are DERIVED from the round-robin games rather than stored. In a fixed
// -pairs round robin every game's side is a team by construction, so the games
// already carry the draw — a `teams` column would be a second source of truth
// that could disagree with the schedule.

import { FORMATS, isTeamFormat } from './schedule.js';
import { roundRobinGames } from './bracket.js';

/** Stable key for a set of player ids, order-independent. */
export const teamKey = (ids) => [...ids].sort().join('+');

/**
 * The teams in a fixed-pairs session, in the order they first appear in the
 * schedule (so the list is stable rather than dependent on object iteration).
 */
export function teamsFromGames(games) {
  const seen = new Map();
  for (const g of roundRobinGames(games)) {
    for (const side of [g.teamA, g.teamB]) {
      if (!side?.length) continue;
      const key = teamKey(side);
      if (!seen.has(key)) seen.set(key, side.slice());
    }
  }
  return [...seen.values()];
}

/**
 * Build the entrant list for a session.
 *
 * @param session  the session row (only `format` and `playerIds` are read)
 * @param games    its games — the source of the pairs draw in team formats
 * @param members  the roster, for names
 * @returns {{ entrants, teamPlay, byId }}
 */
export function sessionEntrants({ session, games = [], members = [] } = {}) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '—';

  if (!session) return { entrants: [], teamPlay: false, byId: new Map() };

  const teamPlay = isTeamFormat(session.format);

  const entrants = teamPlay
    ? teamsFromGames(games).map((ids) => ({
        id: teamKey(ids),
        name: ids.map(nameOf).join(' & '),
        playerIds: ids,
      }))
    : (session.playerIds ?? [])
        .filter((id) => members.some((m) => m.id === id))
        .map((id) => ({ id, name: nameOf(id), playerIds: [id] }));

  return {
    entrants,
    teamPlay,
    byId: new Map(entrants.map((e) => [e.id, e])),
  };
}

/**
 * Rewrite games so each side is the single entrant id that played it.
 *
 * This is what lets one ranking implementation serve both shapes: computeStandings
 * credits whatever ids it finds on a side, so collapsing a pair to its team key
 * makes a team look exactly like a player to it. Games whose sides don't map to a
 * known entrant are dropped — after a redraw, an old game's pairing no longer
 * exists, and crediting it to nobody is better than inventing a team.
 */
export function gamesByEntrant(games, byId) {
  const sideKey = (ids) => {
    if (!ids?.length) return null;
    const key = teamKey(ids);
    return byId.has(key) ? key : null;
  };

  const out = [];
  for (const g of games) {
    const a = sideKey(g.teamA);
    const b = sideKey(g.teamB);
    if (!a || !b) continue;
    out.push({ ...g, teamA: [a], teamB: [b] });
  }
  return out;
}

/** How many players make up one entrant — 1 for singles, 2 for pairs. */
export const entrantSize = (format) => (isTeamFormat(format) ? 2 : 1);

export { FORMATS, isTeamFormat };
