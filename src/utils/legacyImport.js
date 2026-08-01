// One-shot import of the original PickleTime's localStorage state.
//
// v1 kept everything under a single "pickletime.v1" key on the device. The new
// app is served from the same origin, so that data is still sitting there when a
// returning user opens v2 — importing it means nobody loses the weekend they
// already played.
//
// Pure by design: the caller supplies the storage object and the id factory, so
// this is fully testable without a browser.

export const LEGACY_KEY = 'pickletime.v1';

const FORMAT_MAP = {
  singles: 'singles',
  doubles: 'doubles_americano',
};

/** Read and parse the legacy blob. Returns null if absent or unreadable. */
export function readLegacyState(storage) {
  try {
    const raw = storage?.getItem?.(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isLegacyState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isLegacyState(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray(value.players) &&
    Array.isArray(value.games)
  );
}

/** Is there anything actually worth importing? */
export function hasImportableData(state) {
  if (!isLegacyState(state)) return false;
  const namedPlayers = state.players.filter((p) => p?.name?.trim());
  return namedPlayers.length > 0 || state.games.length > 0;
}

/**
 * Convert the legacy blob into the v2 shape.
 *
 * @param state    parsed legacy state
 * @param clubId   the club to attach the imported session to
 * @param newId    () => string id factory
 * @param now      epoch ms, for deterministic tests
 * @param date     ISO date string for the imported session
 */
export function convertLegacyState(state, { clubId, newId, now = Date.now(), date } = {}) {
  if (!isLegacyState(state)) return null;

  // Unnamed rows were placeholders in the old UI's player list — drop them, and
  // drop any game that referenced one, since it can't be attributed.
  const players = state.players.filter((p) => p?.id && p?.name?.trim());
  const idMap = new Map();
  const members = players.map((p, i) => {
    const id = newId();
    idMap.set(p.id, id);
    return {
      id,
      clubId,
      name: p.name.trim(),
      role: i === 0 ? 'admin' : 'player',
      userId: null,
      colorIndex: i % 8,
      // Stagger by index so the roster keeps the order the player list had.
      // Identical timestamps would leave the sort order down to IndexedDB.
      createdAt: now + i,
    };
  });

  const mapIds = (ids) => (Array.isArray(ids) ? ids.map((id) => idMap.get(id)).filter(Boolean) : []);

  const sessionId = newId();
  const format = FORMAT_MAP[state.format] ?? 'singles';

  const games = state.games
    .map((g, index) => {
      const teamA = mapIds(g.teamA);
      const teamB = mapIds(g.teamB);
      // A game is only meaningful if both sides survived the id mapping.
      if (teamA.length === 0 || teamB.length === 0) return null;

      const scoreA = Number.isFinite(g.scoreA) ? g.scoreA : null;
      const scoreB = Number.isFinite(g.scoreB) ? g.scoreB : null;

      return {
        id: newId(),
        sessionId,
        ordinal: index + 1,
        round: g.round ?? index + 1,
        court: 1,
        teamA,
        teamB,
        byes: mapIds(g.byes),
        scoreA,
        scoreB,
        played: scoreA != null && scoreB != null,
        scoredBy: null,
        updatedAt: now,
      };
    })
    .filter(Boolean)
    // Re-number after dropping any unmappable games so ordinals stay contiguous.
    .map((g, i) => ({ ...g, ordinal: i + 1 }));

  const session = {
    id: sessionId,
    clubId,
    name: 'Imported session',
    date: date ?? new Date(now).toISOString().slice(0, 10),
    format,
    numGames: games.length,
    courts: 1,
    pointsTo: 11,
    rngSeed: 0, // imported, not generated — reshuffling it would be meaningless
    status: games.every((g) => g.played) && games.length > 0 ? 'final' : 'live',
    imported: true,
    createdAt: now,
  };

  return { members, session, games };
}

/** Mark the import done so it never runs twice and never clobbers live data. */
export const IMPORT_FLAG = 'legacyImported';
