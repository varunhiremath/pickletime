// Standings.
//
// Ported from the original app.js computeStandings and extended with streaks,
// head-to-head and partner records.
//
// Deliberately pure and client-side: standings are a function of the games, so
// every device derives the same table from the same rows and there is no server
// logic to keep in sync. In Americano, points are credited to each *player*
// individually even though they're scored as a team — that matches how the
// format is actually played.

export const EMPTY_ROW = {
  gp: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, diff: 0, streak: 0, winPct: 0,
};

const isScored = (g) => g.played && g.scoreA != null && g.scoreB != null;

/**
 * Build the league table.
 *
 * @param players  [{ id, name }]
 * @param games    [{ teamA, teamB, scoreA, scoreB, played, ordinal }]
 * @returns rows sorted by wins → point differential → points for → name,
 *          each carrying `rank` (1-based, sharing a rank on an exact tie).
 */
export function computeStandings(players, games) {
  const stats = new Map(
    players.map((p) => [p.id, { id: p.id, name: p.name, ...EMPTY_ROW, results: [] }])
  );

  const scored = games.filter(isScored).slice().sort((a, b) => a.ordinal - b.ordinal);

  for (const g of scored) {
    const aWon = g.scoreA > g.scoreB;
    const tie = g.scoreA === g.scoreB;

    const credit = (ids, forPts, againstPts, won) => {
      for (const id of ids) {
        const s = stats.get(id);
        if (!s) continue; // player removed from the roster after the game
        s.gp++;
        s.pf += forPts;
        s.pa += againstPts;
        if (tie) { s.t++; s.results.push('T'); }
        else if (won) { s.w++; s.results.push('W'); }
        else { s.l++; s.results.push('L'); }
      }
    };

    credit(g.teamA, g.scoreA, g.scoreB, aWon);
    credit(g.teamB, g.scoreB, g.scoreA, !aWon);
  }

  const rows = [...stats.values()].map((s) => {
    const decided = s.w + s.l;
    return {
      ...s,
      diff: s.pf - s.pa,
      winPct: decided === 0 ? 0 : s.w / decided,
      streak: currentStreak(s.results),
    };
  });

  rows.sort(compareRows);
  return applyRanks(rows);
}

/**
 * Trailing run of the same result, signed: +3 = three wins, -2 = two losses.
 * A tie ends a streak without starting one.
 */
export function currentStreak(results) {
  if (results.length === 0) return 0;
  const last = results[results.length - 1];
  if (last === 'T') return 0;
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return last === 'W' ? n : -n;
}

// Wins, then point differential, then points scored, then name. Matches the
// original app's ordering, with the name tie-break keeping it stable.
export function compareRows(a, b) {
  return (
    b.w - a.w ||
    b.diff - a.diff ||
    b.pf - a.pf ||
    (a.name || '').localeCompare(b.name || '')
  );
}

// Players who are exactly level on every sorted criterion share a rank.
function applyRanks(sorted) {
  let rank = 0;
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    const tiedWithPrev =
      prev && prev.w === row.w && prev.diff === row.diff && prev.pf === row.pf;
    if (!tiedWithPrev) rank = i + 1;
    return { ...row, rank };
  });
}

/**
 * Rank of each player after every scored game, for the rank-over-time chart.
 * Returns [{ ordinal, ranks: { [playerId]: rank } }].
 */
export function rankHistory(players, games) {
  const scored = games.filter(isScored).slice().sort((a, b) => a.ordinal - b.ordinal);
  const history = [];
  for (let i = 0; i < scored.length; i++) {
    const rows = computeStandings(players, scored.slice(0, i + 1));
    history.push({
      ordinal: scored[i].ordinal,
      ranks: Object.fromEntries(rows.map((r) => [r.id, r.rank])),
    });
  }
  return history;
}

/**
 * One player's record against each opponent they've faced.
 * Returns [{ id, name, w, l, t, pf, pa }] sorted by most-played.
 */
export function headToHead(playerId, players, games) {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const acc = new Map();

  for (const g of games.filter(isScored)) {
    const onA = g.teamA.includes(playerId);
    const onB = g.teamB.includes(playerId);
    if (!onA && !onB) continue;

    const mine = onA ? g.scoreA : g.scoreB;
    const theirs = onA ? g.scoreB : g.scoreA;
    const opponents = onA ? g.teamB : g.teamA;

    for (const oid of opponents) {
      if (!acc.has(oid)) acc.set(oid, { id: oid, name: nameOf.get(oid) ?? '?', w: 0, l: 0, t: 0, pf: 0, pa: 0 });
      const rec = acc.get(oid);
      rec.pf += mine;
      rec.pa += theirs;
      if (mine > theirs) rec.w++;
      else if (mine < theirs) rec.l++;
      else rec.t++;
    }
  }

  return [...acc.values()].sort((a, b) => (b.w + b.l + b.t) - (a.w + a.l + a.t));
}

/**
 * One player's record with each partner (doubles only).
 * Returns [{ id, name, gp, w, l, t }] sorted by most-played.
 */
export function partnerRecords(playerId, players, games) {
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const acc = new Map();

  for (const g of games.filter(isScored)) {
    const onA = g.teamA.includes(playerId);
    const onB = g.teamB.includes(playerId);
    if (!onA && !onB) continue;

    const myTeam = onA ? g.teamA : g.teamB;
    const mine = onA ? g.scoreA : g.scoreB;
    const theirs = onA ? g.scoreB : g.scoreA;

    for (const pid of myTeam) {
      if (pid === playerId) continue;
      if (!acc.has(pid)) acc.set(pid, { id: pid, name: nameOf.get(pid) ?? '?', gp: 0, w: 0, l: 0, t: 0 });
      const rec = acc.get(pid);
      rec.gp++;
      if (mine > theirs) rec.w++;
      else if (mine < theirs) rec.l++;
      else rec.t++;
    }
  }

  return [...acc.values()].sort((a, b) => b.gp - a.gp);
}

/** Session progress for the header — "6 of 12 played". */
export function sessionProgress(games) {
  const total = games.length;
  const played = games.filter(isScored).length;
  return { total, played, remaining: total - played, complete: total > 0 && played === total };
}
