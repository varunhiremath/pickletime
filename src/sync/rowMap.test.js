import { describe, it, expect } from 'vitest';
import {
  clubFromRow,
  memberFromRow,
  sessionFromRow,
  sessionToRow,
  gameFromRow,
  gameToRow,
  inviteFromRow,
  scoreEventFromRow,
} from './rowMap.js';

describe('clubFromRow', () => {
  it('maps a row', () => {
    expect(clubFromRow({ id: 'c1', name: 'Picklers', created_at: '2026-08-01T10:00:00Z' })).toEqual({
      id: 'c1',
      name: 'Picklers',
      createdAt: Date.parse('2026-08-01T10:00:00Z'),
    });
  });

  it('is null for a missing row', () => {
    expect(clubFromRow(null)).toBeNull();
    expect(clubFromRow(undefined)).toBeNull();
  });

  it('falls back to 0 for an unparseable timestamp', () => {
    expect(clubFromRow({ id: 'c1', name: 'x', created_at: null }).createdAt).toBe(0);
  });
});

describe('memberFromRow', () => {
  it('maps a claimed member', () => {
    expect(
      memberFromRow({
        id: 'm1', club_id: 'c1', name: 'Ana', user_id: 'u1',
        role: 'admin', color_index: 2, created_at: '2026-08-01T10:00:00Z',
      })
    ).toMatchObject({ id: 'm1', clubId: 'c1', name: 'Ana', userId: 'u1', role: 'admin', colorIndex: 2 });
  });

  it('keeps an unclaimed member’s userId null rather than undefined', () => {
    const m = memberFromRow({ id: 'm1', club_id: 'c1', name: 'Ben', user_id: null, role: 'player' });
    expect(m.userId).toBeNull();
  });

  it('defaults a missing colour index', () => {
    expect(memberFromRow({ id: 'm1', club_id: 'c1', name: 'B', role: 'player' }).colorIndex).toBe(0);
  });
});

describe('session mapping', () => {
  const row = {
    id: 's1', club_id: 'c1', name: 'Saturday', date: '2026-08-01',
    format: 'doubles_americano', player_ids: ['m1', 'm2'], num_games: 8,
    courts: 2, points_to: 11, rng_seed: '4294967295', status: 'live',
    created_by: 'm1', imported: false, created_at: '2026-08-01T10:00:00Z',
  };

  it('maps a row to the app shape', () => {
    expect(sessionFromRow(row)).toMatchObject({
      id: 's1', clubId: 'c1', name: 'Saturday', playerIds: ['m1', 'm2'],
      numGames: 8, courts: 2, pointsTo: 11, status: 'live', imported: false,
    });
  });

  it('coerces a bigint seed arriving as a string', () => {
    // Postgres bigint comes back as a string over PostgREST; the RNG needs a number.
    expect(sessionFromRow(row).rngSeed).toBe(4294967295);
    expect(typeof sessionFromRow(row).rngSeed).toBe('number');
  });

  it('defaults empty arrays and sensible values', () => {
    const bare = sessionFromRow({ id: 's1', club_id: 'c1', name: 'x', format: 'singles', status: 'live' });
    expect(bare.playerIds).toEqual([]);
    expect(bare.courts).toBe(1);
    expect(bare.pointsTo).toBe(11);
  });

  it('round-trips through sessionToRow', () => {
    const app = sessionFromRow(row);
    const back = sessionToRow(app);
    expect(back).toMatchObject({
      id: 's1', club_id: 'c1', player_ids: ['m1', 'm2'],
      num_games: 8, courts: 2, points_to: 11, rng_seed: 4294967295,
    });
  });

  it('maps the playoffs flag, defaulting a session written before it existed to false', () => {
    expect(sessionFromRow({ ...row, playoffs: true }).playoffs).toBe(true);
    expect(sessionFromRow(row).playoffs).toBe(false);
    expect(sessionToRow(sessionFromRow({ ...row, playoffs: true })).playoffs).toBe(true);
  });
});

