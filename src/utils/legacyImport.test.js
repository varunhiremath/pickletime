import { describe, it, expect } from 'vitest';
import {
  LEGACY_KEY,
  readLegacyState,
  isLegacyState,
  hasImportableData,
  convertLegacyState,
} from './legacyImport.js';

// Minimal localStorage stand-in.
const storageWith = (value) => ({
  getItem: (key) => (key === LEGACY_KEY ? value : null),
});

// Deterministic id factory so conversions are comparable.
const idFactory = () => {
  let n = 0;
  return () => `id${++n}`;
};

const legacy = {
  players: [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cal' },
  ],
  format: 'singles',
  games: [
    { id: 'g1', round: 1, teamA: ['p1'], teamB: ['p2'], byes: ['p3'], scoreA: 11, scoreB: 7, played: true },
    { id: 'g2', round: 2, teamA: ['p1'], teamB: ['p3'], byes: ['p2'], scoreA: null, scoreB: null, played: false },
  ],
};

const convert = (state, extra = {}) =>
  convertLegacyState(state, { clubId: 'club1', newId: idFactory(), now: 1000, date: '2026-07-31', ...extra });

describe('readLegacyState', () => {
  it('parses a stored blob', () => {
    expect(readLegacyState(storageWith(JSON.stringify(legacy)))).toMatchObject({ format: 'singles' });
  });

  it('is null when the key is absent', () => {
    expect(readLegacyState(storageWith(null))).toBeNull();
  });

  it('is null on malformed JSON rather than throwing', () => {
    expect(readLegacyState(storageWith('{not json'))).toBeNull();
  });

  it('is null when the shape is wrong', () => {
    expect(readLegacyState(storageWith(JSON.stringify({ nope: true })))).toBeNull();
  });

  it('tolerates a missing storage object', () => {
    expect(readLegacyState(undefined)).toBeNull();
    expect(readLegacyState({})).toBeNull();
  });
});

describe('isLegacyState', () => {
  it('requires players and games arrays', () => {
    expect(isLegacyState({ players: [], games: [] })).toBe(true);
    expect(isLegacyState({ players: [] })).toBe(false);
    expect(isLegacyState(null)).toBe(false);
    expect(isLegacyState('string')).toBe(false);
  });
});

describe('hasImportableData', () => {
  it('is false for a pristine empty state', () => {
    expect(hasImportableData({ players: [], games: [] })).toBe(false);
  });

  it('is false when players exist but are all unnamed placeholders', () => {
    expect(hasImportableData({ players: [{ id: 'p1', name: '  ' }], games: [] })).toBe(false);
  });

  it('is true once somebody is named', () => {
    expect(hasImportableData({ players: [{ id: 'p1', name: 'Ana' }], games: [] })).toBe(true);
  });

  it('is true when games exist', () => {
    expect(hasImportableData({ players: [], games: [{ id: 'g1' }] })).toBe(true);
  });
});

describe('convertLegacyState', () => {
  it('returns null for an invalid state', () => {
    expect(convert(null)).toBeNull();
    expect(convert({ nope: true })).toBeNull();
  });

  it('maps every named player to a member of the club', () => {
    const { members } = convert(legacy);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.name)).toEqual(['Ana', 'Ben', 'Cal']);
    expect(members.every((m) => m.clubId === 'club1')).toBe(true);
  });

  it('makes the first player the admin and the rest players', () => {
    const { members } = convert(legacy);
    expect(members[0].role).toBe('admin');
    expect(members.slice(1).every((m) => m.role === 'player')).toBe(true);
  });

  it('staggers member timestamps so roster order survives the import', () => {
    const { members } = convert(legacy);
    const times = members.map((m) => m.createdAt);
    expect(new Set(times).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('leaves every member unclaimed so invites still have to be used', () => {
    const { members } = convert(legacy);
    expect(members.every((m) => m.userId === null)).toBe(true);
  });

  it('drops unnamed placeholder players', () => {
    const { members } = convert({
      ...legacy,
      players: [...legacy.players, { id: 'p4', name: '   ' }],
    });
    expect(members).toHaveLength(3);
  });

  it('rewrites player ids inside games', () => {
    const { members, games } = convert(legacy);
    const anaId = members[0].id;
    expect(games[0].teamA).toEqual([anaId]);
    expect(games[0].teamA[0]).not.toBe('p1');
  });

  it('carries scores across and marks played games', () => {
    const { games } = convert(legacy);
    expect(games[0]).toMatchObject({ scoreA: 11, scoreB: 7, played: true });
    expect(games[1]).toMatchObject({ scoreA: null, scoreB: null, played: false });
  });

  it('maps the legacy doubles format name to the americano format', () => {
    const { session } = convert({ ...legacy, format: 'doubles' });
    expect(session.format).toBe('doubles_americano');
  });

  it('falls back to singles for an unrecognised format', () => {
    const { session } = convert({ ...legacy, format: 'nonsense' });
    expect(session.format).toBe('singles');
  });

  it('preserves sit-outs', () => {
    const { members, games } = convert(legacy);
    expect(games[0].byes).toEqual([members[2].id]);
  });

  it('drops games referencing players that no longer exist, and renumbers', () => {
    const { games } = convert({
      ...legacy,
      games: [
        { id: 'g1', round: 1, teamA: ['p1'], teamB: ['p2'], byes: [], scoreA: 11, scoreB: 2 },
        { id: 'g2', round: 2, teamA: ['ghost'], teamB: ['p2'], byes: [], scoreA: 11, scoreB: 3 },
        { id: 'g3', round: 3, teamA: ['p1'], teamB: ['p3'], byes: [], scoreA: 5, scoreB: 11 },
      ],
    });
    expect(games).toHaveLength(2);
    expect(games.map((g) => g.ordinal)).toEqual([1, 2]);
  });

  it('numbers games from 1 in order', () => {
    const { games } = convert(legacy);
    expect(games.map((g) => g.ordinal)).toEqual([1, 2]);
  });

  it('attaches every game to the imported session', () => {
    const { session, games } = convert(legacy);
    expect(games.every((g) => g.sessionId === session.id)).toBe(true);
  });

  it('marks the session as live while games remain unplayed', () => {
    expect(convert(legacy).session.status).toBe('live');
  });

  it('marks the session final when everything has been played', () => {
    const { session } = convert({
      ...legacy,
      games: [{ id: 'g1', round: 1, teamA: ['p1'], teamB: ['p2'], byes: [], scoreA: 11, scoreB: 7 }],
    });
    expect(session.status).toBe('final');
  });

  it('does not mark an empty schedule as final', () => {
    const { session } = convert({ ...legacy, games: [] });
    expect(session.status).toBe('live');
  });

  it('flags the session as imported', () => {
    expect(convert(legacy).session.imported).toBe(true);
  });

  it('derives the session date from the clock when none is given', () => {
    const { session } = convert(legacy, { date: undefined, now: Date.UTC(2026, 6, 31) });
    expect(session.date).toBe('2026-07-31');
  });

  it('ignores non-numeric scores rather than importing NaN', () => {
    const { games } = convert({
      ...legacy,
      games: [{ id: 'g1', round: 1, teamA: ['p1'], teamB: ['p2'], byes: [], scoreA: 'oops', scoreB: 7 }],
    });
    expect(games[0].scoreA).toBeNull();
    expect(games[0].played).toBe(false);
  });

  it('does not mutate the input', () => {
    const snapshot = JSON.parse(JSON.stringify(legacy));
    convert(legacy);
    expect(legacy).toEqual(snapshot);
  });
});
