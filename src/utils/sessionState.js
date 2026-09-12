// Is this session still going, or is it over?
//
// Nothing used to answer that. `sessions.status` existed in the schema and both
// backends could write it, but no screen ever did — so every session stayed
// "live" forever and the app looked, on a Wednesday, exactly as it had on
// Sunday afternoon with a game still on court.
//
// Derived first, stored second, which is the same rule the bracket line-ups
// follow: the games already say whether there is anything left to play, and a
// column that disagreed with them would be a bug waiting to happen. The stored
// flag exists only for the thing the games cannot say — that everybody went
// home with fixtures unplayed.
//
// All pure, so it is tested rather than eyeballed.

/** How many fixtures still have no result. */
export function unplayedCount(games = []) {
  return games.filter((g) => !g?.played).length;
}

/**
 * True once there is nothing left to play.
 *
 * Two ways for that to be true:
 *   * every fixture has a score — derived, needs no write, and is therefore
 *     the same answer on every phone the moment the last score lands; or
 *   * an admin said so — the session that stopped at 6 games of 10 because it
 *     got dark. Only this case needs the stored `status`.
 */
export function isSessionOver({ session, games = [] } = {}) {
  if (!session) return false;
  if (session.status === 'final') return true;
  if (games.length === 0) return false;
  return games.every((g) => g?.played);
}

/**
 * True when a session is over but nobody finished it on purpose.
 *
 * The distinction matters for offering "Reopen": a session that is over only
 * because every game was played reopens by clearing a score, which is a normal
 * thing to do and needs no button. One an admin ended early needs a way back.
 */
export function endedEarly({ session, games = [] } = {}) {
  return session?.status === 'final' && unplayedCount(games) > 0;
}

/**
 * The one-line result, for a session that is over.
 *
 * A knockout has a champion; a plain round robin has whoever topped the table.
 * `null` when nothing has been played at all — "nobody won" is more honest
 * than crowning whoever sorts first.
 */
export function sessionOutcome({ bracket } = {}) {
  if (!bracket) return null;
  if (bracket.champion) return { name: bracket.champion.name, kind: 'champion' };
  const top = bracket.standings?.[0];
  if (!top || !top.gp) return null;
  return { name: top.name, kind: 'table', wins: top.w };
}