describe('game mapping', () => {
  const row = {
    id: 'g1', session_id: 's1', ordinal: 3, round: 2, court: 1,
    team_a: ['m1', 'm2'], team_b: ['m3', 'm4'], byes: ['m5'],
    score_a: 11, score_b: 7, played: true, scored_by: 'm1',
    updated_at: '2026-08-01T11:00:00Z',
  };

  it('maps a row to the app shape', () => {
    expect(gameFromRow(row)).toMatchObject({
      id: 'g1', sessionId: 's1', ordinal: 3, round: 2,
      teamA: ['m1', 'm2'], teamB: ['m3', 'm4'], byes: ['m5'],
      scoreA: 11, scoreB: 7, played: true, scoredBy: 'm1',
    });
  });

  it('keeps an unscored game null rather than undefined', () => {
    const g = gameFromRow({ ...row, score_a: null, score_b: null, played: false });
    expect(g.scoreA).toBeNull();
    expect(g.scoreB).toBeNull();
    expect(g.played).toBe(false);
  });

  it('does not turn a zero score into null', () => {
    // 0 is a real score. `?? null` is correct here; `|| null` would be a bug.
    const g = gameFromRow({ ...row, score_a: 0, score_b: 11 });
    expect(g.scoreA).toBe(0);
  });

  it('round-trips through gameToRow', () => {
    expect(gameToRow(gameFromRow(row))).toMatchObject({
      id: 'g1', session_id: 's1', ordinal: 3,
      team_a: ['m1', 'm2'], team_b: ['m3', 'm4'], score_a: 11, played: true,
    });
  });

  it('preserves a zero score through the round trip', () => {
    const g = gameFromRow({ ...row, score_a: 0, score_b: 0, played: true });
    expect(gameToRow(g).score_a).toBe(0);
    expect(gameToRow(g).score_b).toBe(0);
  });

  it('reads a game written before playoffs existed as a round-robin fixture', () => {
    // No `stage` column in the row at all. Defaulting to anything else would
    // reclassify every historical game as a playoff.
    const g = gameFromRow(row);
    expect(g.stage).toBe('rr');
    expect(g.slot).toBeNull();
    expect(gameToRow(g).stage).toBe('rr');
  });

  it('round-trips a knockout fixture', () => {
    const g = gameFromRow({ ...row, stage: 'final', slot: 'final', team_a: [], team_b: [] });
    expect(g).toMatchObject({ stage: 'final', slot: 'final', teamA: [], teamB: [] });
    expect(gameToRow(g)).toMatchObject({ stage: 'final', slot: 'final', team_a: [], team_b: [] });
  });
});

describe('inviteFromRow', () => {
  it('maps an unclaimed invite', () => {
    const inv = inviteFromRow({
      id: 'i1', club_id: 'c1', member_id: 'm2', code: 'PT-7Q2K-9XR4',
      created_at: '2026-08-01T10:00:00Z', expires_at: null, claimed_at: null, revoked: false,
    });
    expect(inv).toMatchObject({ memberId: 'm2', code: 'PT-7Q2K-9XR4', revoked: false });
    expect(inv.claimedAt).toBeNull();
    expect(inv.expiresAt).toBeNull();
  });

  it('parses claim and expiry timestamps when present', () => {
    const inv = inviteFromRow({
      id: 'i1', club_id: 'c1', member_id: 'm2', code: 'X',
      claimed_at: '2026-08-02T10:00:00Z', expires_at: '2026-09-01T10:00:00Z', revoked: true,
    });
    expect(inv.claimedAt).toBe(Date.parse('2026-08-02T10:00:00Z'));
    expect(inv.expiresAt).toBe(Date.parse('2026-09-01T10:00:00Z'));
    expect(inv.revoked).toBe(true);
  });
});

describe('scoreEventFromRow', () => {
  it('carries both the new and previous score', () => {
    expect(
      scoreEventFromRow({
        id: 'e1', game_id: 'g1', member_id: 'm1',
        score_a: 11, score_b: 7, prev_a: 9, prev_b: 7,
        created_at: '2026-08-01T11:00:00Z',
      })
    ).toMatchObject({ gameId: 'g1', memberId: 'm1', scoreA: 11, scoreB: 7, prevA: 9, prevB: 7 });
  });

  it('handles a first entry with no previous score', () => {
    const e = scoreEventFromRow({ id: 'e1', game_id: 'g1', member_id: 'm1', score_a: 11, score_b: 7 });
    expect(e.prevA).toBeNull();
    expect(e.prevB).toBeNull();
  });
});
