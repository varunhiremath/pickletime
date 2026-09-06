// The playoff bracket as a tree: who was seeded where, who beat whom, and who
// went through.
//
// resolveBracket() already knows all of this, but it knows it as a flat list of
// four matches. The shape — two semifinals feeding a final, with the losers
// dropping into the third-place game — is the thing a group chat wants to see,
// and it is the thing a flat list hides.
//
// Two renderings share this one derivation:
//   * bracketTreeLines() — the text that goes into the WhatsApp message.
//   * components/bracket/BracketChart.jsx — the image, via bracketChartLayout().
//
// Pure. A bracket in, plain data out. No DOM, no canvas, no clock.

import { SLOT } from './bracket.js';

/**
 * Which seeds a side is made of.
 *
 * A knockout side is normally one entrant, so this is one number. The Americano
 * final is the exception that makes it a list: partners rotate all session, so
 * its two sides are each built from two separately-seeded players.
 *
 * Matching is by player rather than by team key on purpose — it is the only
 * thing that works for both, and a player belongs to exactly one entrant.
 */
export function seedsOf(ids, standings = []) {
  const seen = new Set();
  const ranks = [];
  for (const id of ids ?? []) {
    const row = standings.find((r) => (r.playerIds ?? [r.id]).includes(id));
    // Deduplicated by entrant, not by rank: both halves of a pair map to the
    // same row and should count once, but two players who finished joint 2nd
    // are two seeds and dropping one of them would lose a person.
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    ranks.push(row.rank);
  }
  return ranks.sort((a, b) => a - b);
}

/** "(1)" for a single seed, "(1+4)" for a partnership. Nothing when unknown. */
export function seedLabel(seeds) {
  if (!seeds || seeds.length === 0) return '';
  return `(${seeds.join('+')})`;
}

/**
 * The bracket as nodes, in the order they are played.
 *
 * Each node is one fixture:
 *   { slot, label, played, drawn, sides: [{ ids, name, seeds, score, won }],
 *     advances, advanceNote, medal }
 *
 * `advances` is the name of whoever went through (or took the medal); it is
 * null while the fixture is unplayed or was entered level. `medal` is the emoji
 * the win is worth, if it is worth one — a semifinal wins you a place in the
 * final, not a medal, and saying so is the whole point of drawing a tree.
 */
export function bracketTree({ bracket, nameOf } = {}) {
  if (!bracket?.enabled) return [];
  const name = nameOf ?? ((ids) => (ids ?? []).join(' & '));
  const standings = bracket.standings ?? [];

  return (bracket.matches ?? []).map((m) => {
    const side = (ids, score) => ({
      ids: ids ?? [],
      name: ids?.length ? name(ids) : null,
      seeds: seedsOf(ids, standings),
      score,
      // A side with no opponent yet has not won anything, whatever the scores
      // happen to say.
      won: Boolean(m.played && !m.drawn && m.winner && sameSide(ids, m.winner)),
    });

    const medal =
      m.slot === SLOT.FINAL ? '🏆' : m.slot === SLOT.BRONZE ? '🥉' : null;

    return {
      slot: m.slot,
      label: m.label,
      source: m.source,
      ready: m.ready,
      played: m.played,
      drawn: m.drawn,
      medal,
      sides: [side(m.teamA, m.scoreA), side(m.teamB, m.scoreB)],
      advances: m.winner && !m.drawn ? name(m.winner) : null,
      // What the win is actually worth, in words, because "→ Ana & Ben" on its
      // own does not say whether they have won the thing or merely progressed.
      advanceNote:
        m.slot === SLOT.FINAL ? 'champions'
        : m.slot === SLOT.BRONZE ? 'third place'
        : 'into the final',
    };
  });
}

const sameSide = (a, b) =>
  Array.isArray(a) && Array.isArray(b) &&
  a.length === b.length &&
  [...a].sort().join('+') === [...b].sort().join('+');

/**
 * The tree as chat message lines.
 *
 * Deliberately not column-aligned: group chats render in proportional fonts, so
 * anything padded with spaces to line up arrives ragged. Indentation at the
 * START of a line survives — every line begins at the same left edge — which is
 * why the structure here is carried by leading spaces and an arrow rather than
 * by box-drawing characters that would need a monospace font to join up.
 *
 * @param bracket  a resolveBracket() result
 * @param nameOf   (ids) => "Ana & Ben"
 * @returns string[]  empty when there is no bracket, or none of it was played
 */
export function bracketTreeLines({ bracket, nameOf } = {}) {
  const nodes = bracketTree({ bracket, nameOf });
  const played = nodes.filter((n) => n.played);
  if (played.length === 0) return [];

  const lines = ['Bracket'];

  for (const node of nodes) {
    if (!node.played) continue;

    const [a, b] = node.sides;
    // Winner first: "Ana 11–9 Ben" reads as a result, the other way round reads
    // as a typo. A fixture entered level keeps fixture order — there is no
    // winner to lead with.
    const [first, second] = b.won ? [b, a] : [a, b];
    const label = (s) => [seedLabel(s.seeds), s.name].filter(Boolean).join(' ');

    const tied = node.drawn ? ' (tied)' : '';
    lines.push(
      `${node.label}: ${label(first)} ${first.score}–${second.score} ${label(second)}${tied}`
    );

    if (node.drawn) {
      lines.push('   ↳ level — nobody goes through until it is corrected');
    } else if (node.advances) {
      lines.push(`   ↳ ${node.medal ? `${node.medal} ` : ''}${node.advances} ${node.advanceNote}`);
    }
  }

  const pending = nodes.filter((n) => !n.played);
  if (pending.length > 0) {
    lines.push(`Still to play: ${pending.map((n) => n.label).join(', ')}`);
  }

  return lines;
}
