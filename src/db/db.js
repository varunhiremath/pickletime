import Dexie from 'dexie';

// Local mirror of the shared data, plus the offline outbox.
//
// This is a *cache*, not the source of truth — Supabase is (from Sprint 2). It
// exists because pickleball courts have bad signal: the app must open instantly
// and stay usable with no network, then reconcile when the connection returns.
//
// Schema versions are append-only. Never edit a version that has shipped; add a
// new db.version(n) block instead. Index only fields that are actually queried.
export const db = new Dexie('PickleTimeDB');

db.version(1).stores({
  // The friend group. Normally exactly one row.
  clubs: 'id, name',

  // Roster. `userId` is null until that person claims their invite.
  members: 'id, clubId, name, role, userId',

  // A session is one outing: a date, a format, and a generated schedule.
  sessions: 'id, clubId, date, status, createdAt',

  // The fixtures. Compound [sessionId+ordinal] powers the ordered match list.
  games: 'id, sessionId, [sessionId+ordinal], round, played, updatedAt',

  // Append-only audit log mirrored from the server.
  scoreEvents: 'id, gameId, memberId, createdAt',

  // Pending writes waiting for a connection. ++id keeps insertion order.
  outbox: '++id, gameId, queuedAt',

  // Small key/value bag: device id, current session, last sync time, whether the
  // legacy localStorage import has already run.
  meta: 'key',
});

/* ---------- meta helpers ---------- */

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row === undefined ? fallback : row.value;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

/* ---------- wipe ---------- */

/**
 * Clear the local mirror. Used by "sign out of this club" and by the settings
 * danger zone. Deliberately does NOT touch the server — this only forgets the
 * local copy.
 */
export async function clearLocalData({ keepDeviceId = true } = {}) {
  const deviceId = keepDeviceId ? await getMeta('deviceId') : null;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  if (deviceId) await setMeta('deviceId', deviceId);
}
