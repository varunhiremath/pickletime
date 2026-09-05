import { describe, it, expect } from 'vitest';
import { teamKey, teamsFromGames, sessionEntrants, gamesByEntrant, entrantSize } from './entrants.js';
import { FORMATS, generatePairs } from './schedule.js';
import { resolveBracket, buildBracketGames } from './bracket.js';

const MEMBERS = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
}));
const IDS = MEMBERS.map((m) => m.id);

const session = (over = {}) => ({
  format: FORMATS.PAIRS,
  playerIds: IDS,
  ...over,
});

describe('teamKey', () => {
  it('is independent of the order the side is written in', () => {
    expect(teamKey(['b', 'a'])).toBe(teamKey(['a', 'b']));
  });

  it('distinguishes different pairs', () => {
    expect(teamKey(['a', 'b'])).not.toBe(teamKey(['a', 'c']));
  });

  it('handles a single player, so singles and pairs share one code path', () => {
    expect(teamKey(['a'])).toBe('a');
  });
});

describe('teamsFromGames', () => {
  it('recovers the draw from the schedule', () => {
    const games = generatePairs(IDS, { seed: 5 });
    const teams = teamsFromGames(games);
    expect(teams).toHaveLength(4);
    // Every player appears in exactly one team.
    expect(teams.flat().sort()).toEqual([...IDS].sort());
  });

  it('ignores the empty knockout fixtures', () => {
    const games = [...generatePairs(IDS, { seed: 5 }), ...buildBracketGames({ lastOrdinal: 6, lastRound: 3 })];
    expect(teamsFromGames(games)).toHaveLength(4);
  });

  it('returns nothing for a schedule with no games', () => {
    expect(teamsFromGames([])).toEqual([]);
  });
});

describe('sessionEntrants', () => {
  it('makes one entrant per team in a pairs session', () => {
    const games = generatePairs(IDS, { seed: 3 });
    const { entrants, teamPlay } = sessionEntrants({ session: session(), games, members: MEMBERS });
    expect(teamPlay).toBe(true);
    expect(entrants).toHaveLength(4);
    for (const e of entrants) {
      expect(e.playerIds).toHaveLength(2);
      expect(e.name).toMatch(/ & /);
      expect(e.id).toBe(teamKey(e.playerIds));
    }
  });

  it('makes one entrant per player in singles', () => {
    const { entrants, teamPlay } = sessionEntrants({
      session: session({ format: FORMATS.SINGLES }),
      games: [],
      members: MEMBERS,
    });
    expect(teamPlay).toBe(false);
    expect(entrants).toHaveLength(8);
    expect(entrants[0]).toMatchObject({ id: 'p1', name: 'Player 1', playerIds: ['p1'] });
  });

  it('treats americano as individuals — partners rotate, so a team is not a thing', () => {
    const { teamPlay, entrants } = sessionEntrants({
      session: session({ format: FORMATS.AMERICANO }),
      games: [],
      members: MEMBERS,
    });
    expect(teamPlay).toBe(false);
    expect(entrants).toHaveLength(8);
  });

  it('drops session players who are no longer on the roster', () => {
    const { entrants } = sessionEntrants({
      session: session({ format: FORMATS.SINGLES, playerIds: ['p1', 'gone'] }),
      games: [],
      members: MEMBERS,
    });
    expect(entrants.map((e) => e.id)).toEqual(['p1']);
  });

  it('copes with no session at all', () => {
    expect(sessionEntrants({}).entrants).toEqual([]);
    expect(sessionEntrants().entrants).toEqual([]);
  });
});

describe('gamesByEntrant', () => {
  it('collapses each side to its entrant id', () => {
    const games = generatePairs(IDS, { seed: 9 });
    const { entrants, byId } = sessionEntrants({ session: session(), games, members: MEMBERS });
    const mapped = gamesByEntrant(games, byId);

    expect(mapped).toHaveLength(games.length);
    for (const g of mapped) {
      expect(g.teamA).toHaveLength(1);
      expect(entrants.some((e) => e.id === g.teamA[0])).toBe(true);
    }
  });

  it('drops a fixture whose pairing no longer exists after a redraw', () => {
    const games = generatePairs(IDS, { seed: 9 });
    const { byId } = sessionEntrants({ session: session(), games, members: MEMBERS });
    const stale = [{ ...games[0], teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] }];
    // Only kept if that exact pairing happens to be in this draw.
    const kept = gamesByEntrant(stale, byId);
    expect(kept.length).toBe(byId.has(teamKey(['p1', 'p2'])) && byId.has(teamKey(['p3', 'p4'])) ? 1 : 0);
  });
});

