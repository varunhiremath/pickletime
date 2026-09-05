import { describe, it, expect } from 'vitest';
import {
  FORMATS,
  generateSingles,
  generateAmericano,
  generateSchedule,
  assignCourts,
  gamesPerPlayer,
  canRunPlayoffs,
  generatePairs,
  circleMethod,
  isTeamFormat,
} from './schedule.js';
import { STAGE, SLOT, isRoundRobin, knockoutGames } from './bracket.js';

const players = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

describe('generateSingles', () => {
  it('returns nothing below two players', () => {
    expect(generateSingles([])).toEqual([]);
    expect(generateSingles(['p1'])).toEqual([]);
  });

  it('pairs every player exactly once (even count)', () => {
    const ids = players(6);
    const games = generateSingles(ids);
    // 6 players → 15 unique pairings
    expect(games).toHaveLength(15);
    const seen = games.map((g) => pairKey(g.teamA[0], g.teamB[0]));
    expect(new Set(seen).size).toBe(15);
  });

  it('pairs every player exactly once (odd count)', () => {
    const ids = players(5);
    const games = generateSingles(ids);
    expect(games).toHaveLength(10); // 5 choose 2
    const seen = games.map((g) => pairKey(g.teamA[0], g.teamB[0]));
    expect(new Set(seen).size).toBe(10);
  });

  it('gives every player the same number of games when the count is even', () => {
    const games = generateSingles(players(6));
    const counts = {};
    for (const g of games) {
      counts[g.teamA[0]] = (counts[g.teamA[0]] ?? 0) + 1;
      counts[g.teamB[0]] = (counts[g.teamB[0]] ?? 0) + 1;
    }
    expect(new Set(Object.values(counts))).toEqual(new Set([5]));
  });

  it('rotates the bye evenly for an odd number of players', () => {
    const ids = players(5);
    const games = generateSingles(ids);
    const byeCounts = {};
    // Byes repeat across the games of a round, so count each round once.
    const seenRounds = new Set();
    for (const g of games) {
      if (seenRounds.has(g.round)) continue;
      seenRounds.add(g.round);
      for (const id of g.byes) byeCounts[id] = (byeCounts[id] ?? 0) + 1;
    }
    // 5 rounds, one player sits out each round — everyone sits exactly once.
    expect(Object.values(byeCounts)).toHaveLength(5);
    expect(new Set(Object.values(byeCounts))).toEqual(new Set([1]));
  });

  it('never schedules a player against themselves', () => {
    for (const g of generateSingles(players(7))) {
      expect(g.teamA[0]).not.toBe(g.teamB[0]);
    }
  });

  it('never puts a player in a game and its bye list at once', () => {
    for (const g of generateSingles(players(7))) {
      expect(g.byes).not.toContain(g.teamA[0]);
      expect(g.byes).not.toContain(g.teamB[0]);
    }
  });

  it('numbers games sequentially from 1', () => {
    const games = generateSingles(players(4));
    expect(games.map((g) => g.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('starts every game unplayed and unscored', () => {
    for (const g of generateSingles(players(4))) {
      expect(g.played).toBe(false);
      expect(g.scoreA).toBeNull();
      expect(g.scoreB).toBeNull();
    }
  });
});

describe('generateAmericano', () => {
  it('returns nothing below four players', () => {
    expect(generateAmericano(players(3), { numGames: 4, seed: 1 })).toEqual([]);
  });

  it('returns nothing when no games are requested', () => {
    expect(generateAmericano(players(6), { numGames: 0, seed: 1 })).toEqual([]);
  });

  it('produces exactly the requested number of games', () => {
    expect(generateAmericano(players(6), { numGames: 12, seed: 3 })).toHaveLength(12);
  });

  it('is deterministic — same seed, same schedule', () => {
    const a = generateAmericano(players(7), { numGames: 14, seed: 2024 });
    const b = generateAmericano(players(7), { numGames: 14, seed: 2024 });
    expect(a).toEqual(b);
  });

  it('produces a different schedule for a different seed', () => {
    const a = generateAmericano(players(7), { numGames: 14, seed: 1 });
    const b = generateAmericano(players(7), { numGames: 14, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('always seats four distinct players per game', () => {
    for (const g of generateAmericano(players(6), { numGames: 20, seed: 5 })) {
      const four = [...g.teamA, ...g.teamB];
      expect(four).toHaveLength(4);
      expect(new Set(four).size).toBe(4);
    }
  });

  it('spreads games played to within one of each other', () => {
    const ids = players(7);
    const games = generateAmericano(ids, { numGames: 21, seed: 11 });
    const counts = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const g of games) for (const id of [...g.teamA, ...g.teamB]) counts[id]++;
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('exhausts every partnership before repeating one', () => {
    // 4 players have C(4,2) = 6 possible pairings, and 3 games supply exactly 6
    // partnership slots — so a perfect rotation uses each pairing once.
    const games = generateAmericano(players(4), { numGames: 3, seed: 7 });
    const partnerships = [];
    for (const g of games) {
      partnerships.push(pairKey(...g.teamA), pairKey(...g.teamB));
    }
    expect(partnerships).toHaveLength(6);
    expect(new Set(partnerships).size).toBe(6);
  });

  it('lists everyone not playing as sitting out', () => {
    const ids = players(6);
    for (const g of generateAmericano(ids, { numGames: 10, seed: 4 })) {
      const playing = new Set([...g.teamA, ...g.teamB]);
      expect(g.byes.sort()).toEqual(ids.filter((id) => !playing.has(id)).sort());
    }
  });

  it('runs concurrent games on multiple courts without double-booking', () => {
    const ids = players(8);
    const games = generateAmericano(ids, { numGames: 10, courts: 2, seed: 6 });
    const byRound = {};
    for (const g of games) (byRound[g.round] ??= []).push(g);

    for (const roundGames of Object.values(byRound)) {
      const seated = roundGames.flatMap((g) => [...g.teamA, ...g.teamB]);
      // Nobody plays twice in the same round.
      expect(new Set(seated).size).toBe(seated.length);
    }
    // 8 players / 2 courts → 2 games per round.
    expect(Object.values(byRound)[0]).toHaveLength(2);
  });

  it('falls back to fewer concurrent games than courts when players are short', () => {
    // 6 players can only seat one game of four at a time.
    const games = generateAmericano(players(6), { numGames: 6, courts: 3, seed: 8 });
    const byRound = {};
    for (const g of games) (byRound[g.round] ??= []).push(g);
    for (const roundGames of Object.values(byRound)) {
      expect(roundGames).toHaveLength(1);
    }
  });
});

describe('assignCourts', () => {
  it('spreads a round across courts and restarts each round', () => {
    const games = [
      { round: 1 }, { round: 1 }, { round: 1 },
      { round: 2 }, { round: 2 },
    ];
    expect(assignCourts(games, 2).map((g) => g.court)).toEqual([1, 2, 1, 1, 2]);
  });

  it('puts everything on court 1 when there is one court', () => {
    const games = [{ round: 1 }, { round: 1 }, { round: 2 }];
    expect(assignCourts(games, 1).map((g) => g.court)).toEqual([1, 1, 1]);
  });

  it('treats zero or missing courts as one court', () => {
    expect(assignCourts([{ round: 1 }], 0)[0].court).toBe(1);
    expect(assignCourts([{ round: 1 }])[0].court).toBe(1);
  });

  it('does not mutate the input games', () => {
    const games = [{ round: 1 }];
    assignCourts(games, 2);
    expect(games[0].court).toBeUndefined();
  });
});

describe('generateSchedule', () => {
  it('dispatches to singles and assigns courts', () => {
    const games = generateSchedule({ format: FORMATS.SINGLES, playerIds: players(4), courts: 2 });
    expect(games).toHaveLength(6);
    expect(games.every((g) => g.court >= 1 && g.court <= 2)).toBe(true);
  });

  it('dispatches to americano and honours numGames', () => {
    const games = generateSchedule({
      format: FORMATS.AMERICANO,
      playerIds: players(6),
      numGames: 9,
      seed: 21,
    });
    expect(games).toHaveLength(9);
  });

  it('is reproducible end to end from the seed', () => {
    const opts = { format: FORMATS.AMERICANO, playerIds: players(5), numGames: 10, courts: 1, seed: 99 };
    expect(generateSchedule(opts)).toEqual(generateSchedule(opts));
  });
});

describe('generatePairs', () => {
  it('draws the field into fixed pairs and runs a round robin between them', () => {
    const games = generatePairs(players(8), { seed: 5 });
    expect(games).toHaveLength(6); // 4 teams → C(4,2)
    for (const g of games) {
      expect(g.teamA).toHaveLength(2);
      expect(g.teamB).toHaveLength(2);
    }
  });

  it('keeps every partnership fixed for the whole session', () => {
    const games = generatePairs(players(8), { seed: 5 });
    const partnerOf = new Map();
    for (const g of games) {
      for (const side of [g.teamA, g.teamB]) {
        for (const id of side) {
          const mate = side.find((x) => x !== id);
          if (partnerOf.has(id)) expect(partnerOf.get(id)).toBe(mate);
          else partnerOf.set(id, mate);
        }
      }
    }
    expect(partnerOf.size).toBe(8);
  });

  it('has every team meet every other exactly once', () => {
    const games = generatePairs(players(8), { seed: 7 });
    const key = (ids) => [...ids].sort().join('+');
    const seen = games.map((g) => [key(g.teamA), key(g.teamB)].sort().join(' v '));
    expect(new Set(seen).size).toBe(6);
  });

  it('never puts a player on both sides of a game', () => {
    for (const g of generatePairs(players(10), { seed: 2 })) {
      expect(new Set([...g.teamA, ...g.teamB]).size).toBe(4);
    }
  });

  it('is reproducible from the seed, and different for a different one', () => {
    expect(generatePairs(players(8), { seed: 11 })).toEqual(generatePairs(players(8), { seed: 11 }));
    expect(generatePairs(players(8), { seed: 11 })).not.toEqual(generatePairs(players(8), { seed: 12 }));
  });

  it('refuses an odd field rather than dropping somebody from their own session', () => {
    expect(generatePairs(players(7), { seed: 1 })).toEqual([]);
    expect(generatePairs(players(5), { seed: 1 })).toEqual([]);
  });

  it('refuses fewer than two teams', () => {
    expect(generatePairs(players(2), { seed: 1 })).toEqual([]);
  });

  it('sits a whole team out together when there is an odd number of teams', () => {
    // 6 players → 3 teams → one team sits out each round.
    const games = generatePairs(players(6), { seed: 4 });
    for (const g of games) {
      expect(g.byes).toHaveLength(2);
      // The sitting-out pair is nobody who is on court.
      for (const id of g.byes) expect([...g.teamA, ...g.teamB]).not.toContain(id);
    }
  });

  it('gives every player the same number of games with an even number of teams', () => {
    const counts = {};
    for (const g of generatePairs(players(8), { seed: 6 })) {
      for (const id of [...g.teamA, ...g.teamB]) counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(new Set(Object.values(counts))).toEqual(new Set([3]));
  });
});

describe('circleMethod', () => {
  it('produces every pairing exactly once', () => {
    const f = circleMethod(['a', 'b', 'c', 'd']);
    expect(f).toHaveLength(6);
    expect(new Set(f.map((x) => [x.a, x.b].sort().join('|'))).size).toBe(6);
  });

  it('rotates a bye through an odd field', () => {
    const rounds = new Map();
    for (const f of circleMethod(['a', 'b', 'c', 'd', 'e'])) rounds.set(f.round, f.sittingOut);
    expect([...rounds.values()].flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns nothing below two entries', () => {
    expect(circleMethod([])).toEqual([]);
    expect(circleMethod(['a'])).toEqual([]);
  });
});

describe('isTeamFormat', () => {
  it('is true only for fixed pairs', () => {
    expect(isTeamFormat(FORMATS.PAIRS)).toBe(true);
    expect(isTeamFormat(FORMATS.SINGLES)).toBe(false);
    expect(isTeamFormat(FORMATS.AMERICANO)).toBe(false);
  });
});

describe('canRunPlayoffs', () => {
  it('needs four singles players', () => {
    expect(canRunPlayoffs({ format: FORMATS.SINGLES, playerCount: 4 })).toBe(true);
    expect(canRunPlayoffs({ format: FORMATS.SINGLES, playerCount: 3 })).toBe(false);
  });

  it('is off for americano, where four seeds cannot be paired fairly', () => {
    expect(canRunPlayoffs({ format: FORMATS.AMERICANO, playerCount: 8 })).toBe(false);
  });

  it('needs four TEAMS for fixed pairs — eight players, not four', () => {
    expect(canRunPlayoffs({ format: FORMATS.PAIRS, playerCount: 8 })).toBe(true);
    expect(canRunPlayoffs({ format: FORMATS.PAIRS, playerCount: 6 })).toBe(false);
    expect(canRunPlayoffs({ format: FORMATS.PAIRS, playerCount: 9 })).toBe(false);
  });
});

describe('generateSchedule — playoffs', () => {
  const opts = { format: FORMATS.SINGLES, playerIds: players(5), courts: 1, seed: 4 };

  it('appends four knockout fixtures after the round robin', () => {
    const plain = generateSchedule(opts);
    const withPo = generateSchedule({ ...opts, playoffs: true });

    expect(plain.every(isRoundRobin)).toBe(true);
    expect(withPo).toHaveLength(plain.length + 4);
    expect(knockoutGames(withPo).map((g) => g.slot)).toEqual([
      SLOT.SF1, SLOT.SF2, SLOT.BRONZE, SLOT.FINAL,
    ]);
  });

  it('leaves the round robin itself untouched', () => {
    const plain = generateSchedule(opts);
    const withPo = generateSchedule({ ...opts, playoffs: true });
    expect(withPo.slice(0, plain.length)).toEqual(plain);
  });

  it('continues the ordinals and starts a new round for the semifinals', () => {
    const games = generateSchedule({ ...opts, playoffs: true });
    const rrLast = games.filter(isRoundRobin).at(-1);
    const ko = knockoutGames(games);

    expect(ko[0].ordinal).toBe(rrLast.ordinal + 1);
    expect(ko.map((g) => g.ordinal)).toEqual([
      rrLast.ordinal + 1, rrLast.ordinal + 2, rrLast.ordinal + 3, rrLast.ordinal + 4,
    ]);
    expect(ko[0].round).toBe(rrLast.round + 1);
    expect(ko.at(-1).round).toBe(rrLast.round + 2);
  });

  it('runs the two semifinals on separate courts when there are two', () => {
    const games = generateSchedule({ ...opts, courts: 2, playoffs: true });
    const semis = knockoutGames(games).filter((g) => g.stage === STAGE.SEMI);
    expect(semis.map((g) => g.court)).toEqual([1, 2]);
  });

  it('refuses a bracket that cannot be filled', () => {
    // Three players cannot produce four seeds, and americano has no bracket.
    expect(generateSchedule({ ...opts, playerIds: players(3), playoffs: true }).every(isRoundRobin)).toBe(true);
    expect(
      generateSchedule({
        format: FORMATS.AMERICANO, playerIds: players(8), numGames: 6, seed: 2, playoffs: true,
      }).every(isRoundRobin)
    ).toBe(true);
  });

  it('stamps every round-robin game as such', () => {
    for (const g of generateSchedule({ ...opts, playoffs: true }).filter(isRoundRobin)) {
      expect(g.stage).toBe(STAGE.RR);
      expect(g.slot).toBeNull();
    }
  });
});

describe('gamesPerPlayer', () => {
  it('is one fewer than the field for singles', () => {
    expect(gamesPerPlayer({ format: FORMATS.SINGLES, playerCount: 6 })).toBe(5);
  });

  it('divides the four seats per game across the field for americano', () => {
    expect(gamesPerPlayer({ format: FORMATS.AMERICANO, playerCount: 8, numGames: 10 })).toBe(5);
  });

  it('is zero when there is nobody to play', () => {
    expect(gamesPerPlayer({ format: FORMATS.SINGLES, playerCount: 1 })).toBe(0);
  });
});
