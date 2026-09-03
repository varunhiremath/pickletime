// The knockout stage.
//
// A session can end with a playoff: once the round robin is complete the top
// four seeds play semifinals, the winners meet in the final, and the losers play
// off for third. One champion at the end.
//
// The important design decision here is that the bracket is *derived*, not
// scheduled. The four fixtures exist in the database from the moment the session
// is created, but they start with empty teams — nobody knows who plays a
// semifinal until the round robin has finished. resolveBracket() works out who
// belongs in each slot from the standings and from the results of the earlier
// knockout games.
//
// Two consequences worth stating:
//
//   * Correcting a round-robin score after the fact reshuffles the seeds, and
//     the bracket follows automatically. Nothing has to be regenerated.
//   * Once a knockout game has been scored, the participants are stored on the
//     row (submit_score persists them) and STORED WINS OVER DERIVED. Who played
//     a semifinal is a fact once it has been played, not a live derivation — a
//     late round-robin correction must not silently rewrite history.
//
// Pure: players and games in, a bracket out. No DB, no clock, no DOM.

import { computeStandings } from './standings.js';

export const STAGE = {
  RR: 'rr',
  SEMI: 'sf',
  BRONZE: 'bronze',
  FINAL: 'final',
};

export const SLOT = {
  SF1: 'sf1',
  SF2: 'sf2',
  BRONZE: 'bronze',
  FINAL: 'final',
};

/** How many players the round robin has to produce for a bracket to run. */
export const BRACKET_SIZE = 4;

// The four fixtures, in the order they are played. `seeds` names which standings
// positions feed a slot directly; `feeds` names which earlier slots feed it.
export const BRACKET_SLOTS = [
  {
    slot: SLOT.SF1,
    stage: STAGE.SEMI,
    label: 'Semifinal 1',
    short: 'SF1',
    source: 'Seed 1 vs Seed 4',
    seeds: [0, 3],
    roundOffset: 1,
  },
  {
    slot: SLOT.SF2,
    stage: STAGE.SEMI,
    label: 'Semifinal 2',
    short: 'SF2',
    source: 'Seed 2 vs Seed 3',
    seeds: [1, 2],
    roundOffset: 1,
  },
  {
    slot: SLOT.BRONZE,
    stage: STAGE.BRONZE,
    label: '3rd place',
    short: '3rd',
    source: 'Semifinal losers',
    feeds: [
      { slot: SLOT.SF1, take: 'loser' },
      { slot: SLOT.SF2, take: 'loser' },
    ],
    roundOffset: 2,
  },
  {
    slot: SLOT.FINAL,
    stage: STAGE.FINAL,
    label: 'Final',
    short: 'Final',
    source: 'Semifinal winners',
    feeds: [
      { slot: SLOT.SF1, take: 'winner' },
      { slot: SLOT.SF2, take: 'winner' },
    ],
    roundOffset: 2,
  },
];

const stageOf = (g) => g?.stage ?? STAGE.RR;

/** True for an ordinary round-robin fixture. Games written before the playoff
 *  stage existed have no `stage` at all, and are round-robin by definition. */
export const isRoundRobin = (g) => stageOf(g) === STAGE.RR;
export const isKnockout = (g) => stageOf(g) !== STAGE.RR;

export const roundRobinGames = (games) => games.filter(isRoundRobin);
export const knockoutGames = (games) => games.filter(isKnockout);

const isScored = (g) => Boolean(g?.played && g.scoreA != null && g.scoreB != null);

/**
 * The winning and losing sides of a game, as id arrays.
 *
 * A drawn game has neither. Pickleball is win-by-two so a knockout cannot end
 * level, but scores are typed in by hand and a typo must not promote the wrong
 * player — an unresolved tie simply leaves the next round waiting.
 */
export function outcome(game) {
  if (!isScored(game)) return { winner: null, loser: null };
  if (game.scoreA === game.scoreB) return { winner: null, loser: null };
  const aWon = game.scoreA > game.scoreB;
  return {
    winner: aWon ? game.teamA : game.teamB,
    loser: aWon ? game.teamB : game.teamA,
  };
}

/**
 * Build the four knockout fixtures to append to a schedule.
 *
 * Teams are deliberately empty: they are filled in at render time by
 * resolveBracket(), and persisted when a score is entered.
 *
 * @param lastOrdinal  the last ordinal used by the round robin
 * @param lastRound    the last round number used by the round robin
 */
export function buildBracketGames({ lastOrdinal = 0, lastRound = 0 } = {}) {
  return BRACKET_SLOTS.map((def, i) => ({
    ordinal: lastOrdinal + i + 1,
    round: lastRound + def.roundOffset,
    court: 1,
    stage: def.stage,
    slot: def.slot,
    teamA: [],
    teamB: [],
    byes: [],
    scoreA: null,
    scoreB: null,
    played: false,
  }));
}

