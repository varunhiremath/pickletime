// Building a set of doubles teams by hand.
//
// The random draw suits a social morning; a real doubles competition is the
// other way round — pairs register together and the organiser enters them as
// they are. This is the state machine behind that screen, kept pure so the
// fiddly parts (partial pairings, breaking a team back up, filling the rest at
// random) are tested rather than eyeballed.
//
// A draft is just the list of teams formed so far. Anyone in the field who is
// not on one is still available.

import { mulberry32, shuffle } from './rng.js';

/** Players in the field who are not yet on a team, in field order. */
export function unpaired(playerIds, teams) {
  const taken = new Set(teams.flat());
  return playerIds.filter((id) => !taken.has(id));
}

/** True when every player in the field is on a team. */
export function isComplete(playerIds, teams) {
  return (
    playerIds.length > 0 &&
    playerIds.length % 2 === 0 &&
    unpaired(playerIds, teams).length === 0 &&
    teams.every((t) => t.length === 2)
  );
}

/**
 * Tap a player.
 *
 * One tap selects; a second tap on a different player pairs them. Tapping the
 * selected player again deselects. Tapping somebody who is already on a team
 * breaks that team up and leaves both of them available, which is what "I typed
 * the wrong partner" needs — there is no separate delete affordance to find.
 *
 * @returns { teams, selected }
 */
export function tapPlayer({ teams, selected, playerId }) {
  const onTeam = teams.find((t) => t.includes(playerId));
  if (onTeam) {
    return {
      teams: teams.filter((t) => t !== onTeam),
      // Breaking a pair leaves the tapped player selected, so the common case
      // — swapping one partner — is two taps rather than four.
      selected: playerId,
    };
  }

  if (selected === playerId) return { teams, selected: null };

  if (selected == null) return { teams, selected: playerId };

  return { teams: [...teams, [selected, playerId]], selected: null };
}

/** Break one team apart, returning both players to the pool. */
export function breakTeam({ teams, index }) {
  return teams.filter((_, i) => i !== index);
}

/**
 * Pair up whoever is left, at random.
 *
 * Keeps the teams already formed — the organiser has entered the pairs that
 * registered together, and the rest are made up on the day. An odd number left
 * over leaves one player unpaired rather than guessing.
 */
export function fillRemaining({ playerIds, teams, seed = 1 }) {
  const pool = shuffle(unpaired(playerIds, teams), mulberry32(seed));
  const next = teams.slice();
  for (let i = 0; i + 1 < pool.length; i += 2) next.push([pool[i], pool[i + 1]]);
  return next;
}

/** Throw the whole draft away and draw every team at random. */
export function drawAll({ playerIds, seed = 1 }) {
  return fillRemaining({ playerIds, teams: [], seed });
}

/**
 * Drop anyone no longer in the field, and any team left half-empty by that.
 *
 * The picker sits next to the "who's playing" chips, so the field changes under
 * it constantly. Without this, deselecting a player would leave them on a team
 * that then fails validation with nothing on screen explaining why.
 */
export function pruneToField({ playerIds, teams }) {
  const field = new Set(playerIds);
  return teams.filter((t) => t.length === 2 && t.every((id) => field.has(id)));
}

/**
 * What the screen should say about the current draft. One message, because a
 * list of simultaneous complaints is harder to act on than the next single step.
 */
export function draftStatus({ playerIds, teams }) {
  if (playerIds.length === 0) return { ok: false, message: 'Pick who is playing first.' };
  if (playerIds.length % 2 === 1) {
    return { ok: false, message: `${playerIds.length} players can't be paired evenly — add or drop one.` };
  }
  if (playerIds.length < 4) return { ok: false, message: 'Doubles needs at least four players.' };

  const left = unpaired(playerIds, teams).length;
  if (left > 0) {
    return { ok: false, message: `${left} still to pair.` };
  }
  return { ok: true, message: `${teams.length} teams ready.` };
}
