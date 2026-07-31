import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  currentStreak,
  rankHistory,
  headToHead,
  partnerRecords,
  sessionProgress,
} from './standings.js';

const P = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Cal' },
  { id: 'd', name: 'Dee' },
];

let ordinalSeq = 0;
const game = (teamA, teamB, scoreA, scoreB, ordinal) => ({
  ordinal: ordinal ?? ++ordinalSeq,
  teamA,
  teamB,
  scoreA,
  scoreB,
  played: scoreA != null && scoreB != null,
});
const rowFor = (rows, id) => rows.find((r) => r.id === id);

describe('computeStandings', () => {
  it('gives every player an empty row when nothing is played', () => {
    const rows = computeStandings(P, []);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.gp).toBe(0);
      expect(r.w).toBe(0);
      expect(r.diff).toBe(0);
    }
  });

  it('credits wins, losses and points to singles players', () => {
    const rows = computeStandings(P, [game(['a'], ['b'], 11, 7, 1)]);
    expect(rowFor(rows, 'a')).toMatchObject({ gp: 1, w: 1, l: 0, pf: 11, pa: 7, diff: 4 });
    expect(rowFor(rows, 'b')).toMatchObject({ gp: 1, w: 0, l: 1, pf: 7, pa: 11, diff: -4 });
  });

  it('credits both players on a doubles team individually', () => {
    const rows = computeStandings(P, [game(['a', 'b'], ['c', 'd'], 11, 5, 1)]);
    expect(rowFor(rows, 'a')).toMatchObject({ gp: 1, w: 1, pf: 11, pa: 5 });
    expect(rowFor(rows, 'b')).toMatchObject({ gp: 1, w: 1, pf: 11, pa: 5 });
    expect(rowFor(rows, 'c')).toMatchObject({ gp: 1, l: 1, pf: 5, pa: 11 });
    expect(rowFor(rows, 'd')).toMatchObject({ gp: 1, l: 1, pf: 5, pa: 11 });
  });

  it('ignores unplayed and half-entered games', () => {
    const rows = computeStandings(P, [
      game(['a'], ['b'], null, null, 1),
      { ordinal: 2, teamA: ['a'], teamB: ['c'], scoreA: 11, scoreB: null, played: true },
    ]);
    expect(rowFor(rows, 'a').gp).toBe(0);
  });

  it('records a tie as neither a win nor a loss', () => {
    const rows = computeStandings(P, [game(['a'], ['b'], 9, 9, 1)]);
    expect(rowFor(rows, 'a')).toMatchObject({ gp: 1, w: 0, l: 0, t: 1, diff: 0 });
    expect(rowFor(rows, 'b')).toMatchObject({ gp: 1, w: 0, l: 0, t: 1 });
  });

  it('never counts a sit-out as a game played', () => {
    const rows = computeStandings(P, [
      { ...game(['a'], ['b'], 11, 3, 1), byes: ['c', 'd'] },
    ]);
    expect(rowFor(rows, 'c').gp).toBe(0);
    expect(rowFor(rows, 'd').gp).toBe(0);
  });

  it('skips scores for players who left the roster', () => {
    const rows = computeStandings(P, [game(['a'], ['zz'], 11, 4, 1)]);
    expect(rows).toHaveLength(4);
    expect(rowFor(rows, 'a').w).toBe(1);
  });

  it('sorts by wins first', () => {
    const rows = computeStandings(P, [
      game(['a'], ['b'], 11, 0, 1),
      game(['a'], ['c'], 11, 0, 2),
      game(['b'], ['c'], 11, 0, 3),
    ]);
    expect(rows[0].id).toBe('a'); // 2 wins
    expect(rows[1].id).toBe('b'); // 1 win
  });

  it('breaks a win tie on point differential', () => {
    const rows = computeStandings(P, [
      game(['a'], ['c'], 11, 1, 1), // a: +10
      game(['b'], ['d'], 11, 9, 2), // b: +2
    ]);
    expect(rows[0].id).toBe('a');
    expect(rows[1].id).toBe('b');
  });

  it('breaks a differential tie on points scored', () => {
    const rows = computeStandings(P, [
      game(['a'], ['c'], 15, 10, 1), // a: +5, pf 15
      game(['b'], ['d'], 11, 6, 2),  // b: +5, pf 11
    ]);
    expect(rows[0].id).toBe('a');
  });

  it('falls back to name so the order is stable', () => {
    const rows = computeStandings(
      [{ id: 'z', name: 'Zoe' }, { id: 'y', name: 'Abe' }],
      []
    );
    expect(rows.map((r) => r.name)).toEqual(['Abe', 'Zoe']);
  });

  it('assigns strictly increasing ranks when nobody is level', () => {
    const rows = computeStandings(P, [
      game(['a'], ['b'], 11, 0, 1),
      game(['a'], ['c'], 11, 1, 2),
      game(['b'], ['c'], 11, 2, 3),
      game(['c'], ['d'], 11, 3, 4),
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('shares a rank between level players and skips the ranks they consume', () => {
    // One game: Ana beats Ben. Cal and Dee have not played, so they are exactly
    // level on wins/diff/points and share 2nd; Ben's -9 differential puts him
    // last, at rank 4 rather than 3 (standard competition ranking).
    const rows = computeStandings(P, [game(['a'], ['b'], 11, 2, 1)]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('gives everyone rank 1 before any game is played', () => {
    const rows = computeStandings(P, []);
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });

  it('computes win percentage from decided games only', () => {
    const rows = computeStandings(P, [
      game(['a'], ['b'], 11, 5, 1),
      game(['a'], ['c'], 5, 11, 2),
      game(['a'], ['d'], 7, 7, 3), // tie — excluded from the percentage
    ]);
    expect(rowFor(rows, 'a').winPct).toBe(0.5);
  });

  it('does not mutate the games it is given', () => {
    const games = [game(['a'], ['b'], 11, 5, 1)];
    const snapshot = JSON.parse(JSON.stringify(games));
    computeStandings(P, games);
    expect(games).toEqual(snapshot);
  });
});

describe('currentStreak', () => {
  it('is zero with no results', () => {
    expect(currentStreak([])).toBe(0);
  });

  it('counts a trailing win run as positive', () => {
    expect(currentStreak(['L', 'W', 'W', 'W'])).toBe(3);
  });

  it('counts a trailing loss run as negative', () => {
    expect(currentStreak(['W', 'L', 'L'])).toBe(-2);
  });

  it('resets to zero on a tie', () => {
    expect(currentStreak(['W', 'W', 'T'])).toBe(0);
  });

  it('handles a single result', () => {
    expect(currentStreak(['W'])).toBe(1);
    expect(currentStreak(['L'])).toBe(-1);
  });
});

describe('rankHistory', () => {
  it('is empty when nothing is scored', () => {
    expect(rankHistory(P, [game(['a'], ['b'], null, null, 1)])).toEqual([]);
  });

  it('emits one entry per scored game, in play order', () => {
    const history = rankHistory(P, [
      game(['a'], ['b'], 11, 3, 1),
      game(['c'], ['d'], 11, 3, 2),
    ]);
    expect(history.map((h) => h.ordinal)).toEqual([1, 2]);
    expect(history[0].ranks.a).toBe(1);
  });

  it('tracks a lead changing hands', () => {
    const history = rankHistory(P, [
      game(['b'], ['a'], 11, 0, 1), // Ben leads
      game(['a'], ['c'], 11, 0, 2),
      game(['a'], ['d'], 11, 0, 3), // Ana now has 2 wins
    ]);
    expect(history[0].ranks.b).toBe(1);
    expect(history[2].ranks.a).toBe(1);
  });
});

describe('headToHead', () => {
  it('is empty for a player who has not played', () => {
    expect(headToHead('a', P, [])).toEqual([]);
  });

  it('aggregates results against each opponent', () => {
    const recs = headToHead('a', P, [
      game(['a'], ['b'], 11, 5, 1),
      game(['a'], ['b'], 8, 11, 2),
      game(['a'], ['c'], 11, 9, 3),
    ]);
    const vsB = recs.find((r) => r.id === 'b');
    expect(vsB).toMatchObject({ w: 1, l: 1, pf: 19, pa: 16 });
    expect(recs.find((r) => r.id === 'c')).toMatchObject({ w: 1, l: 0 });
  });

  it('counts both opposing players in a doubles game', () => {
    const recs = headToHead('a', P, [game(['a', 'b'], ['c', 'd'], 11, 4, 1)]);
    expect(recs.map((r) => r.id).sort()).toEqual(['c', 'd']);
    expect(recs.every((r) => r.w === 1)).toBe(true);
  });

  it('sorts by most games played', () => {
    const recs = headToHead('a', P, [
      game(['a'], ['b'], 11, 1, 1),
      game(['a'], ['c'], 11, 1, 2),
      game(['a'], ['c'], 11, 1, 3),
    ]);
    expect(recs[0].id).toBe('c');
  });
});

describe('partnerRecords', () => {
  it('is empty in a singles-only session', () => {
    expect(partnerRecords('a', P, [game(['a'], ['b'], 11, 5, 1)])).toEqual([]);
  });

  it('tracks the record with each partner', () => {
    const recs = partnerRecords('a', P, [
      game(['a', 'b'], ['c', 'd'], 11, 5, 1),
      game(['a', 'c'], ['b', 'd'], 4, 11, 2),
    ]);
    expect(recs.find((r) => r.id === 'b')).toMatchObject({ gp: 1, w: 1, l: 0 });
    expect(recs.find((r) => r.id === 'c')).toMatchObject({ gp: 1, w: 0, l: 1 });
  });

  it('never lists the player as their own partner', () => {
    const recs = partnerRecords('a', P, [game(['a', 'b'], ['c', 'd'], 11, 5, 1)]);
    expect(recs.map((r) => r.id)).not.toContain('a');
  });
});

describe('sessionProgress', () => {
  it('reports nothing for an empty schedule', () => {
    expect(sessionProgress([])).toMatchObject({ total: 0, played: 0, complete: false });
  });

  it('counts played versus remaining', () => {
    expect(
      sessionProgress([
        game(['a'], ['b'], 11, 5, 1),
        game(['a'], ['c'], null, null, 2),
      ])
    ).toMatchObject({ total: 2, played: 1, remaining: 1, complete: false });
  });

  it('flags a finished session', () => {
    expect(sessionProgress([game(['a'], ['b'], 11, 5, 1)])).toMatchObject({ complete: true });
  });
});
