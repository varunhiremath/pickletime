// The backend seam.
//
// Everything above this line (pages, hooks, stores) talks to a Backend and never
// to Supabase or Dexie directly. Sprint 1 ships `localBackend` only, so the app
// is a complete working single-device PWA; Sprint 2 adds `supabaseBackend`
// behind the same interface and the UI does not change.
//
// A Backend implements:
//
//   identity
//     getIdentity()                    -> { deviceId, memberId, clubId, role } | null
//     claimInvite(code)                -> { club, member }
//     signOut()
//
//   reads (all resolve from the local mirror first, so they work offline)
//     getClub()                        -> club | null
//     listMembers()                    -> member[]
//     listSessions()                   -> session[]
//     getSession(sessionId)            -> { session, games } | null
//     getActiveSession()               -> { session, games } | null
//     listScoreEvents(gameId)          -> scoreEvent[]
//
//   writes
//     createClub({ name, adminName })  -> { club, member }
//     addMember({ name })              -> member
//     removeMember(memberId)
//     mintInvite(memberId)             -> { code, invite }   (code shown once)
//     revokeInvite(memberId)
//     createSession(config)            -> { session, games }
//     regenerateSchedule(sessionId, { seed, teams }) -> { session, games }
//       `teams` is fixed-pairs only: pass partnerships to set them explicitly,
//       omit to draw them at random. See utils/schedule.js.
//     submitScore(gameId, scoreA, scoreB, teams?) -> game
//       `teams` is { teamA, teamB } and applies only to a knockout fixture,
//       whose line-up is not known until the round robin ends. See
//       utils/bracket.js and supabase/functions.sql.
//     setSessionStatus(sessionId, status)     -> session
//     deleteSession(sessionId)
//
//   realtime
//     subscribe(onChange)              -> unsubscribe
//     getConnection()                  -> 'local' | 'connecting' | 'live' | 'offline'
//
// Anything addable is editable and deletable, and deleting a session removes its
// games and score events with it — derived data never outlives its source.

export const CONNECTION = {
  LOCAL: 'local',           // no server configured; single-device mode
  CONNECTING: 'connecting',
  LIVE: 'live',
  OFFLINE: 'offline',       // server configured but unreachable; writes queue
};

export const ROLES = { ADMIN: 'admin', PLAYER: 'player' };

export const SESSION_STATUS = { DRAFT: 'draft', LIVE: 'live', FINAL: 'final' };

let current = null;

export function setBackend(backend) {
  current = backend;
  return backend;
}

export function getBackend() {
  if (!current) throw new Error('No backend configured — call setBackend() during boot.');
  return current;
}

/** True once a server is configured. Sprint 1 always returns false. */
export function isRemote() {
  return !!current && current.kind === 'supabase';
}
