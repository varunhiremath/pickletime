import { describe, it, expect } from 'vitest';
import { resolveBracket, buildBracketGames, SHAPES } from './bracket.js';
import { bracketTree, bracketTreeLines, seedsOf, seedLabel } from './bracketTree.js';

const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

let n = 0;
const rr = (teamA, teamB, scoreA, scoreB) => ({
  id: `rr${++n}`, ordinal: n, round: 1, court: 1, stage: 'rr',
  teamA, teamB, byes: [], scoreA, scoreB, played: scoreA != null,
});
const ko = (slot, teamA = [], teamB = [], scoreA = null, scoreB = null) => ({
  id: slot, ordinal: 100, round: 9, court: 1,
  stage: slot === 'sf1' || slot === 'sf2' ? 'sf' : slot,
  slot, teamA, teamB, byes: [], scoreA, scoreB, played: scoreA != null,
});

// A → B → C → D, so the seeding is 1 A, 2 B, 3 C, 4 D.
const roundRobin = () => {
  n = 0;
  return [
    rr(['a'], ['b'], 11, 5), rr(['a'], ['c'], 11, 6), rr(['a'], ['d'], 11, 3),
    rr(['b'], ['c'], 11, 8), rr(['b'], ['d'], 11, 6), rr(['c'], ['d'], 11, 7),
  ];
};

const nameOf = (ids) => ids.map((id) => PLAYERS.find((p) => p.id === id)?.name ?? '—').join(' & ');
const build = (games) => resolveBracket(PLAYERS, games);
const lines = (games) => bracketTreeLines({ bracket: build(games), nameOf });

describe('seedsOf', () => {
  const standings = [
    { id: 'x', rank: 1, playerIds: ['a', 'b'] },
    { id: 'y', rank: 2, playerIds: ['c', 'd'] },
  ];

  it('finds the seed of the entrant a side belongs to', () => {
    expect(seedsOf(['c', 'd'], standings)).toEqual([2]);
  });

  it('reports one seed per entrant, not one per player', () => {
    expect(seedsOf(['a', 'b'], standings)).toEqual([1]);
  });

  it('reports both seeds when a side spans two entrants', () => {
    // The Americano final: seeds 1 and 2 playing together for one game.
    expect(seedsOf(['a', 'c'], standings)).toEqual([1, 2]);
  });

  it('keeps both seeds when two players finished level', () => {
    // Joint 2nd is two people. Collapsing them to one "(2)" would show a
    // partnership as though it were a single entrant.
    const joint = [
      { id: 'a', rank: 1, playerIds: ['a'] },
      { id: 'b', rank: 2, playerIds: ['b'] },
      { id: 'c', rank: 2, playerIds: ['c'] },
    ];
    expect(seedsOf(['b', 'c'], joint)).toEqual([2, 2]);
  });

  it('is empty for a side nobody in the table played', () => {
    expect(seedsOf(['zz'], standings)).toEqual([]);
  });

  it('is empty for an empty side', () => {
    expect(seedsOf([], standings)).toEqual([]);
    expect(seedsOf(undefined, standings)).toEqual([]);
  });
});

describe('seedLabel', () => {
  it('brackets a single seed', () => {
    expect(seedLabel([3])).toBe('(3)');
  });

  it('joins a partnership with a plus', () => {
    expect(seedLabel([1, 4])).toBe('(1+4)');
  });

  it('is empty when the seed is unknown', () => {
    expect(seedLabel([])).toBe('');
    expect(seedLabel()).toBe('');
  });
});