/**
 * Resolve a session's bracket.
 *
 * @param players  [{ id, name }] — everyone in the session
 * @param games    every game in the session, round robin and knockout alike
 *
 * @returns {{
 *   enabled: boolean,          // this session has a knockout stage
 *   rr: { total, played, remaining, complete },
 *   standings: object[],       // round-robin table, seeded order
 *   qualifiers: object[],      // the top four, once the round robin is done
 *   tiedForLastSpot: boolean,  // 4th and 5th are dead level — the cut is arbitrary
 *   matches: object[],         // one per slot, in play order
 *   champion, runnerUp, third, // standings rows, or null
 *   complete: boolean,
 * }}
 */
export function resolveBracket(players, games) {
  const ko = knockoutGames(games);
  const bySlot = new Map(ko.map((g) => [g.slot, g]));

  const rrGames = roundRobinGames(games);
  const rrPlayed = rrGames.filter(isScored).length;
  const rr = {
    total: rrGames.length,
    played: rrPlayed,
    remaining: rrGames.length - rrPlayed,
    complete: rrGames.length > 0 && rrPlayed === rrGames.length,
  };

  // Seeding uses the round robin ONLY. Counting playoff results towards the
  // table that decides the playoffs would be circular.
  const standings = computeStandings(players, rrGames);
  const qualifiers = rr.complete ? standings.slice(0, BRACKET_SIZE) : [];

  // Fourth and fifth level on every sorted criterion means the last playoff spot
  // was settled alphabetically. Worth saying out loud rather than pretending the
  // table decided it.
  const fourth = standings[BRACKET_SIZE - 1];
  const fifth = standings[BRACKET_SIZE];
  const tiedForLastSpot = Boolean(
    rr.complete && fourth && fifth && fourth.rank === fifth.rank
  );

  const enabled = ko.length > 0;
  const enoughPlayers = standings.length >= BRACKET_SIZE;

  // Resolved sides accumulate as we walk the slots in play order, so the final
  // can read the semifinal winners that were worked out a moment ago.
  const resolved = new Map();
  const matches = [];

  for (const def of BRACKET_SLOTS) {
    const game = bySlot.get(def.slot) ?? null;

    // A played game's line-up is history. Only fall back to derivation while the
    // slot is still empty.
    const stored =
      game && (game.teamA?.length || game.teamB?.length)
        ? { teamA: game.teamA ?? [], teamB: game.teamB ?? [] }
        : null;

    const derived = deriveSides(def, { qualifiers, resolved, enoughPlayers });
    const teamA = stored ? stored.teamA : derived.teamA;
    const teamB = stored ? stored.teamB : derived.teamB;

    const ready = teamA.length > 0 && teamB.length > 0;
    const { winner, loser } = outcome(game ? { ...game, teamA, teamB } : null);

    resolved.set(def.slot, { teamA, teamB, winner, loser });

    matches.push({
      slot: def.slot,
      stage: def.stage,
      label: def.label,
      source: def.source,
      game,
      teamA,
      teamB,
      ready,
      fromStored: Boolean(stored),
      scoreA: game?.scoreA ?? null,
      scoreB: game?.scoreB ?? null,
      played: isScored(game),
      // A knockout that has been scored level: a real state the UI must show,
      // because nothing downstream can move until it is corrected.
      drawn: isScored(game) && game.scoreA === game.scoreB,
      winner,
      loser,
    });
  }

  const rowFor = (ids) => {
    const id = ids?.[0];
    if (!id) return null;
    return standings.find((r) => r.id === id) ?? { id, name: '—' };
  };

  const finalMatch = matches.find((m) => m.slot === SLOT.FINAL);
  const bronzeMatch = matches.find((m) => m.slot === SLOT.BRONZE);

  return {
    enabled,
    rr,
    standings,
    qualifiers,
    tiedForLastSpot,
    matches,
    champion: rowFor(finalMatch?.winner),
    runnerUp: rowFor(finalMatch?.loser),
    third: rowFor(bronzeMatch?.winner),
    complete: Boolean(finalMatch?.winner),
  };
}

function deriveSides(def, { qualifiers, resolved, enoughPlayers }) {
  const empty = { teamA: [], teamB: [] };

  if (def.seeds) {
    if (!enoughPlayers || qualifiers.length < BRACKET_SIZE) return empty;
    const [i, j] = def.seeds;
    return { teamA: [qualifiers[i].id], teamB: [qualifiers[j].id] };
  }

  const [a, b] = def.feeds;
  return {
    teamA: resolved.get(a.slot)?.[a.take] ?? [],
    teamB: resolved.get(b.slot)?.[b.take] ?? [],
  };
}

/**
 * Which slot, if any, a game belongs to — used to label a fixture wherever it is
 * shown outside the bracket itself (the Matches list, the Score screen).
 */
export function slotLabel(game) {
  if (!game || isRoundRobin(game)) return null;
  return BRACKET_SLOTS.find((d) => d.slot === game.slot)?.label ?? 'Playoff';
}

/** The same, abbreviated to fit a pill in the game strip. */
export function slotShortLabel(game) {
  if (!game || isRoundRobin(game)) return null;
  return BRACKET_SLOTS.find((d) => d.slot === game.slot)?.short ?? 'PO';
}
