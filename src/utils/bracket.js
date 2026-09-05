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

/** How many entrants the round robin has to produce for a bracket to run. */
export const BRACKET_SIZE = 4;

/**
 * Stable, order-independent key for a side of a game.
 *
 * Lives here rather than in entrants.js so that module can depend on this one
 * without a cycle (schedule.js already imports this file).
 */
export const teamKey = (ids) => [...ids].sort().join('+');

/**
 * The two shapes a finish can take.
 *
 * KNOCKOUT is the tournament bracket: four entrants, semifinals, a third-place
 * game and a final. It works when the entrants are the things that play — one
 * player in singles, one fixed pair in doubles pairs.
 *
 * FINAL_ONLY is the Americano finish. Partners rotate all session there, so the
 * table ranks individuals and there is no standing team to seed. The convention
 * is to pair the top four for one deciding game — seeds 1 and 4 against seeds 2
 * and 3, which balances the sides on paper so the final is a contest rather than
 * a foregone conclusion. One game, because four players make only two teams and
 * two teams cannot fill a bracket.
 */
export const SHAPES = {
  KNOCKOUT: 'knockout',
  FINAL_ONLY: 'final_only',
};

// The knockout fixtures, in the order they are played. `seeds` names which
// standings positions feed a slot directly; `feeds` names which earlier slots
// feed it; `pairs` combines two seeds into one side.
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

/** The Americano finish: one game, each side made of two seeds. */
export const FINAL_ONLY_SLOTS = [
  {
    slot: SLOT.FINAL,
    stage: STAGE.FINAL,
    label: 'Final',
    short: 'Final',
    source: 'Seeds 1 & 4 vs Seeds 2 & 3',
    pairs: [[0, 3], [1, 2]],
    roundOffset: 1,
  },
];

const SLOTS_FOR = {
  [SHAPES.KNOCKOUT]: BRACKET_SLOTS,
  [SHAPES.FINAL_ONLY]: FINAL_ONLY_SLOTS,
};

/** Every slot definition, for labelling a fixture wherever it turns up. */
const ALL_SLOTS = [...BRACKET_SLOTS, ...FINAL_ONLY_SLOTS];

/**
 * Which shape a session's finish is, read off the fixtures themselves.
 *
 * Derived rather than stored, for the same reason the pairs draw is: the games
 * already say it, and a column could disagree with them.
 */
export function shapeOf(games) {
  const ko = knockoutGames(games);
  if (ko.length === 0) return null;
  return ko.some((g) => g.slot === SLOT.SF1 || g.slot === SLOT.SF2)
    ? SHAPES.KNOCKOUT
    : SHAPES.FINAL_ONLY;
}

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
export function buildBracketGames({ lastOrdinal = 0, lastRound = 0, shape = SHAPES.KNOCKOUT } = {}) {
  return (SLOTS_FOR[shape] ?? BRACKET_SLOTS).map((def, i) => ({
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
 * @param entrants  who is being ranked: [{ id, name, playerIds }]. In singles
 *   that is one player each; in fixed pairs it is a team, and the bracket seeds
 *   teams rather than individuals. `playerIds` defaults to [id], so a plain
 *   list of players still works. See utils/entrants.js.
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
export function resolveBracket(entrants, games) {
  const field = (entrants ?? []).map((e) => ({
    ...e,
    playerIds: e.playerIds ?? [e.id],
  }));
  const byKey = new Map(field.map((e) => [teamKey(e.playerIds), e]));
  const byId = new Map(field.map((e) => [e.id, e]));

  // Collapse each side to the single entrant that played it. computeStandings
  // credits whatever ids sit on a side, so a pair reduced to its team key looks
  // exactly like a player to it — one ranking implementation, both shapes.
  const entrantOf = (ids) => {
    if (!ids?.length) return null;
    return byKey.get(teamKey(ids)) ?? null;
  };
  const collapse = (list) => {
    const out = [];
    for (const g of list) {
      const a = entrantOf(g.teamA);
      const b = entrantOf(g.teamB);
      // A side that matches no current entrant is a fixture from before a
      // redraw. Crediting it to nobody beats inventing a team for it.
      if (!a || !b) continue;
      out.push({ ...g, teamA: [a.id], teamB: [b.id] });
    }
    return out;
  };

  const ko = knockoutGames(games);
  const bySlot = new Map(ko.map((g) => [g.slot, g]));
  const shape = shapeOf(games) ?? SHAPES.KNOCKOUT;
  const slots = SLOTS_FOR[shape];

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
  // Rows come back keyed by entrant id; carry the underlying players along so
  // the bracket can put actual people into a semifinal.
  const standings = computeStandings(field, collapse(rrGames)).map((row) => ({
    ...row,
    playerIds: byId.get(row.id)?.playerIds ?? [row.id],
  }));
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
  const enoughEntrants = standings.length >= BRACKET_SIZE;

  // Resolved sides accumulate as we walk the slots in play order, so the final
  // can read the semifinal winners that were worked out a moment ago.
  const resolved = new Map();
  const matches = [];

  for (const def of slots) {
    const game = bySlot.get(def.slot) ?? null;

    // A played game's line-up is history. Only fall back to derivation while the
    // slot is still empty.
    const stored =
      game && (game.teamA?.length || game.teamB?.length)
        ? { teamA: game.teamA ?? [], teamB: game.teamB ?? [] }
        : null;

    const derived = deriveSides(def, { qualifiers, resolved, enoughEntrants });
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

  // A winner arrives as player ids, so look the row up by the side's key rather
  // than by its first player — in pairs those are different things.
  /**
   * The standings row for a winning side.
   *
   * In the Americano finish the winners are two individuals who partnered for
   * that one game, so there is no row to find — the podium gets a name built
   * from the people on it instead of nothing at all.
   */
  const rowFor = (ids) => {
    if (!ids?.length) return null;
    const entrant = entrantOf(ids);
    if (entrant) return standings.find((r) => r.id === entrant.id) ?? null;
    const names = ids.map((id) => byId.get(id)?.name ?? '—');
    return { id: teamKey(ids), name: names.join(' & '), playerIds: [...ids] };
  };

  const finalMatch = matches.find((m) => m.slot === SLOT.FINAL);
  const bronzeMatch = matches.find((m) => m.slot === SLOT.BRONZE);

  return {
    enabled,
    shape,
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

function deriveSides(def, { qualifiers, resolved, enoughEntrants }) {
  const empty = { teamA: [], teamB: [] };

  if (def.seeds) {
    if (!enoughEntrants || qualifiers.length < BRACKET_SIZE) return empty;
    const [i, j] = def.seeds;
    // playerIds, not id: a semifinal is played by people, and in pairs the
    // entrant id is a synthetic team key that nobody could render.
    return { teamA: qualifiers[i].playerIds, teamB: qualifiers[j].playerIds };
  }

  // The Americano finish: each side is two seeds playing together, a partnership
  // that exists for this one game and is not an entrant in the table.
  if (def.pairs) {
    if (!enoughEntrants || qualifiers.length < BRACKET_SIZE) return empty;
    const side = (idx) => idx.flatMap((k) => qualifiers[k].playerIds);
    return { teamA: side(def.pairs[0]), teamB: side(def.pairs[1]) };
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
  return ALL_SLOTS.find((d) => d.slot === game.slot)?.label ?? 'Playoff';
}

/** The same, abbreviated to fit a pill in the game strip. */
export function slotShortLabel(game) {
  if (!game || isRoundRobin(game)) return null;
  return ALL_SLOTS.find((d) => d.slot === game.slot)?.short ?? 'PO';
}
