// Pools (groups), for a field too big to sensibly play everyone.
//
// Sixteen players in one round robin is 120 games. Split them into two pools of
// eight and it is 56, and every one of them matters, because the pool decides
// who goes through. That is why real tournaments do it.
//
// **Pools are derived, not stored.** A pool is a connected component of the
// fixture graph: pool play never crosses pools, so "who has a fixture against
// whom" already says which pool somebody is in. No column, no migration, and no
// way for a stored pool to disagree with the games — the same rule the bracket
// line-ups and the fixed-pairs draw follow.
//
// Deliberately free of any import from bracket.js: that module imports this one
// to seed a bracket off pool tables, and a cycle between them would be a real
// problem. Callers pass round-robin games in already filtered.
//
// All pure, so it is tested rather than eyeballed.

/** Pools are named for people, not indexed for computers. */
export const POOL_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** How small a field can be and still be worth splitting. Four a side. */
export const MIN_POOL_FIELD = 8;

/** How many go through from each pool. Two, which is what makes semifinals. */
export const QUALIFY_PER_POOL = 2;

export const poolName = (i) => POOL_NAMES[i] ?? `P${i + 1}`;

/**
 * Deal a field into pools.
 *
 * Alternating rather than slicing in half, so an odd field splits 5/4 rather
 * than 5/4-by-accident — and more importantly so the sizes can never differ by
 * more than one however many pools are asked for.
 *
 * The caller shuffles. This takes the order it is given and deals it, which
 * keeps the randomness in one place (the seeded draw in schedule.js) and leaves
 * this function trivially testable.
 */
export function dealIntoPools(ids = [], count = 2) {
  if (count < 1) return [];
  const out = Array.from({ length: count }, () => []);
  ids.forEach((id, i) => out[i % count].push(id));
  return out;
}

/**
 * Which pool each entrant is in, read off the fixtures themselves.
 *
 * A pool is a connected component: A plays B, B plays C, so A, B and C are in a
 * pool together whether or not A and C have played yet. Half-finished pool play
 * therefore reports the right pools, which matters because the app has to show
 * two tables from the first game onwards.
 *
 * Components of one are dropped. A single entrant with no fixtures is not a
 * pool — they are somebody who was removed from the draw, or a session that has
 * not been generated yet, and calling that "Pool C" would be a lie.
 *
 * Pools come back ordered by their earliest fixture, so the pool containing
 * game 1 is always Pool A. Stable across reloads and identical on every phone,
 * which a Set-iteration order would not be.
 *
 * @param rrGames   round-robin games ONLY, sides already reduced to entrant ids
 * @returns [{ name, ids, ordinal }] — ordinal is the pool's first fixture
 */
export function poolsOf(rrGames = []) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const add = (id) => {
    if (!parent.has(id)) parent.set(id, id);
  };

  const ordered = rrGames.slice().sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  for (const g of ordered) {
    const ids = [...(g.teamA ?? []), ...(g.teamB ?? [])];
    ids.forEach(add);
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  // Earliest fixture per component, so the naming is deterministic.
  const groups = new Map();
  for (const g of ordered) {
    const ids = [...(g.teamA ?? []), ...(g.teamB ?? [])];
    if (ids.length === 0) continue;
    const root = find(ids[0]);
    if (!groups.has(root)) groups.set(root, { ids: new Set(), ordinal: g.ordinal ?? 0 });
    const entry = groups.get(root);
    ids.forEach((id) => entry.ids.add(id));
  }

  return [...groups.values()]
    .filter((g) => g.ids.size > 1)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((g, i) => ({ name: poolName(i), ids: [...g.ids], ordinal: g.ordinal }));
}

/** True when a session is actually being played in pools. */
export const isPooled = (pools) => (pools?.length ?? 0) >= 2;

/**
 * Seed a bracket from pool tables.
 *
 * The order is what makes the semifinals cross over. Returning
 * [A1, B1, A2, B2] means the bracket's ordinary "1 plays 4, 2 plays 3" seeding
 * gives A1 v B2 and B1 v A2 — every semifinal is between pools, and the two
 * pool winners can only meet in the final. That is the whole point of pool
 * play, and it falls out of the existing bracket table rather than needing a
 * shape of its own.
 *
 * Returns [] unless every pool can supply its full quota, because a bracket
 * seeded from a pool that is one player short is not the tournament anybody
 * entered.
 *
 * @param tables  per-pool standings, already sorted, in pool order
 */
export function seedFromPools(tables = [], perPool = QUALIFY_PER_POOL) {
  if (tables.length < 2) return [];
  if (tables.some((t) => (t?.length ?? 0) < perPool)) return [];

  const out = [];
  for (let rank = 0; rank < perPool; rank++) {
    for (let p = 0; p < tables.length; p++) {
      out.push({ ...tables[p][rank], pool: poolName(p), poolRank: rank + 1 });
    }
  }
  return out;
}

/** "Pool A winner", "Pool B runner-up" — how a seed is described in words. */
export function poolSeedLabel(row) {
  if (!row?.pool) return null;
  const place =
    row.poolRank === 1 ? 'winner' : row.poolRank === 2 ? 'runner-up' : `#${row.poolRank}`;
  return `Pool ${row.pool} ${place}`;
}

/** "A1", "B2" — the same thing in the space a chip has. */
export function poolSeedShort(row) {
  return row?.pool ? `${row.pool}${row.poolRank}` : null;
}
