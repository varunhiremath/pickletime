// Who is still playing, and who used to.
//
// Deleting somebody was the only way to get them off the roster, and deleting
// takes their fixtures and every score on them with it — the standings of a
// session they played in three months ago quietly change. That is the right
// behaviour for a name typed by mistake and completely the wrong one for
// somebody who moved away.
//
// So a member is `active` or not. Inactive is a roster state, nothing more:
// they keep every game they played, every result stands, their player page
// still works, and the sessions they were part of are untouched. They are just
// not offered for the next one.
//
// Kept separate from `role`, which is about permission rather than
// participation. An admin who is away for a season is still an admin; a player
// who never organises anything is still playing.
//
// All pure, so it is tested rather than eyeballed.

/**
 * Is this member still playing?
 *
 * Missing means yes. Every member row written before this existed has no
 * `active` field at all, and the whole club going inactive on upgrade would be
 * a spectacular way to fail.
 */
export const isActive = (member) => member?.active !== false;

/** The members offered for a new session. */
export const activeMembers = (members = []) => members.filter(isActive);

/** The ones who have stepped back. */
export const inactiveMembers = (members = []) => members.filter((m) => !isActive(m));

/**
 * The roster split for display, each part in the order it was given.
 *
 * Returned as one object rather than two calls so a caller cannot show a
 * filtered "active" list next to an unfiltered count and have the two disagree.
 */
export function splitRoster(members = []) {
  const active = [];
  const inactive = [];
  for (const m of members) (isActive(m) ? active : inactive).push(m);
  return { active, inactive };
}

/**
 * Can this member be made inactive?
 *
 * The one thing that must not happen is a club with nobody left to play. A
 * club needs two to make a fixture, so the last two active members stay.
 *
 * Deliberately says nothing about `role`. Being away for a season does not
 * make you less of an admin, and the last admin can still be an inactive one —
 * they can set the session up and not play in it.
 */
export function canDeactivate(member, members = []) {
  if (!member || !isActive(member)) return false;
  return activeMembers(members).length > 2;
}

/** Why not, in words, or null when it is allowed. */
export function deactivateBlockedReason(member, members = []) {
  if (!member) return null;
  if (!isActive(member)) return null;
  if (activeMembers(members).length <= 2) {
    return 'A club needs at least two active players.';
  }
  return null;
}