describe('bracketTree', () => {
  it('is empty when the session has no playoffs', () => {
    expect(bracketTree({ bracket: build(roundRobin()), nameOf })).toEqual([]);
  });

  it('has one node per fixture, in play order', () => {
    const games = [...roundRobin(), ko('sf1'), ko('sf2'), ko('bronze'), ko('final')];
    expect(bracketTree({ bracket: build(games), nameOf }).map((t) => t.slot))
      .toEqual(['sf1', 'sf2', 'bronze', 'final']);
  });

  it('carries the seeds each side came in on', () => {
    const games = [...roundRobin(), ko('sf1'), ko('sf2'), ko('bronze'), ko('final')];
    const sf1 = bracketTree({ bracket: build(games), nameOf })[0];
    expect(sf1.sides.map((s) => s.seeds)).toEqual([[1], [4]]);
  });

  it('names who advanced and what the win was worth', () => {
    const games = [...roundRobin(), ko('sf1', ['a'], ['d'], 11, 4)];
    const sf1 = bracketTree({ bracket: build(games), nameOf })[0];
    expect(sf1.advances).toBe('A');
    expect(sf1.advanceNote).toBe('into the final');
    expect(sf1.medal).toBeNull();
  });

  it('gives the final and the third-place game their medals', () => {
    const games = [
      ...roundRobin(),
      ko('sf1', ['a'], ['d'], 11, 4), ko('sf2', ['b'], ['c'], 11, 7),
      ko('bronze', ['d'], ['c'], 11, 5), ko('final', ['a'], ['b'], 11, 9),
    ];
    const byslot = Object.fromEntries(
      bracketTree({ bracket: build(games), nameOf }).map((t) => [t.slot, t])
    );
    expect(byslot.final.medal).toBe('🏆');
    expect(byslot.final.advanceNote).toBe('champions');
    expect(byslot.bronze.medal).toBe('🥉');
    expect(byslot.bronze.advanceNote).toBe('third place');
  });

  it('marks the winning side, whichever side it is', () => {
    const games = [...roundRobin(), ko('sf1', ['a'], ['d'], 4, 11)];
    const sf1 = bracketTree({ bracket: build(games), nameOf })[0];
    expect(sf1.sides.map((s) => s.won)).toEqual([false, true]);
  });

  it('gives a drawn fixture no winner at all', () => {
    const games = [...roundRobin(), ko('sf1', ['a'], ['d'], 11, 11)];
    const sf1 = bracketTree({ bracket: build(games), nameOf })[0];
    expect(sf1.drawn).toBe(true);
    expect(sf1.advances).toBeNull();
    expect(sf1.sides.every((s) => !s.won)).toBe(true);
  });

  it('leaves an unplayed fixture with no scores and no winner', () => {
    const games = [...roundRobin(), ko('sf1'), ko('sf2'), ko('bronze'), ko('final')];
    const final = bracketTree({ bracket: build(games), nameOf })[3];
    expect(final.played).toBe(false);
    expect(final.advances).toBeNull();
  });
});

describe('bracketTreeLines', () => {
  const full = () => [
    ...roundRobin(),
    ko('sf1', ['a'], ['d'], 11, 4),
    ko('sf2', ['b'], ['c'], 7, 11),
    ko('bronze', ['d'], ['b'], 5, 11),
    ko('final', ['a'], ['c'], 9, 11),
  ];

  it('is empty when nothing in the bracket has been played', () => {
    const games = [...roundRobin(), ko('sf1'), ko('sf2'), ko('bronze'), ko('final')];
    expect(lines(games)).toEqual([]);
  });

  it('is empty when there is no bracket', () => {
    expect(lines(roundRobin())).toEqual([]);
  });

  it('writes each fixture winner-first, with seeds', () => {
    const out = lines(full());
    expect(out).toContain('Semifinal 1: (1) A 11–4 (4) D');
    // B lost this one, so C leads the line even though B was team A.
    expect(out).toContain('Semifinal 2: (3) C 11–7 (2) B');
  });

  it('says what each win was worth', () => {
    const out = lines(full());
    expect(out).toContain('   ↳ A into the final');
    expect(out).toContain('   ↳ 🏆 C champions');
    expect(out).toContain('   ↳ 🥉 B third place');
  });

  it('keeps the fixtures in play order, semifinals before the final', () => {
    const out = lines(full());
    expect(out.findIndex((l) => l.startsWith('Semifinal 1')))
      .toBeLessThan(out.findIndex((l) => l.startsWith('Final:')));
  });

  it('lists what is still outstanding', () => {
    const games = [...roundRobin(), ko('sf1', ['a'], ['d'], 11, 4), ko('sf2'), ko('bronze'), ko('final')];
    expect(lines(games)).toContain('Still to play: Semifinal 2, 3rd place, Final');
  });

  it('flags a fixture entered level instead of promoting somebody', () => {
    const games = [...roundRobin(), ko('sf1', ['a'], ['d'], 11, 11)];
    const out = lines(games);
    expect(out.some((l) => l.includes('(tied)'))).toBe(true);
    expect(out).toContain('   ↳ level — nobody goes through until it is corrected');
  });

  it('never pads for alignment — group chats are proportional', () => {
    // Two consecutive spaces would only ever be there to line a column up, and
    // would arrive ragged. The three-space indent on a "↳" line is structure at
    // the start of the line, which survives.
    for (const line of lines(full())) {
      expect(line.replace(/^ {3}↳ /, '')).not.toMatch(/ {2}/);
    }
  });

  it('handles the one-game Americano finish, seeds and all', () => {
    // Seeds 1 & 4 against 2 & 3 — a partnership that exists for this one game.
    const games = [...roundRobin(), ...buildBracketGames({ shape: SHAPES.FINAL_ONLY })
      .map((g) => ({ ...g, id: 'final', slot: 'final', teamA: ['a', 'd'], teamB: ['b', 'c'], scoreA: 11, scoreB: 8, played: true }))];
    const out = lines(games);
    expect(out).toContain('Final: (1+4) A & D 11–8 (2+3) B & C');
    expect(out).toContain('   ↳ 🏆 A & D champions');
  });
});
