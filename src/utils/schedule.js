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
import { STAGE, BRACKET_SIZE, SHAPES, buildBracketGames } from './bracket.js';

export const FORMATS = {
  SINGLES: 'singles',
  AMERICANO: 'doubles_americano',
  // Fixed partners for the whole session, drawn at random. The unit being
  // ranked is the TEAM, not the player — see utils/entrants.js.
  PAIRS: 'doubles_pairs',
};

/** Formats whose entrants are teams rather than individuals. */
export const isTeamFormat = (format) => format === FORMATS.PAIRS;

function makeGame({ ordinal, round, teamA, teamB, byes }) {
  return {
    ordinal,
    round,
    court: 1, // assigned by assignCourts()
    stage: STAGE.RR,
    slot: null,
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
 * Round robin via the circle method: every entry plays every other exactly
 * once. With an odd number of entries a phantom entry creates a rotating bye,
 * so sit-outs are spread evenly rather than always landing on the same one.
 *
 * Deliberately generic over what an "entry" is. In singles it is one player id;
 * in fixed-pairs doubles it is a two-player team. The rotation is identical
 * either way, and having one implementation means the pairs format inherits the
 * property the singles tests already pin down: everyone meets everyone once.
 *
 * @returns [{ round, a, b, sittingOut }] — a and b are entries, sittingOut the
 *          entries not playing that round.
 */
export function circleMethod(entries) {
  if (entries.length < 2) return [];

  const arr = entries.slice();
  if (arr.length % 2 === 1) arr.push(null); // phantom entry == the bye

  const n = arr.length;
  const fixtures = [];

  for (let r = 0; r < n - 1; r++) {
    const sittingOut = [];
    const pairings = [];

    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null) sittingOut.push(b);
      else if (b === null) sittingOut.push(a);
      else pairings.push([a, b]);
    }

    for (const [a, b] of pairings) {
      fixtures.push({ round: r + 1, a, b, sittingOut });
    }

    // Rotate everyone except the first element — the circle method.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return fixtures;
}

/**
 * Singles round robin: everyone plays everyone exactly once.
 */
export function generateSingles(playerIds) {
  let ordinal = 1;
  return circleMethod(playerIds).map(({ round, a, b, sittingOut }) =>
    makeGame({ ordinal: ordinal++, round, teamA: [a], teamB: [b], byes: sittingOut })
  );
}

/**
 * Draw the field into fixed pairs, then run a round robin between those teams.
 *
 * Partners are fixed for the whole session — the opposite of Americano, where
 * they rotate every game. That changes what the session *is*: the unit being
 * ranked is the team, not the player, so standings and the playoff seeding both
 * work on teams. See utils/entrants.js.
 *
 * The draw is seeded, so the same seed always produces the same teams and a
 * redraw is a deliberate act with a new seed rather than something that quietly
 * differs between two phones looking at the same session.
 *
 * Requires an even field: a leftover player would have nobody to partner, and
 * silently dropping them from their own session is worse than refusing.
 */
export function generatePairs(playerIds, { seed = 1, teams: given = null } = {}) {
  if (playerIds.length < 4 || playerIds.length % 2 === 1) return [];

  const teams = given ? normaliseTeams(given, playerIds) : drawTeams(playerIds, seed);
  if (teams.length < 2) return [];

  let ordinal = 1;
  return circleMethod(teams).map(({ round, a, b, sittingOut }) =>
    makeGame({
      ordinal: ordinal++,
      round,
      teamA: a,
      teamB: b,
      // A sitting-out *team* means both of its players are sitting out.
      byes: sittingOut.flat(),
    })
  );
}

function drawTeams(playerIds, seed) {
  const drawn = shuffle(playerIds, mulberry32(seed));
  const teams = [];
  for (let i = 0; i < drawn.length; i += 2) teams.push([drawn[i], drawn[i + 1]]);
  return teams;
}

/**
 * Validate a hand-picked set of teams against the field.
 *
 * Rejects the whole thing rather than repairing it. A partial fix — dropping a
 * duplicated player, say — would silently produce a tournament nobody agreed to,
 * and the entry points that build teams already prevent every case here; this is
 * the backstop that makes that guarantee real rather than assumed.
 */
function normaliseTeams(given, playerIds) {
  const field = new Set(playerIds);
  const seen = new Set();
  const teams = [];

  for (const team of given) {
    if (!Array.isArray(team) || team.length !== 2) return [];
    for (const id of team) {
      if (!field.has(id) || seen.has(id)) return [];
      seen.add(id);
    }
    teams.push([team[0], team[1]]);
  }

  // Everybody in the field has to be on a team; a player left over would be
  // listed as playing and then never appear in a fixture.
  return seen.size === field.size ? teams : [];
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
 * The shape of a format's finish, or null if it has none.
 *
 * Singles and fixed pairs seed a four-entrant bracket, because the thing that
 * plays is also the thing that is ranked. Americano rotates partners, so its
 * table ranks individuals and there is no standing team to seed — its four top
 * seeds pair up for a single deciding game instead. See utils/bracket.js.
 */
export function playoffShape(format) {
  if (format === FORMATS.SINGLES || format === FORMATS.PAIRS) return SHAPES.KNOCKOUT;
  if (format === FORMATS.AMERICANO) return SHAPES.FINAL_ONLY;
  return null;
}

/** Whether a session can finish with a playoff at all. */
export function canRunPlayoffs({ format, playerCount }) {
  if (format === FORMATS.SINGLES) return playerCount >= BRACKET_SIZE;
  // Fixed pairs seed the bracket by team, so it needs four TEAMS — eight
  // players — not four people.
  if (format === FORMATS.PAIRS) return playerCount >= BRACKET_SIZE * 2 && playerCount % 2 === 0;
  // Americano needs four individuals to pair up for the final.
  if (format === FORMATS.AMERICANO) return playerCount >= BRACKET_SIZE;
  return false;
}

/**
 * The one entry point the app uses. Returns games with courts assigned.
 *
 * With `playoffs`, four empty knockout fixtures are appended after the round
 * robin — semifinals, a third-place game and a final. They carry no players:
 * who plays them is derived from the standings once the round robin is done.
 * See utils/bracket.js.
 *
 * `teams` is for fixed pairs only: pass the partnerships to use them verbatim,
 * omit it to draw them at random from the seed. Real doubles competitions have
 * teams that registered together, and randomly reassigning those would be the
 * opposite of what the organiser wants.
 */
export function generateSchedule({
  format,
  playerIds,
  numGames = 8,
  courts = 1,
  seed = 1,
  playoffs = false,
  teams = null,
}) {
  const games =
    format === FORMATS.SINGLES
      ? generateSingles(playerIds)
      : format === FORMATS.PAIRS
        ? generatePairs(playerIds, { seed, teams })
        : generateAmericano(playerIds, { numGames, courts, seed });

  if (playoffs && canRunPlayoffs({ format, playerCount: playerIds.length }) && games.length > 0) {
    const last = games[games.length - 1];
    games.push(...buildBracketGames({
      lastOrdinal: last.ordinal,
      lastRound: last.round,
      shape: playoffShape(format),
    }));
  }

  // Courts are assigned across the whole schedule, so the two semifinals share
  // the courts the round robin was using rather than queueing behind each other.
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
  // In fixed pairs you play every game your team plays, and your team meets
  // each of the other teams once.
  if (format === FORMATS.PAIRS) return Math.max(0, Math.floor(playerCount / 2) - 1);
  return (numGames * 4) / playerCount;
}
