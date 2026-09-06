import { describe, it, expect } from 'vitest';
import {
  STAGE,
  SLOT,
  BRACKET_SLOTS,
  isRoundRobin,
  isKnockout,
  roundRobinGames,
  knockoutGames,
  outcome,
  buildBracketGames,
  resolveBracket,
  slotLabel,
  SHAPES,
  shapeOf,
} from './bracket.js';

const P = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Cal' },
  { id: 'd', name: 'Dee' },
  { id: 'e', name: 'Eli' },
];

let seq = 0;
const rr = (teamA, teamB, scoreA, scoreB) => ({
  ordinal: ++seq,
  round: 1,
  stage: STAGE.RR,
  slot: null,
  teamA,
  teamB,
  byes: [],
  scoreA: scoreA ?? null,
  scoreB: scoreB ?? null,
  played: scoreA != null && scoreB != null,
});

/** A full five-player round robin whose finishing order is a > b > c > d > e. */
function fullRoundRobin() {
  seq = 0;
  return [
    rr(['a'], ['b'], 11, 5),
    rr(['a'], ['c'], 11, 5),
    rr(['a'], ['d'], 11, 5),
    rr(['a'], ['e'], 11, 5),
    rr(['b'], ['c'], 11, 6),
    rr(['b'], ['d'], 11, 6),
    rr(['b'], ['e'], 11, 6),
    rr(['c'], ['d'], 11, 7),
    rr(['c'], ['e'], 11, 7),
    rr(['d'], ['e'], 11, 8),
  ];
}

const withBracket = (games) =>
  games.concat(
    buildBracketGames({ lastOrdinal: games.length, lastRound: 1 }).map((g, i) => ({
      ...g,
      id: `ko${i}`,
    }))
  );

/** Score a knockout slot, storing the participants the way submit_score does. */
function score(games, slot, teamA, teamB, scoreA, scoreB) {
  return games.map((g) =>
    g.slot === slot
      ? { ...g, teamA, teamB, scoreA, scoreB, played: scoreA != null && scoreB != null }
      : g
  );
}

describe('stage predicates', () => {
  it('treats a game with no stage at all as round robin', () => {
    // Every game written before the playoff stage existed looks like this.
    const legacy = { ordinal: 1, teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 4, played: true };
    expect(isRoundRobin(legacy)).toBe(true);
    expect(isKnockout(legacy)).toBe(false);
  });

  it('splits a schedule into its round-robin and knockout halves', () => {
    const games = withBracket(fullRoundRobin());
    expect(roundRobinGames(games)).toHaveLength(10);
    expect(knockoutGames(games)).toHaveLength(4);
  });
});

describe('outcome', () => {
  it('returns the winning and losing sides', () => {
    const g = { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 9, played: true };
    expect(outcome(g)).toEqual({ winner: ['a'], loser: ['b'] });
  });

  it('has no winner for an unplayed game', () => {
    expect(outcome({ teamA: ['a'], teamB: ['b'], scoreA: null, scoreB: null, played: false }))
      .toEqual({ winner: null, loser: null });
  });

  it('has no winner for a level score, so nothing downstream advances', () => {
    // Pickleball is win-by-two, so this can only be a typo — but a typo must not
    // put the wrong player into a final.
    const g = { teamA: ['a'], teamB: ['b'], scoreA: 11, scoreB: 11, played: true };
    expect(outcome(g)).toEqual({ winner: null, loser: null });
  });
});

describe('buildBracketGames', () => {
  it('appends four fixtures after the round robin', () => {
    const games = buildBracketGames({ lastOrdinal: 10, lastRound: 5 });
    expect(games.map((g) => g.slot)).toEqual([SLOT.SF1, SLOT.SF2, SLOT.BRONZE, SLOT.FINAL]);
    expect(games.map((g) => g.ordinal)).toEqual([11, 12, 13, 14]);
  });

  it('puts the semifinals a round before the final', () => {
    const games = buildBracketGames({ lastOrdinal: 10, lastRound: 5 });
    const round = Object.fromEntries(games.map((g) => [g.slot, g.round]));
    expect(round.sf1).toBe(6);
    expect(round.sf2).toBe(6);
    expect(round.final).toBe(7);
    expect(round.bronze).toBe(7);
  });

  it('starts with no players in any slot', () => {
    for (const g of buildBracketGames({ lastOrdinal: 0, lastRound: 0 })) {
      expect(g.teamA).toEqual([]);
      expect(g.teamB).toEqual([]);
      expect(g.played).toBe(false);
    }
  });
});

