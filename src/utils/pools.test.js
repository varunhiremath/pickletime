import { describe, it, expect } from 'vitest';
import {
  POOL_NAMES,
  MIN_POOL_FIELD,
  poolName,
  dealIntoPools,
  poolsOf,
  isPooled,
  seedFromPools,
  poolSeedLabel,
  poolSeedShort,
} from './pools.js';

/** A round-robin game as the bracket sees one: sides already entrant ids. */
const g = (ordinal, a, b) => ({ ordinal, teamA: [a], teamB: [b] });

describe('poolName', () => {
  it('names the first pools with letters', () => {
    expect(poolName(0)).toBe('A');
    expect(poolName(1)).toBe('B');
    expect(POOL_NAMES[0]).toBe('A');
  });

  it('falls back rather than returning undefined', () => {
    expect(poolName(99)).toBe('P100');
  });
});

describe('dealIntoPools', () => {
  it('splits an even field in half', () => {
    expect(dealIntoPools(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('never lets two pools differ by more than one', () => {
    for (let n = 8; n <= 21; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const [a, b] = dealIntoPools(ids, 2);
      expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);
      expect(a.length + b.length).toBe(n);
    }
  });

  it('loses nobody', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
    expect(dealIntoPools(ids, 2).flat().sort()).toEqual(ids.slice().sort());
  });

  it('handles more than two pools', () => {
    expect(dealIntoPools(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([
      ['a', 'd'],
      ['b', 'e'],
      ['c'],
    ]);
  });

  it('returns nothing for a nonsense count', () => {
    expect(dealIntoPools(['a', 'b'], 0)).toEqual([]);
    expect(dealIntoPools([], 2)).toEqual([[], []]);
  });
});

describe('poolsOf', () => {
  it('finds two pools that never play each other', () => {
    // A: a,b,c   B: d,e,f
    const games = [
      g(1, 'a', 'b'), g(2, 'd', 'e'),
      g(3, 'a', 'c'), g(4, 'd', 'f'),
      g(5, 'b', 'c'), g(6, 'e', 'f'),
    ];
    const pools = poolsOf(games);
    expect(pools.map((p) => p.name)).toEqual(['A', 'B']);
    expect(pools[0].ids.sort()).toEqual(['a', 'b', 'c']);
    expect(pools[1].ids.sort()).toEqual(['d', 'e', 'f']);
  });

  it('groups by connection, not by having played everyone', () => {
    // Half-finished pool play still reports the right pools: a has not met c.
    const pools = poolsOf([g(1, 'a', 'b'), g(2, 'd', 'e'), g(3, 'b', 'c')]);
    expect(pools[0].ids.sort()).toEqual(['a', 'b', 'c']);
    expect(pools[1].ids.sort()).toEqual(['d', 'e']);
  });

  it('names the pool holding game 1 "A", whatever order the games arrive in', () => {
    const games = [g(5, 'b', 'c'), g(2, 'd', 'e'), g(1, 'a', 'b'), g(4, 'd', 'f')];
    const pools = poolsOf(games);
    expect(pools[0].name).toBe('A');
    expect(pools[0].ids).toContain('a');
    expect(pools[1].ids).toContain('d');
  });

  it('reports one pool for an ordinary single round robin', () => {
    const pools = poolsOf([g(1, 'a', 'b'), g(2, 'a', 'c'), g(3, 'b', 'c')]);
    expect(pools).toHaveLength(1);
    expect(isPooled(pools)).toBe(false);
  });

  it('ignores an entrant with no fixtures rather than calling them a pool', () => {
    // 'z' appears nowhere: removed from the draw, not a pool of one.
    const pools = poolsOf([g(1, 'a', 'b'), g(2, 'd', 'e')]);
    expect(pools).toHaveLength(2);
    expect(pools.flatMap((p) => p.ids)).not.toContain('z');
  });

  it('handles no games at all', () => {
    expect(poolsOf([])).toEqual([]);
    expect(poolsOf()).toEqual([]);
    expect(isPooled([])).toBe(false);
  });

  it('links every id on a side, so a doubles fixture keeps its four together', () => {
    const pools = poolsOf([{ ordinal: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] }]);
    expect(pools).toHaveLength(1);
    expect(pools[0].ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is stable: the same games give the same names every time', () => {
    const games = [g(1, 'a', 'b'), g(2, 'd', 'e'), g(3, 'b', 'c'), g(4, 'e', 'f')];
    const once = poolsOf(games).map((p) => `${p.name}:${p.ids.slice().sort().join()}`);
    const twice = poolsOf(games.slice().reverse()).map(
      (p) => `${p.name}:${p.ids.slice().sort().join()}`
    );
    expect(once).toEqual(twice);
  });
});

describe('seedFromPools', () => {
  const A = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
  const B = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }];

  it('interleaves winners then runners-up, so the semifinals cross over', () => {
    const seeds = seedFromPools([A, B]);
    expect(seeds.map((s) => s.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('makes the bracket seeding produce cross-pool semifinals', () => {
    // The bracket plays index 0 v 3 and 1 v 2. With this order that is
    // A1 v B2 and B1 v A2 — never two from the same pool.
    const s = seedFromPools([A, B]);
    expect([s[0].pool, s[3].pool]).toEqual(['A', 'B']);
    expect([s[1].pool, s[2].pool]).toEqual(['B', 'A']);
  });

  it('tags each seed with its pool and rank', () => {
    const [first, second] = seedFromPools([A, B]);
    expect(first).toMatchObject({ id: 'a1', pool: 'A', poolRank: 1 });
    expect(second).toMatchObject({ id: 'b1', pool: 'B', poolRank: 1 });
  });

  it('refuses when a pool cannot fill its quota', () => {
    expect(seedFromPools([A, [{ id: 'b1' }]])).toEqual([]);
    expect(seedFromPools([[], B])).toEqual([]);
  });

  it('refuses with fewer than two pools', () => {
    expect(seedFromPools([A])).toEqual([]);
    expect(seedFromPools([])).toEqual([]);
    expect(seedFromPools()).toEqual([]);
  });

  it('does not mutate the tables it was given', () => {
    const table = [{ id: 'a1' }, { id: 'a2' }];
    seedFromPools([table, [{ id: 'b1' }, { id: 'b2' }]]);
    expect(table[0]).toEqual({ id: 'a1' });
  });

  it('can take more than two through', () => {
    const seeds = seedFromPools([A, B], 3);
    expect(seeds.map((s) => s.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
  });
});

describe('poolSeedLabel / poolSeedShort', () => {
  it('says winner and runner-up rather than 1 and 2', () => {
    expect(poolSeedLabel({ pool: 'A', poolRank: 1 })).toBe('Pool A winner');
    expect(poolSeedLabel({ pool: 'B', poolRank: 2 })).toBe('Pool B runner-up');
  });

  it('falls back to a number deeper down', () => {
    expect(poolSeedLabel({ pool: 'A', poolRank: 3 })).toBe('Pool A #3');
  });

  it('shortens to what fits on a chip', () => {
    expect(poolSeedShort({ pool: 'A', poolRank: 1 })).toBe('A1');
    expect(poolSeedShort({ pool: 'B', poolRank: 2 })).toBe('B2');
  });

  it('is null for a row from an unpooled session', () => {
    expect(poolSeedLabel({ id: 'x' })).toBeNull();
    expect(poolSeedShort({ id: 'x' })).toBeNull();
    expect(poolSeedLabel()).toBeNull();
    expect(poolSeedShort()).toBeNull();
  });
});

describe('MIN_POOL_FIELD', () => {
  it('is eight — four a side', () => {
    expect(MIN_POOL_FIELD).toBe(8);
  });
});
