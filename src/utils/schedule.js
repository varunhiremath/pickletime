// Schedule generation.
//
// Ported from the original PickleTime app.js, with two changes:
//   1. tie-breaks are driven by a seeded RNG instead of Math.random(), so a
//      schedule is reproducible from its seed (and therefore testable). The old
//      code also used Math.random() inside a sort comparator, which is not a
//      consistent comparator and can produce implementation-defined orderings.
//   2. both formats understand multiple courts, so a group with 8 players and
//      2 nets can actually play two games at once.
//
// Everything here is pure: ids in, games out. No DB, no DOM, no clock.

import { mulberry32, shuffle } from './rng.js';

export const FORMATS = {
  SINGLES: 'singles',
  AMERICANO: 'doubles_americano',
};

function makeGame({ ordinal, round, teamA, teamB, byes }) {
  return {
    ordinal,
    round,
    court: 1, // assigned by assignCourts()
    teamA,
    teamB,
    byes,
    scoreA: null,
    scoreB: null,
    played: false,
  };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Singles round robin via the circle method: everyone plays everyone exactly
 * once. With an odd number of players a phantom player creates a rotating bye,
 * so sit-outs are spread evenly rather than always landing on the same person.
 */
export function generateSingles(playerIds) {
  if (playerIds.length < 2) return [];

  let ids = playerIds.slice();
  if (ids.length % 2 === 1) ids.push(null); // phantom player == the bye

  const n = ids.length;
  const arr = ids.slice();
  const games = [];
  let ordinal = 1;

  for (let r = 0; r < n - 1; r++) {
    const sittingOut = [];
    const roundGames = [];

    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null) sittingOut.push(b);
      else if (b === null) sittingOut.push(a);
      else roundGames.push([a, b]);
    }

    for (const [a, b] of roundGames) {
      games.push(makeGame({ ordinal: ordinal++, round: r + 1, teamA: [a], teamB: [b], byes: sittingOut }));
    }

    // Rotate everyone except the first element — the circle method.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return games;
}

/**
 * Doubles "Americano": partners and opponents rotate every game, and sit-outs
 * are spread evenly. Each round seats the least-played players first, then
 * picks the team split that best avoids repeating a partnership.
 *
 * @param playerIds  every player in the session
 * @param numGames   total games to schedule
 * @param courts     how many games run concurrently per round
 * @param seed       RNG seed; the same seed always yields the same schedule
 */
export function generateAmericano(playerIds, { numGames = 8, courts = 1, seed = 1 } = {}) {
  if (playerIds.length < 4 || numGames < 1) return [];

  const rng = mulberry32(seed);
  const played = new Map(playerIds.map((id) => [id, 0]));
  const partnered = new Map();
  const opposed = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const countOf = (map, a, b) => map.get(pairKey(a, b)) ?? 0;

  const games = [];
  let round = 1;
  let ordinal = 1;

  while (games.length < numGames) {
    // Shuffle first, then sort by games played. The shuffle is the seeded
    // tie-break; sorting afterwards keeps the comparator consistent (the bug in
    // the original was randomising *inside* the comparator).
    const queue = shuffle(playerIds, rng).sort((a, b) => played.get(a) - played.get(b));

    const gamesThisRound = Math.min(
      courts,
      Math.floor(playerIds.length / 4),
      numGames - games.length
    );
    if (gamesThisRound === 0) break;

    const seated = new Set();
    const roundGames = [];

    for (let c = 0; c < gamesThisRound; c++) {
      const four = queue.filter((id) => !seated.has(id)).slice(0, 4);
      if (four.length < 4) break;

      // Three ways to split four players into two pairs. Prefer the split that
      // repeats a partnership least; a repeat partner costs 3x a repeat opponent
      // because playing *with* someone twice is the more noticeable repetition.
      const splits = [
        [[four[0], four[1]], [four[2], four[3]]],
        [[four[0], four[2]], [four[1], four[3]]],
        [[four[0], four[3]], [four[1], four[2]]],
      ];

      let best = splits[0];
      let bestCost = Infinity;
      for (const [t1, t2] of splits) {
        let cost = countOf(partnered, t1[0], t1[1]) * 3 + countOf(partnered, t2[0], t2[1]) * 3;
        for (const x of t1) for (const y of t2) cost += countOf(opposed, x, y);
        if (cost < bestCost) {
          bestCost = cost;
          best = [t1, t2];
        }
      }

      const [teamA, teamB] = best;
      roundGames.push({ teamA, teamB });
      four.forEach((id) => seated.add(id));

      four.forEach((id) => played.set(id, played.get(id) + 1));
      bump(partnered, pairKey(teamA[0], teamA[1]));
      bump(partnered, pairKey(teamB[0], teamB[1]));
      for (const x of teamA) for (const y of teamB) bump(opposed, pairKey(x, y));
    }

    if (roundGames.length === 0) break;

    const byes = playerIds.filter((id) => !seated.has(id));
    for (const { teamA, teamB } of roundGames) {
      games.push(makeGame({ ordinal: ordinal++, round, teamA, teamB, byes }));
    }
    round++;
  }

  return games;
}

/**
 * The one entry point the app uses. Returns games with courts assigned.
 */
export function generateSchedule({ format, playerIds, numGames = 8, courts = 1, seed = 1 }) {
  const games =
    format === FORMATS.SINGLES
      ? generateSingles(playerIds)
      : generateAmericano(playerIds, { numGames, courts, seed });
  return assignCourts(games, courts);
}

/**
 * Spread each round's games across the available courts. Games within a round
 * are concurrent, so they get different courts; the next round starts over at 1.
 * Mutates nothing — returns new game objects.
 */
export function assignCourts(games, courts = 1) {
  const n = Math.max(1, courts);
  let currentRound = null;
  let indexInRound = 0;

  return games.map((g) => {
    if (g.round !== currentRound) {
      currentRound = g.round;
      indexInRound = 0;
    }
    const court = (indexInRound % n) + 1;
    indexInRound++;
    return { ...g, court };
  });
}

/** Rough "how many games will each player get" for the setup screen. */
export function gamesPerPlayer({ format, playerCount, numGames }) {
  if (playerCount < 2) return 0;
  if (format === FORMATS.SINGLES) return playerCount - 1;
  return (numGames * 4) / playerCount;
}