describe('resolveBracket — before the round robin is done', () => {
  it('reports the round robin as incomplete and seeds nobody', () => {
    const games = withBracket(fullRoundRobin().map((g, i) => (i < 3 ? g : { ...g, scoreA: null, scoreB: null, played: false })));
    const b = resolveBracket(P, games);
    expect(b.rr).toMatchObject({ total: 10, played: 3, remaining: 7, complete: false });
    expect(b.qualifiers).toEqual([]);
    expect(b.matches.every((m) => !m.ready)).toBe(true);
  });

  it('counts only round-robin games towards round-robin progress', () => {
    // The four empty knockout rows must not read as "10 of 14 played".
    const b = resolveBracket(P, withBracket(fullRoundRobin()));
    expect(b.rr.total).toBe(10);
    expect(b.rr.complete).toBe(true);
  });

  it('says a session has no bracket when no knockout games exist', () => {
    expect(resolveBracket(P, fullRoundRobin()).enabled).toBe(false);
    expect(resolveBracket(P, withBracket(fullRoundRobin())).enabled).toBe(true);
  });
});

describe('resolveBracket — seeding', () => {
  it('pairs seed 1 with seed 4 and seed 2 with seed 3', () => {
    const b = resolveBracket(P, withBracket(fullRoundRobin()));
    expect(b.qualifiers.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);

    const sf1 = b.matches.find((m) => m.slot === SLOT.SF1);
    const sf2 = b.matches.find((m) => m.slot === SLOT.SF2);
    expect(sf1.teamA).toEqual(['a']);
    expect(sf1.teamB).toEqual(['d']);
    expect(sf2.teamA).toEqual(['b']);
    expect(sf2.teamB).toEqual(['c']);
    expect(sf1.ready && sf2.ready).toBe(true);
  });

  it('leaves the final and the third-place game waiting on the semifinals', () => {
    const b = resolveBracket(P, withBracket(fullRoundRobin()));
    expect(b.matches.find((m) => m.slot === SLOT.FINAL).ready).toBe(false);
    expect(b.matches.find((m) => m.slot === SLOT.BRONZE).ready).toBe(false);
  });

  it('flags a dead-level cut for the last playoff spot', () => {
    // Ana wins everything; the other four are exactly level on wins, difference
    // and points, so 4th vs 5th comes down to the name tie-break alone.
    seq = 0;
    const games = [
      rr(['a'], ['b'], 11, 0),
      rr(['a'], ['c'], 11, 0),
      rr(['a'], ['d'], 11, 0),
      rr(['a'], ['e'], 11, 0),
      rr(['b'], ['c'], 11, 5),
      rr(['c'], ['d'], 11, 5),
      rr(['d'], ['e'], 11, 5),
      rr(['e'], ['b'], 11, 5),
      rr(['b'], ['d'], 5, 11),
      rr(['c'], ['e'], 5, 11),
    ];
    const b = resolveBracket(P, withBracket(games));
    expect(b.rr.complete).toBe(true);
    expect(b.tiedForLastSpot).toBe(true);
  });

  it('does not flag a tie when the fourth spot is won outright', () => {
    expect(resolveBracket(P, withBracket(fullRoundRobin())).tiedForLastSpot).toBe(false);
  });

  it('seeds nobody when fewer than four players finished the round robin', () => {
    seq = 0;
    const games = withBracket([rr(['a'], ['b'], 11, 3)]);
    const b = resolveBracket([P[0], P[1]], games);
    expect(b.rr.complete).toBe(true);
    expect(b.qualifiers).toHaveLength(2);
    expect(b.matches.find((m) => m.slot === SLOT.SF1).ready).toBe(false);
  });
});

describe('resolveBracket — advancing', () => {
  it('sends the semifinal winners to the final and the losers to the third-place game', () => {
    let games = withBracket(fullRoundRobin());
    games = score(games, SLOT.SF1, ['a'], ['d'], 11, 7); // a wins
    games = score(games, SLOT.SF2, ['b'], ['c'], 8, 11); // c wins

    const b = resolveBracket(P, games);
    const final = b.matches.find((m) => m.slot === SLOT.FINAL);
    const bronze = b.matches.find((m) => m.slot === SLOT.BRONZE);

    expect(final.teamA).toEqual(['a']);
    expect(final.teamB).toEqual(['c']);
    expect(bronze.teamA).toEqual(['d']);
    expect(bronze.teamB).toEqual(['b']);
    expect(final.ready && bronze.ready).toBe(true);
  });

  it('crowns a champion, a runner-up and a third place', () => {
    let games = withBracket(fullRoundRobin());
    games = score(games, SLOT.SF1, ['a'], ['d'], 11, 7);
    games = score(games, SLOT.SF2, ['b'], ['c'], 8, 11);
    games = score(games, SLOT.BRONZE, ['d'], ['b'], 6, 11);
    games = score(games, SLOT.FINAL, ['a'], ['c'], 9, 11);

    const b = resolveBracket(P, games);
    expect(b.complete).toBe(true);
    expect(b.champion.id).toBe('c');
    expect(b.runnerUp.id).toBe('a');
    expect(b.third.id).toBe('b');
  });

  it('is not complete while the final is unplayed', () => {
    let games = withBracket(fullRoundRobin());
    games = score(games, SLOT.SF1, ['a'], ['d'], 11, 7);
    games = score(games, SLOT.SF2, ['b'], ['c'], 11, 7);
    const b = resolveBracket(P, games);
    expect(b.complete).toBe(false);
    expect(b.champion).toBeNull();
  });

  it('holds the final back when a semifinal was entered level', () => {
    let games = withBracket(fullRoundRobin());
    games = score(games, SLOT.SF1, ['a'], ['d'], 11, 11);
    games = score(games, SLOT.SF2, ['b'], ['c'], 11, 7);

    const b = resolveBracket(P, games);
    const sf1 = b.matches.find((m) => m.slot === SLOT.SF1);
    const final = b.matches.find((m) => m.slot === SLOT.FINAL);
    expect(sf1.drawn).toBe(true);
    expect(final.ready).toBe(false);
  });
});

