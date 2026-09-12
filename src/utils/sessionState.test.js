import { describe, it, expect } from 'vitest';
import { unplayedCount, isSessionOver, endedEarly, sessionOutcome } from './sessionState.js';

const live = { id: 's1', status: 'live' };
const final = { id: 's1', status: 'final' };
const played = (n) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, played: true }));
const unplayed = (n) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, played: false }));

describe('unplayedCount', () => {
  it('counts fixtures with no result', () => {
    expect(unplayedCount([...played(3), ...unplayed(2)])).toBe(2);
  });

  it('is zero for a finished card', () => {
    expect(unplayedCount(played(4))).toBe(0);
  });

  it('handles an empty or missing list', () => {
    expect(unplayedCount([])).toBe(0);
    expect(unplayedCount()).toBe(0);
  });

  it('treats a row with no played flag as unplayed', () => {
    expect(unplayedCount([{ id: 'g1' }, null])).toBe(2);
  });
});

describe('isSessionOver', () => {
  it('is false while a fixture is unplayed', () => {
    expect(isSessionOver({ session: live, games: [...played(9), ...unplayed(1)] })).toBe(false);
  });

  it('is true once every fixture has a score', () => {
    expect(isSessionOver({ session: live, games: played(10) })).toBe(true);
  });

  it('needs no write to become true — the games alone decide it', () => {
    // The same session row, still marked live, flips purely on the games.
    expect(isSessionOver({ session: live, games: unplayed(1) })).toBe(false);
    expect(isSessionOver({ session: live, games: played(1) })).toBe(true);
  });

  it('is true when an admin ended it early', () => {
    expect(isSessionOver({ session: final, games: [...played(6), ...unplayed(4)] })).toBe(true);
  });

  it('is false for a session with no fixtures yet', () => {
    expect(isSessionOver({ session: live, games: [] })).toBe(false);
  });

  it('is still true for an empty session an admin finished', () => {
    expect(isSessionOver({ session: final, games: [] })).toBe(true);
  });

  it('is false with no session', () => {
    expect(isSessionOver({ session: null, games: played(4) })).toBe(false);
    expect(isSessionOver()).toBe(false);
  });

  it('does not count a half-finished best-of-three as played', () => {
    // A match one set in is unplayed — see utils/sets.js — so a session
    // waiting on its third set is not over.
    const partial = { id: 'g1', played: false, setsA: [11], setsB: [7] };
    expect(isSessionOver({ session: live, games: [...played(3), partial] })).toBe(false);
  });
});

describe('endedEarly', () => {
  it('is true when an admin finished it with games left', () => {
    expect(endedEarly({ session: final, games: [...played(6), ...unplayed(4)] })).toBe(true);
  });

  it('is false when it is final because everything was played', () => {
    expect(endedEarly({ session: final, games: played(10) })).toBe(false);
  });

  it('is false for a live session', () => {
    expect(endedEarly({ session: live, games: [...played(6), ...unplayed(4)] })).toBe(false);
  });

  it('is false with no session', () => {
    expect(endedEarly()).toBe(false);
  });
});

describe('sessionOutcome', () => {
  it('names the champion when there was a bracket', () => {
    expect(sessionOutcome({ bracket: { champion: { name: 'Varun & Srinath' }, standings: [] } }))
      .toEqual({ name: 'Varun & Srinath', kind: 'champion' });
  });

  it('names whoever topped the table when there was no bracket', () => {
    expect(sessionOutcome({ bracket: { champion: null, standings: [{ name: 'Hari', gp: 4, w: 3 }] } }))
      .toEqual({ name: 'Hari', kind: 'table', wins: 3 });
  });

  it('prefers the champion over the table leader', () => {
    const out = sessionOutcome({
      bracket: { champion: { name: 'Rahul' }, standings: [{ name: 'Hari', gp: 4, w: 4 }] },
    });
    expect(out.name).toBe('Rahul');
  });

  it('crowns nobody when nothing was played', () => {
    expect(sessionOutcome({ bracket: { champion: null, standings: [{ name: 'Hari', gp: 0, w: 0 }] } }))
      .toBeNull();
    expect(sessionOutcome({ bracket: { champion: null, standings: [] } })).toBeNull();
  });

  it('handles a missing bracket', () => {
    expect(sessionOutcome({})).toBeNull();
    expect(sessionOutcome()).toBeNull();
  });
});
