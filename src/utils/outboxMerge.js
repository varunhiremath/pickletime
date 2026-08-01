// Offline outbox resolution.
//
// Courts have bad signal, so score entry has to work offline. Writes are queued
// locally and flushed on reconnect. While a write sat in the queue, somebody
// else may have scored the same game from a phone that still had signal.
//
// The policy is last-write-wins, but *honestly*: the later write is applied and
// the person who got overwritten is told, rather than silently losing their
// entry. Nothing is actually lost either way — every write is appended to
// score_events server-side, so the audit log holds both.

/**
 * Collapse a queue down to one pending write per game — the newest. Somebody
 * correcting their own score three times offline should produce one request,
 * not three.
 * Returns entries in queue order (oldest first).
 */
export function collapseOutbox(entries) {
  const latest = new Map();
  for (const e of entries) {
    const prev = latest.get(e.gameId);
    if (!prev || e.queuedAt >= prev.queuedAt) latest.set(e.gameId, e);
  }
  return [...latest.values()].sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Did somebody else change this game while our write was queued?
 *
 * Not a conflict if the remote change was ours, or if the remote already holds
 * the exact score we were going to write — re-sending it would be a no-op, and
 * warning about it would just be noise.
 */
export function detectConflict(entry, remoteGame) {
  if (!remoteGame) return null;
  if (remoteGame.updatedAt == null || remoteGame.updatedAt <= entry.queuedAt) return null;
  if (remoteGame.scoredBy === entry.memberId) return null;
  if (remoteGame.scoreA === entry.scoreA && remoteGame.scoreB === entry.scoreB) return null;

  return {
    gameId: entry.gameId,
    mine: { scoreA: entry.scoreA, scoreB: entry.scoreB, at: entry.queuedAt },
    theirs: {
      scoreA: remoteGame.scoreA,
      scoreB: remoteGame.scoreB,
      at: remoteGame.updatedAt,
      by: remoteGame.scoredBy ?? null,
    },
  };
}

/**
 * Plan a flush: what to send, and what the user needs to be told about.
 *
 * @param entries      raw outbox rows
 * @param remoteGames  current server state, keyed by game id (Map or object)
 */
export function planFlush(entries, remoteGames = new Map()) {
  const lookup = remoteGames instanceof Map ? remoteGames : new Map(Object.entries(remoteGames));
  const toSend = collapseOutbox(entries);
  const conflicts = [];

  for (const entry of toSend) {
    const conflict = detectConflict(entry, lookup.get(entry.gameId));
    if (conflict) conflicts.push(conflict);
  }

  return { toSend, conflicts };
}

/**
 * Optimistic local update so the UI reflects a queued score immediately, before
 * it reaches the server.
 */
export function applyPending(game, entry) {
  return {
    ...game,
    scoreA: entry.scoreA,
    scoreB: entry.scoreB,
    played: entry.scoreA != null && entry.scoreB != null,
    scoredBy: entry.memberId,
    updatedAt: entry.queuedAt,
    pending: true,
  };
}

/**
 * Merge a server row over a local one. The server wins unless we still hold an
 * un-flushed write for that game, in which case the optimistic value stays put
 * so the user's own entry doesn't visibly flicker back mid-flush.
 */
export function mergeRemote(localGame, remoteGame, pendingEntry = null) {
  if (!remoteGame) return localGame;
  if (pendingEntry) return applyPending(remoteGame, pendingEntry);
  return { ...remoteGame, pending: false };
}

/** Human-readable conflict message for the toast. */
export function describeConflict(conflict, nameOf = () => 'Someone') {
  const who = conflict.theirs.by ? nameOf(conflict.theirs.by) : 'Someone';
  const { scoreA, scoreB } = conflict.theirs;
  return `${who} scored this game ${scoreA}–${scoreB} while you were offline. Your entry replaced it.`;
}