describe('resolveBracket — stored participants win over derived ones', () => {
  it('keeps a played semifinal line-up when a round-robin score is corrected later', () => {
    let games = withBracket(fullRoundRobin());
    games = score(games, SLOT.SF1, ['a'], ['d'], 11, 7);

    // Somebody now fixes a round-robin score, and Eli leapfrogs Dee into 4th.
    games = games.map((g) =>
      g.slot == null && g.teamA[0] === 'd' && g.teamB[0] === 'e'
        ? { ...g, scoreA: 2, scoreB: 11 }
        : g
    );

    const b = resolveBracket(P, games);
    expect(b.qualifiers.map((r) => r.id)).toContain('e');

    // The semifinal that was actually played still says who actually played it.
    const sf1 = b.matches.find((m) => m.slot === SLOT.SF1);
    expect(sf1.teamB).toEqual(['d']);
    expect(sf1.fromStored).toBe(true);

    // The unplayed one re-seeds freely.
    expect(b.matches.find((m) => m.slot === SLOT.SF2).fromStored).toBe(false);
  });
});

describe('slotLabel', () => {
  it('names a knockout fixture and leaves round-robin ones unlabelled', () => {
    expect(slotLabel({ stage: STAGE.FINAL, slot: SLOT.FINAL })).toBe('Final');
    expect(slotLabel({ stage: STAGE.SEMI, slot: SLOT.SF2 })).toBe('Semifinal 2');
    expect(slotLabel({ stage: STAGE.BRONZE, slot: SLOT.BRONZE })).toBe('3rd place');
    expect(slotLabel({ stage: STAGE.RR })).toBeNull();
    expect(slotLabel(null)).toBeNull();
  });

  it('has a label for every slot the bracket builds', () => {
    for (const g of buildBracketGames()) {
      expect(slotLabel(g)).toBeTruthy();
    }
    expect(BRACKET_SLOTS).toHaveLength(4);
  });
});

