import { describe, it, expect } from 'vitest';
import { buildPublishPlan } from './publishPlan.js';

const idFactory = () => {
  let n = 0;
  return () => `srv${++n}`;
};

const local = {
  club: { id: 'c-local', name: 'Picklers' },
  adminId: 'm1',
  members: [
    { id: 'm1', clubId: 'c-local', name: 'Varun', role: 'admin', colorIndex: 0, createdAt: 100 },
    { id: 'm2', clubId: 'c-local', name: 'Priya', role: 'player', colorIndex: 1, createdAt: 101 },
    { id: 'm3', clubId: 'c-local', name: 'Sam', role: 'player', colorIndex: 2, createdAt: 102 },
    { id: 'm4', clubId: 'c-local', name: 'Dev', role: 'player', colorIndex: 3, createdAt: 103 },
  ],
  sessions: [
    {
      id: 's1', clubId: 'c-local', name: 'Saturday', date: '2026-08-01',
      format: 'doubles_americano', playerIds: ['m1', 'm2', 'm3', 'm4'],
      numGames: 2, courts: 1, pointsTo: 11, rngSeed: 42, status: 'live', createdAt: 200,
    },
  ],
  games: [
    {
      id: 'g1', sessionId: 's1', ordinal: 1, round: 1, court: 1,
      teamA: ['m1', 'm2'], teamB: ['m3', 'm4'], byes: [],
      scoreA: 11, scoreB: 7, played: true, scoredBy: 'm1', updatedAt: 300,
    },
    {
      id: 'g2', sessionId: 's1', ordinal: 2, round: 2, court: 1,
      teamA: ['m1', 'm3'], teamB: ['m2', 'm4'], byes: [],
      scoreA: null, scoreB: null, played: false, scoredBy: null, updatedAt: 301,
    },
  ],
};

const build = (overrides = {}) =>
  buildPublishPlan(
    { ...local, ...overrides },
    { clubId: 'srv-club', adminMemberId: 'srv-admin', newId: idFactory() }
  );

describe('members', () => {
  it('does not re-insert the admin — create_club already made them', () => {
    const { members } = build();
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.name)).toEqual(['Priya', 'Sam', 'Dev']);
  });

  it('maps the local admin id onto the server admin id', () => {
    expect(build().idMap.get('m1')).toBe('srv-admin');
  });

  it('gives everyone else a fresh server id', () => {
    const { idMap } = build();
    expect(idMap.get('m2')).toMatch(/^srv\d+$/);
    expect(idMap.get('m2')).not.toBe('m2');
  });

  it('attaches every member to the new club', () => {
    expect(build().members.every((m) => m.clubId === 'srv-club')).toBe(true);
  });

  it('leaves exactly one admin — the account doing the publishing', () => {
    const withTwoAdmins = build({
      members: local.members.map((m) => ({ ...m, role: 'admin' })),
    });
    expect(withTwoAdmins.members.every((m) => m.role === 'player')).toBe(true);
  });

  it('preserves names and avatar colours', () => {
    const priya = build().members.find((m) => m.name === 'Priya');
    expect(priya.colorIndex).toBe(1);
  });
});

describe('sessions', () => {
  it('rewrites playerIds to the new member ids', () => {
    const { sessions, idMap } = build();
    expect(sessions[0].playerIds).toEqual(['srv-admin', idMap.get('m2'), idMap.get('m3'), idMap.get('m4')]);
  });

  it('attaches the session to the new club and admin', () => {
    const { sessions } = build();
    expect(sessions[0].clubId).toBe('srv-club');
    expect(sessions[0].createdBy).toBe('srv-admin');
  });

  it('marks published sessions as imported', () => {
    expect(build().sessions[0].imported).toBe(true);
  });

  it('keeps the format, seed and scoring settings', () => {
    expect(build().sessions[0]).toMatchObject({
      format: 'doubles_americano', rngSeed: 42, pointsTo: 11, courts: 1,
    });
  });

  it('handles a club with no sessions at all', () => {
    const plan = build({ sessions: [], games: [] });
    expect(plan.sessions).toEqual([]);
    expect(plan.games).toEqual([]);
  });
});

