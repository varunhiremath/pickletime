// Postgres speaks snake_case, the app speaks camelCase. All translation happens
// here so no page or store ever has to know what the columns are called.
//
// Pure and dependency-free, so it is unit-tested.

export function clubFromRow(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, createdAt: Date.parse(r.created_at) || 0 };
}

export function memberFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    clubId: r.club_id,
    name: r.name,
    userId: r.user_id ?? null,
    role: r.role,
    colorIndex: r.color_index ?? 0,
    createdAt: Date.parse(r.created_at) || 0,
  };
}

export function sessionFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    clubId: r.club_id,
    name: r.name,
    date: r.date,
    startTime: r.start_time ?? null,
    format: r.format,
    playerIds: r.player_ids ?? [],
    numGames: r.num_games ?? 0,
    courts: r.courts ?? 1,
    pointsTo: r.points_to ?? 11,
    rngSeed: Number(r.rng_seed ?? 0),
    playoffs: Boolean(r.playoffs),
    status: r.status,
    createdBy: r.created_by ?? null,
    imported: Boolean(r.imported),
    createdAt: Date.parse(r.created_at) || 0,
  };
}

export function sessionToRow(s) {
  return {
    id: s.id,
    club_id: s.clubId,
    name: s.name,
    date: s.date,
    start_time: s.startTime ?? null,
    format: s.format,
    player_ids: s.playerIds ?? [],
    num_games: s.numGames ?? 0,
    courts: s.courts ?? 1,
    points_to: s.pointsTo ?? 11,
    rng_seed: s.rngSeed ?? 0,
    playoffs: Boolean(s.playoffs),
    status: s.status ?? 'live',
    created_by: s.createdBy ?? null,
    imported: Boolean(s.imported),
  };
}

export function gameFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    sessionId: r.session_id,
    ordinal: r.ordinal,
    round: r.round,
    court: r.court ?? 1,
    // Rows written before playoffs existed have no stage; they are round-robin
    // fixtures by definition. See utils/bracket.js.
    stage: r.stage ?? 'rr',
    slot: r.slot ?? null,
    teamA: r.team_a ?? [],
    teamB: r.team_b ?? [],
    byes: r.byes ?? [],
    scoreA: r.score_a ?? null,
    scoreB: r.score_b ?? null,
    played: Boolean(r.played),
    scoredBy: r.scored_by ?? null,
    updatedAt: Date.parse(r.updated_at) || 0,
  };
}

export function gameToRow(g) {
  return {
    id: g.id,
    session_id: g.sessionId,
    ordinal: g.ordinal,
    round: g.round,
    court: g.court ?? 1,
    stage: g.stage ?? 'rr',
    slot: g.slot ?? null,
    team_a: g.teamA,
    team_b: g.teamB,
    byes: g.byes ?? [],
    score_a: g.scoreA ?? null,
    score_b: g.scoreB ?? null,
    played: Boolean(g.played),
    scored_by: g.scoredBy ?? null,
  };
}

export function inviteFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    clubId: r.club_id,
    memberId: r.member_id,
    code: r.code,
    createdAt: Date.parse(r.created_at) || 0,
    expiresAt: r.expires_at ? Date.parse(r.expires_at) : null,
    claimedAt: r.claimed_at ? Date.parse(r.claimed_at) : null,
    revoked: Boolean(r.revoked),
  };
}

export function scoreEventFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    gameId: r.game_id,
    memberId: r.member_id ?? null,
    scoreA: r.score_a ?? null,
    scoreB: r.score_b ?? null,
    prevA: r.prev_a ?? null,
    prevB: r.prev_b ?? null,
    teamA: r.team_a ?? null,
    teamB: r.team_b ?? null,
    createdAt: Date.parse(r.created_at) || 0,
  };
}