describe('the Americano finish', () => {
  // Americano ranks individuals, so the entrants are players and the final is
  // played by two partnerships that exist for that one game only.
  const P8 = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));

  let n = 0;
  const rr = (a, b, sa, sb) => ({
    ordinal: ++n, round: 1, stage: STAGE.RR, slot: null,
    teamA: a, teamB: b, byes: [],
    scoreA: sa ?? null, scoreB: sb ?? null, played: sa != null,
  });

  /**
   * A rotation where the lower-numbered player's side always wins.
   *
   * That biases the table towards p1 but does NOT produce the order
   * p1 > p2 > ... > p8 — partners rotate, so a weak player carried by p1 banks
   * wins too. These tests deliberately do not assume a finishing order; they
   * read the seeding back off the result and check the pairing rule against it.
   */
  const rotation = () => {
    n = 0;
    const games = [];
    // Each player's rank is 9 - index; the stronger side always wins.
    const strength = (ids) => Math.min(...ids.map((id) => Number(id.slice(1))));
    const pairsOf = [
      [['p1','p8'],['p2','p7']], [['p3','p6'],['p4','p5']],
      [['p1','p7'],['p3','p8']], [['p2','p6'],['p4','p7']],
      [['p1','p6'],['p5','p8']], [['p2','p5'],['p3','p7']],
      [['p1','p5'],['p4','p8']], [['p2','p4'],['p6','p7']],
    ];
    for (const [a, b] of pairsOf) {
      const aWins = strength(a) < strength(b);
      games.push(rr(a, b, aWins ? 11 : 5, aWins ? 5 : 11));
    }
    return games;
  };

  const withFinal = (games) =>
    games.concat(
      buildBracketGames({
        lastOrdinal: games.length,
        lastRound: 1,
        shape: SHAPES.FINAL_ONLY,
      }).map((g, i) => ({ ...g, id: `ko${i}` }))
    );

  it('builds exactly one fixture', () => {
    const built = buildBracketGames({ lastOrdinal: 8, lastRound: 3, shape: SHAPES.FINAL_ONLY });
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ slot: SLOT.FINAL, stage: STAGE.FINAL, ordinal: 9, round: 4 });
    expect(built[0].teamA).toEqual([]);
  });

  it('still builds the full bracket when no shape is asked for', () => {
    expect(buildBracketGames({ lastOrdinal: 0, lastRound: 0 })).toHaveLength(4);
  });

  it('reads its shape back off the fixtures', () => {
    expect(shapeOf(withFinal(rotation()))).toBe(SHAPES.FINAL_ONLY);
    expect(shapeOf(rotation())).toBeNull();
  });

  it('credits both players on an Americano side', () => {
    // Regression guard. Sides here are two players and the entrants are
    // individuals, so matching a whole side against a team key finds nothing —
    // which used to drop every round-robin game silently. The table then read
    // 0-0-0 for everybody and the final was seeded by name order.
    const games = [
      rr(['p1', 'p2'], ['p3', 'p4'], 11, 5),
      rr(['p1', 'p3'], ['p2', 'p4'], 11, 7),
      rr(['p1', 'p4'], ['p2', 'p3'], 11, 9),
    ];
    const rows = resolveBracket(P8.slice(0, 4), games).standings;
    expect(rows.map((r) => `${r.id} ${r.w}-${r.l} ${r.diff}`)).toEqual([
      'p1 3-0 12', 'p2 1-2 0', 'p3 1-2 -4', 'p4 1-2 -8',
    ]);
  });

  it('pairs seed 1 with seed 4 against seed 2 with seed 3', () => {
    const games = withFinal(rotation());
    const b = resolveBracket(P8, games);

    expect(b.shape).toBe(SHAPES.FINAL_ONLY);
    expect(b.rr.complete).toBe(true);
    expect(b.qualifiers).toHaveLength(4);
    // Everyone qualifying has actually played — the seeding is earned, not a
    // fallback to alphabetical order over an empty table.
    expect(b.qualifiers.every((q) => q.gp > 0)).toBe(true);

    const [s1, s2, s3, s4] = b.qualifiers.map((q) => q.id);
    const final = b.matches.find((m) => m.slot === SLOT.FINAL);
    // Balanced on paper: the best player partners the weakest qualifier.
    expect([...final.teamA].sort()).toEqual([s1, s4].sort());
    expect([...final.teamB].sort()).toEqual([s2, s3].sort());
    expect(final.ready).toBe(true);
  });

  it('offers only the final — no semifinals, no third place', () => {
    const b = resolveBracket(P8, withFinal(rotation()));
    expect(b.matches).toHaveLength(1);
    expect(b.third).toBeNull();
  });

  it('crowns the winning partnership, which is not an entrant', () => {
    let games = withFinal(rotation());
    const b0 = resolveBracket(P8, games);
    const final = b0.matches.find((m) => m.slot === SLOT.FINAL);

    games = games.map((g) =>
      g.slot === SLOT.FINAL
        ? { ...g, teamA: final.teamA, teamB: final.teamB, scoreA: 9, scoreB: 11, played: true }
        : g
    );

    const b = resolveBracket(P8, games);
    expect(b.complete).toBe(true);
    // Team B took it — a partnership that exists for this one game and has no
    // row in the table, so the podium has to build a name for it.
    const nameOf = (ids) => ids.map((id) => `P${id.slice(1)}`).join(' & ');
    expect([...b.champion.playerIds].sort()).toEqual([...final.teamB].sort());
    expect(b.champion.name).toBe(nameOf(final.teamB));
    expect([...b.runnerUp.playerIds].sort()).toEqual([...final.teamA].sort());
    expect(b.runnerUp.name).toBe(nameOf(final.teamA));
  });

  it('stays locked while the rotation is unfinished', () => {
    const partial = rotation().map((g, i) =>
      i < 3 ? g : { ...g, scoreA: null, scoreB: null, played: false }
    );
    const b = resolveBracket(P8, withFinal(partial));
    expect(b.rr.complete).toBe(false);
    expect(b.matches[0].ready).toBe(false);
  });

  it('needs four players to fill it', () => {
    const two = [P8[0], P8[1]];
    n = 0;
    const b = resolveBracket(two, withFinal([rr(['p1'], ['p2'], 11, 4)]));
    expect(b.matches[0].ready).toBe(false);
  });
});