describe('games', () => {
  it('rewrites both teams', () => {
    const { games, idMap } = build();
    expect(games[0].teamA).toEqual(['srv-admin', idMap.get('m2')]);
    expect(games[0].teamB).toEqual([idMap.get('m3'), idMap.get('m4')]);
  });

  it('points games at the new session id', () => {
    const { games, sessions } = build();
    expect(games.every((g) => g.sessionId === sessions[0].id)).toBe(true);
  });

  it('carries scores across untouched', () => {
    // A bulk import is not a score edit — replaying these through submit_score
    // would fabricate audit entries for changes that never happened.
    const { games } = build();
    expect(games[0]).toMatchObject({ scoreA: 11, scoreB: 7, played: true });
    expect(games[1]).toMatchObject({ scoreA: null, scoreB: null, played: false });
  });

  it('preserves a zero score', () => {
    const { games } = build({
      games: [{ ...local.games[0], scoreA: 0, scoreB: 11 }],
    });
    expect(games[0].scoreA).toBe(0);
  });

  it('clears scoredBy, since the local scorer has no server identity', () => {
    expect(build().games.every((g) => g.scoredBy === null)).toBe(true);
  });

  it('rewrites sit-out lists', () => {
    const { games, idMap } = build({
      games: [{ ...local.games[0], byes: ['m4'] }],
    });
    expect(games[0].byes).toEqual([idMap.get('m4')]);
  });

  it('drops a game whose session no longer exists', () => {
    const plan = build({
      games: [...local.games, { ...local.games[0], id: 'ghost', sessionId: 'gone' }],
    });
    expect(plan.games).toHaveLength(2);
    expect(plan.skipped).toContain('ghost');
  });

  it('drops a game that lost an entire side to a missing player', () => {
    const plan = build({
      games: [{ ...local.games[0], id: 'orphan', teamB: ['nobody'] }],
    });
    expect(plan.games).toHaveLength(0);
    expect(plan.skipped).toEqual(['orphan']);
  });

  it('keeps a game that lost only one of two partners', () => {
    // Still playable and rankable — one player per side is enough to represent.
    const plan = build({
      games: [{ ...local.games[0], teamB: ['m3', 'ghost'] }],
    });
    expect(plan.games).toHaveLength(1);
    expect(plan.games[0].teamB).toHaveLength(1);
  });

  it('renumbers ordinals contiguously after a drop', () => {
    const plan = build({
      games: [
        { ...local.games[0], id: 'ga', ordinal: 1 },
        { ...local.games[0], id: 'gb', ordinal: 2, teamA: ['nobody'] },
        { ...local.games[1], id: 'gc', ordinal: 3 },
      ],
    });
    expect(plan.games.map((g) => g.ordinal)).toEqual([1, 2]);
  });

  it('updates numGames to match what actually uploaded', () => {
    const plan = build({
      games: [
        { ...local.games[0], id: 'ga', ordinal: 1 },
        { ...local.games[0], id: 'gb', ordinal: 2, teamA: ['nobody'] },
      ],
    });
    expect(plan.sessions[0].numGames).toBe(1);
  });

  it('zeroes numGames for a session whose games all dropped', () => {
    const plan = build({
      games: [{ ...local.games[0], teamA: ['nobody'] }],
    });
    expect(plan.sessions[0].numGames).toBe(0);
  });

  it('gives every game a fresh id', () => {
    const plan = build();
    expect(plan.games.map((g) => g.id)).not.toContain('g1');
    expect(new Set(plan.games.map((g) => g.id)).size).toBe(plan.games.length);
  });
});

describe('robustness', () => {
  it('handles an empty club', () => {
    const plan = buildPublishPlan(
      { club: { id: 'c' }, adminId: null, members: [], sessions: [], games: [] },
      { clubId: 'srv-club', adminMemberId: 'srv-admin', newId: idFactory() }
    );
    expect(plan).toMatchObject({ members: [], sessions: [], games: [], skipped: [] });
  });

  it('tolerates missing collections', () => {
    const plan = buildPublishPlan(
      { adminId: null },
      { clubId: 'srv-club', adminMemberId: 'srv-admin', newId: idFactory() }
    );
    expect(plan.members).toEqual([]);
  });

  it('does not mutate the input', () => {
    const snapshot = JSON.parse(JSON.stringify(local));
    build();
    expect(local).toEqual(snapshot);
  });
});
