import { describe, it, expect } from 'vitest';
import {
  BEST_OF, SETS_TO_WIN, isMultiSet, setPairs, setsWon, aggregate,
  winnerOf, isDecided, displayScore, setsLine, normaliseSets, draftFrom, emptyDraft,
} from './sets.js';

const single = (a, b) => ({ scoreA: a, scoreB: b, played: a != null && b != null });
const sets = (a, b) => ({ setsA: a, setsB: b });

describe('isMultiSet', () => {
  it('is true once a game has sets on it', () => {
    expect(isMultiSet(sets([11], [9]))).toBe(true);
  });

  it('is false for a single game, however it is shaped', () => {
    expect(isMultiSet(single(11, 9))).toBe(false);
    expect(isMultiSet({ setsA: [], setsB: [] })).toBe(false);
    expect(isMultiSet({})).toBe(false);
    expect(isMultiSet()).toBe(false);
  });
});

describe('setPairs', () => {
  it('pairs the two arrays up', () => {
    expect(setPairs(sets([11, 9, 11], [9, 11, 7]))).toEqual([[11, 9], [9, 11], [11, 7]]);
  });

  it('skips a set with only one score typed', () => {
    // Half a set is not a set, and counting it would hand a win to whoever
    // typed first.
    expect(setPairs(sets([11, 9], [9, null]))).toEqual([[11, 9]]);
  });

  it('is empty for a single game', () => {
    expect(setPairs(single(11, 9))).toEqual([]);
  });
});

describe('setsWon', () => {
  it('counts sets, not points', () => {
    expect(setsWon(sets([11, 5, 11], [9, 11, 9]))).toEqual({ a: 2, b: 1 });
  });

  it('gives a level set to neither side', () => {
    expect(setsWon(sets([11, 10], [11, 5]))).toEqual({ a: 1, b: 0 });
  });
});

describe('aggregate', () => {
  it('totals the points across the sets', () => {
    expect(aggregate(sets([11, 5, 11], [9, 11, 9]))).toEqual({ a: 27, b: 29 });
  });

  it('is zero for a game with no sets', () => {
    expect(aggregate(single(11, 9))).toEqual({ a: 0, b: 0 });
  });
});

describe('winnerOf', () => {
  it('is the side that won two sets, even with fewer points', () => {
    // 27 points to 29, and A takes it 2–1. This is the whole reason the rest of
    // the app cannot decide a winner by comparing totals.
    const g = sets([11, 5, 11], [9, 11, 9]);
    expect(aggregate(g)).toEqual({ a: 27, b: 29 });
    expect(winnerOf(g)).toBe('a');
  });

  it('is null after one set — a lead is not a win', () => {
    expect(winnerOf(sets([11], [9]))).toBeNull();
  });

  it('is null at one set all', () => {
    expect(winnerOf(sets([11, 5], [9, 11]))).toBeNull();
  });

  it('decides a straight-sets win in two', () => {
    expect(winnerOf(sets([11, 11], [9, 7]))).toBe('a');
    expect(winnerOf(sets([9, 7], [11, 11]))).toBe('b');
  });

  it('decides a single game by its score', () => {
    expect(winnerOf(single(11, 9))).toBe('a');
    expect(winnerOf(single(9, 11))).toBe('b');
  });

  it('refuses to pick a winner from a level single game', () => {
    expect(winnerOf(single(11, 11))).toBeNull();
  });

  it('is null for an unscored game', () => {
    expect(winnerOf(single(null, null))).toBeNull();
    expect(winnerOf({})).toBeNull();
    expect(winnerOf()).toBeNull();
  });

  it('needs a majority of sets, not just the most', () => {
    expect(SETS_TO_WIN).toBe(2);
    expect(BEST_OF).toBe(3);
  });
});

describe('isDecided', () => {
  it('follows the winner', () => {
    expect(isDecided(sets([11, 11], [9, 7]))).toBe(true);
    expect(isDecided(sets([11], [9]))).toBe(false);
    expect(isDecided(single(11, 9))).toBe(true);
  });
});

describe('displayScore', () => {
  it('shows sets won for a set match', () => {
    expect(displayScore(sets([11, 5, 11], [9, 11, 9]))).toEqual({ a: 2, b: 1 });
  });

  it('shows points for a single game', () => {
    expect(displayScore(single(11, 9))).toEqual({ a: 11, b: 9 });
  });

  it('is blank rather than zero for an unplayed game', () => {
    expect(displayScore(single(null, null))).toEqual({ a: null, b: null });
  });
});

describe('setsLine', () => {
  it('writes the sets out in order', () => {
    expect(setsLine(sets([11, 5, 11], [9, 11, 9]))).toBe('11–9, 5–11, 11–9');
  });

  it('is empty for a single game', () => {
    expect(setsLine(single(11, 9))).toBe('');
  });
});

describe('normaliseSets', () => {
  const draft = (...rows) => rows.map(([a, b]) => ({ a, b }));

  it('keeps a decided three-setter', () => {
    expect(normaliseSets(draft(['11', '9'], ['5', '11'], ['11', '9'])))
      .toEqual({ ok: true, setsA: [11, 5, 11], setsB: [9, 11, 9] });
  });

  it('drops a trailing blank set on a straight-sets win', () => {
    // Won 2–0, so there is no third set. Storing an empty one would make a
    // finished match look unfinished.
    expect(normaliseSets(draft(['11', '9'], ['11', '7'], ['', ''])))
      .toEqual({ ok: true, setsA: [11, 11], setsB: [9, 7] });
  });

  it('refuses a gap in the middle rather than closing it up', () => {
    const r = normaliseSets(draft(['11', '9'], ['', ''], ['11', '7']));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Set 2/);
  });

  it('refuses a half-typed set', () => {
    expect(normaliseSets(draft(['11', '9'], ['11', ''])).ok).toBe(false);
  });

  it('refuses a match nobody has won yet', () => {
    const r = normaliseSets(draft(['11', '9'], ['5', '11']));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/2 sets/);
  });

  it('refuses an empty draft', () => {
    expect(normaliseSets(emptyDraft()).ok).toBe(false);
    expect(normaliseSets([]).ok).toBe(false);
  });

  it('refuses negative and fractional scores', () => {
    expect(normaliseSets(draft(['-1', '9'], ['11', '7'])).ok).toBe(false);
    expect(normaliseSets(draft(['11.5', '9'], ['11', '7'])).ok).toBe(false);
  });

  it('refuses more sets than the match has', () => {
    const four = [['11', '9'], ['11', '9'], ['11', '9'], ['11', '9']].map(([a, b]) => ({ a, b }));
    expect(normaliseSets(four).ok).toBe(false);
  });
});

describe('draftFrom', () => {
  it('fills the rows a stored match already has', () => {
    expect(draftFrom(sets([11, 5], [9, 11])))
      .toEqual([{ a: '11', b: '9' }, { a: '5', b: '11' }, { a: '', b: '' }]);
  });

  it('is empty for a single game', () => {
    expect(draftFrom(single(11, 9))).toEqual(emptyDraft());
  });
});
