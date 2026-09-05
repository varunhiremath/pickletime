import { describe, it, expect } from 'vitest';
import {
  unpaired,
  isComplete,
  tapPlayer,
  breakTeam,
  fillRemaining,
  drawAll,
  pruneToField,
  draftStatus,
} from './teamDraft.js';

const FIELD = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('unpaired', () => {
  it('lists whoever is not on a team, in field order', () => {
    expect(unpaired(FIELD, [['c', 'a']])).toEqual(['b', 'd', 'e', 'f']);
  });

  it('is everyone when nothing is paired', () => {
    expect(unpaired(FIELD, [])).toEqual(FIELD);
  });

  it('is empty when everyone is paired', () => {
    expect(unpaired(FIELD, [['a', 'b'], ['c', 'd'], ['e', 'f']])).toEqual([]);
  });
});

describe('tapPlayer', () => {
  it('selects on the first tap', () => {
    expect(tapPlayer({ teams: [], selected: null, playerId: 'a' }))
      .toEqual({ teams: [], selected: 'a' });
  });

  it('deselects when the same player is tapped again', () => {
    expect(tapPlayer({ teams: [], selected: 'a', playerId: 'a' }))
      .toEqual({ teams: [], selected: null });
  });

  it('pairs two players and clears the selection', () => {
    const r = tapPlayer({ teams: [], selected: 'a', playerId: 'b' });
    expect(r.teams).toEqual([['a', 'b']]);
    expect(r.selected).toBeNull();
  });

  it('breaks a team up when one of its players is tapped', () => {
    const r = tapPlayer({ teams: [['a', 'b'], ['c', 'd']], selected: null, playerId: 'b' });
    expect(r.teams).toEqual([['c', 'd']]);
  });

  it('leaves the tapped player selected after breaking their team', () => {
    // Swapping one partner should be two taps, not four.
    const r = tapPlayer({ teams: [['a', 'b']], selected: null, playerId: 'a' });
    expect(r.selected).toBe('a');
    const r2 = tapPlayer({ teams: r.teams, selected: r.selected, playerId: 'c' });
    expect(r2.teams).toEqual([['a', 'c']]);
  });

  it('breaks the old team when pairing with somebody already taken', () => {
    // Tapping a taken player frees them; the pairing then needs another tap,
    // which is the honest reading of "I want that person instead".
    const r = tapPlayer({ teams: [['c', 'd']], selected: 'a', playerId: 'c' });
    expect(r.teams).toEqual([]);
    expect(r.selected).toBe('c');
  });

  it('never puts a player on two teams', () => {
    let state = { teams: [], selected: null };
    for (const id of ['a', 'b', 'c', 'd', 'a', 'c']) {
      state = tapPlayer({ ...state, playerId: id });
    }
    const flat = state.teams.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });
});

describe('breakTeam', () => {
  it('removes one team by index', () => {
    expect(breakTeam({ teams: [['a', 'b'], ['c', 'd']], index: 0 })).toEqual([['c', 'd']]);
  });
});

describe('fillRemaining', () => {
  it('pairs up whoever is left', () => {
    const teams = fillRemaining({ playerIds: FIELD, teams: [['a', 'b']], seed: 4 });
    expect(teams).toHaveLength(3);
    expect(teams[0]).toEqual(['a', 'b']); // the hand-picked one survives
    expect(teams.flat().sort()).toEqual([...FIELD].sort());
  });

  it('keeps the teams already entered', () => {
    const fixed = [['c', 'f']];
    const teams = fillRemaining({ playerIds: FIELD, teams: fixed, seed: 9 });
    expect(teams).toContainEqual(['c', 'f']);
  });

  it('is reproducible from the seed', () => {
    expect(fillRemaining({ playerIds: FIELD, teams: [], seed: 2 }))
      .toEqual(fillRemaining({ playerIds: FIELD, teams: [], seed: 2 }));
  });

  it('leaves one player over rather than guessing, with an odd remainder', () => {
    const teams = fillRemaining({ playerIds: ['a', 'b', 'c'], teams: [], seed: 1 });
    expect(teams).toHaveLength(1);
    expect(unpaired(['a', 'b', 'c'], teams)).toHaveLength(1);
  });

  it('does nothing when everyone is already paired', () => {
    const done = [['a', 'b'], ['c', 'd'], ['e', 'f']];
    expect(fillRemaining({ playerIds: FIELD, teams: done, seed: 1 })).toEqual(done);
  });
});

describe('drawAll', () => {
  it('pairs the whole field', () => {
    const teams = drawAll({ playerIds: FIELD, seed: 3 });
    expect(teams).toHaveLength(3);
    expect(teams.flat().sort()).toEqual([...FIELD].sort());
  });

  it('discards anything already entered', () => {
    expect(drawAll({ playerIds: FIELD, seed: 3 })).toEqual(drawAll({ playerIds: FIELD, seed: 3 }));
  });
});

describe('pruneToField', () => {
  it('drops a team whose player left the field', () => {
    const teams = [['a', 'b'], ['c', 'd']];
    expect(pruneToField({ playerIds: ['a', 'b', 'c'], teams })).toEqual([['a', 'b']]);
  });

  it('keeps everything when the field is unchanged', () => {
    const teams = [['a', 'b'], ['c', 'd']];
    expect(pruneToField({ playerIds: FIELD, teams })).toEqual(teams);
  });
});

describe('isComplete', () => {
  it('is true when every player is on a pair', () => {
    expect(isComplete(FIELD, [['a', 'b'], ['c', 'd'], ['e', 'f']])).toBe(true);
  });

  it('is false while anyone is unpaired', () => {
    expect(isComplete(FIELD, [['a', 'b'], ['c', 'd']])).toBe(false);
  });

  it('is false for an odd field, which can never be paired', () => {
    expect(isComplete(['a', 'b', 'c'], [['a', 'b']])).toBe(false);
  });

  it('is false for an empty field', () => {
    expect(isComplete([], [])).toBe(false);
  });
});

describe('draftStatus', () => {
  it('asks for players first', () => {
    expect(draftStatus({ playerIds: [], teams: [] })).toMatchObject({ ok: false });
  });

  it('names the odd-field problem specifically', () => {
    expect(draftStatus({ playerIds: ['a', 'b', 'c'], teams: [] }).message).toMatch(/evenly/);
  });

  it('counts how many are still to pair', () => {
    expect(draftStatus({ playerIds: FIELD, teams: [['a', 'b']] }).message).toBe('4 still to pair.');
  });

  it('reports ready once everyone is paired', () => {
    const s = draftStatus({ playerIds: FIELD, teams: [['a', 'b'], ['c', 'd'], ['e', 'f']] });
    expect(s).toMatchObject({ ok: true });
    expect(s.message).toBe('3 teams ready.');
  });

  it('refuses a field too small for doubles', () => {
    expect(draftStatus({ playerIds: ['a', 'b'], teams: [] })).toMatchObject({ ok: false });
  });
});