describe('entrantSize', () => {
  it('is two for pairs and one for everything else', () => {
    expect(entrantSize(FORMATS.PAIRS)).toBe(2);
    expect(entrantSize(FORMATS.SINGLES)).toBe(1);
    expect(entrantSize(FORMATS.AMERICANO)).toBe(1);
  });
});

describe('a pairs session end to end', () => {
  const games = () => [
    ...generatePairs(IDS, { seed: 42 }),
    ...buildBracketGames({ lastOrdinal: 6, lastRound: 3 }),
  ];

  const entrantsFor = (gs) => sessionEntrants({ session: session(), games: gs, members: MEMBERS }).entrants;

  it('runs a six-game round robin between four teams', () => {
    const gs = generatePairs(IDS, { seed: 42 });
    expect(gs).toHaveLength(6); // C(4,2)
    for (const g of gs) {
      expect(g.teamA).toHaveLength(2);
      expect(g.teamB).toHaveLength(2);
    }
  });

  it('seeds the bracket with teams, not individuals', () => {
    let gs = games();
    const teams = teamsFromGames(gs);
    // Score the round robin so team order is teams[0] > [1] > [2] > [3].
    const rank = new Map(teams.map((t, i) => [teamKey(t), teams.length - i]));
    gs = gs.map((g) =>
      g.stage === 'rr'
        ? {
            ...g,
            scoreA: rank.get(teamKey(g.teamA)) > rank.get(teamKey(g.teamB)) ? 11 : 5,
            scoreB: rank.get(teamKey(g.teamA)) > rank.get(teamKey(g.teamB)) ? 5 : 11,
            played: true,
          }
        : g
    );

    const b = resolveBracket(entrantsFor(gs), gs);
    expect(b.rr.complete).toBe(true);
    expect(b.qualifiers).toHaveLength(4);

    const sf1 = b.matches.find((m) => m.slot === 'sf1');
    const sf2 = b.matches.find((m) => m.slot === 'sf2');
    // Each semifinal side is a whole team.
    expect(sf1.teamA).toHaveLength(2);
    expect(sf1.teamB).toHaveLength(2);
    // Seed 1 v 4 and seed 2 v 3, by team.
    expect(teamKey(sf1.teamA)).toBe(b.qualifiers[0].id);
    expect(teamKey(sf1.teamB)).toBe(b.qualifiers[3].id);
    expect(teamKey(sf2.teamA)).toBe(b.qualifiers[1].id);
    expect(teamKey(sf2.teamB)).toBe(b.qualifiers[2].id);
  });

  it('crowns a team as champion', () => {
    let gs = games();
    const teams = teamsFromGames(gs);
    const rank = new Map(teams.map((t, i) => [teamKey(t), teams.length - i]));
    gs = gs.map((g) =>
      g.stage === 'rr'
        ? {
            ...g,
            scoreA: rank.get(teamKey(g.teamA)) > rank.get(teamKey(g.teamB)) ? 11 : 5,
            scoreB: rank.get(teamKey(g.teamA)) > rank.get(teamKey(g.teamB)) ? 5 : 11,
            played: true,
          }
        : g
    );

    let b = resolveBracket(entrantsFor(gs), gs);
    const play = (slot, winnerFirst) => {
      const m = b.matches.find((x) => x.slot === slot);
      gs = gs.map((g) =>
        g.slot === slot
          ? {
              ...g,
              teamA: m.teamA, teamB: m.teamB,
              scoreA: winnerFirst ? 11 : 6,
              scoreB: winnerFirst ? 6 : 11,
              played: true,
            }
          : g
      );
      b = resolveBracket(entrantsFor(gs), gs);
    };

    play('sf1', true);   // seed 1 through
    play('sf2', false);  // seed 3 through
    play('bronze', true);
    play('final', false); // seed 3 takes it

    expect(b.complete).toBe(true);
    expect(b.champion.playerIds).toHaveLength(2);
    expect(b.champion.name).toMatch(/ & /);
    expect(b.champion.id).toBe(b.qualifiers[2].id);
    expect(b.runnerUp.id).toBe(b.qualifiers[0].id);
  });

  it('ranks four teams rather than eight players', () => {
    const gs = games();
    const b = resolveBracket(entrantsFor(gs), gs);
    expect(b.standings).toHaveLength(4);
  });
});
