// Matches played as sets rather than as one game.
//
// A playoff is often played best-of-three to 11 instead of a single game to 11,
// and that can apply to any fixture — it is a property of the match, not of the
// session. So a game carries `setsA` / `setsB`: empty means one game, and any
// entries mean the match was played as sets.
//
// THE THING THAT MAKES THIS MORE THAN A DISPLAY CHANGE
//
// The winner of a best-of-three is NOT always the side that scored more points.
// 11–9, 5–11, 11–9 is won two sets to one by a side that scored 27 to 29. Every
// place that decided a winner by comparing the two totals is therefore wrong for
// a set match, which is why winnerOf() exists and why standings.js and
// bracket.js both call it instead of comparing scores themselves.
//
// `scoreA` / `scoreB` stay meaningful: for a set match they hold the TOTAL
// points across the sets, so points for, against and difference keep counting
// what they always counted. Only the win is decided differently.
//
// Pure: a game in, an answer out.

/** Best of three. Stored as an array, so best-of-five is a change here alone. */
export const BEST_OF = 3;

/** How many sets take the match. */
export const SETS_TO_WIN = Math.ceil(BEST_OF / 2);

/** True once a game has any set on it. */
export const isMultiSet = (game) =>
  Array.isArray(game?.setsA) && game.setsA.length > 0;

/**
 * The completed sets, as [a, b] pairs.
 *
 * A half-entered set — one score typed, the other still blank — is not a set
 * yet and is skipped rather than counted as a win for whoever typed first.
 */
export function setPairs(game) {
  const a = game?.setsA ?? [];
  const b = game?.setsB ?? [];
  const pairs = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] == null || b[i] == null) continue;
    pairs.push([a[i], b[i]]);
  }
  return pairs;
}

/** How many sets each side has taken. A level set counts for neither. */
export function setsWon(game) {
  let a = 0;
  let b = 0;
  for (const [x, y] of setPairs(game)) {
    if (x > y) a += 1;
    else if (y > x) b += 1;
  }
  return { a, b };
}

/** Total points across the sets — what goes in `scoreA` / `scoreB`. */
export function aggregate(game) {
  let a = 0;
  let b = 0;
  for (const [x, y] of setPairs(game)) {
    a += x;
    b += y;
  }
  return { a, b };
}

/**
 * Who won: 'a', 'b', or null when it is not decided.
 *
 * A best-of-three needs TWO sets, not a lead. One set played is 1–0 and decides
 * nothing, and neither does 1–1 — both are matches still in progress, and
 * calling either of them a win would put the wrong side into a final.
 *
 * A single game is decided by its score, and a level score decides nothing —
 * pickleball is win-by-two so that cannot happen honestly, but scores are typed
 * by hand and a typo must not promote anybody.
 */
export function winnerOf(game) {
  if (isMultiSet(game)) {
    const { a, b } = setsWon(game);
    if (a >= SETS_TO_WIN && a > b) return 'a';
    if (b >= SETS_TO_WIN && b > a) return 'b';
    return null;
  }
  if (game?.scoreA == null || game?.scoreB == null) return null;
  if (game.scoreA === game.scoreB) return null;
  return game.scoreA > game.scoreB ? 'a' : 'b';
}

/** True once the match has a winner. */
export const isDecided = (game) => winnerOf(game) !== null;

/**
 * The numbers that belong on the scoreboard.
 *
 * Sets won for a set match — "2–1", the way a set result is written — and
 * points for a single game. The set scores themselves go underneath, via
 * setsLine().
 */
export function displayScore(game) {
  if (isMultiSet(game)) return setsWon(game);
  return { a: game?.scoreA ?? null, b: game?.scoreB ?? null };
}

/** "11–9, 9–11, 11–7", or '' for a single game. */
export const setsLine = (game) =>
  setPairs(game).map(([a, b]) => `${a}–${b}`).join(', ');

/**
 * Tidy a draft of set inputs into what should be stored.
 *
 * Trailing blank sets are dropped — a best-of-three won 2–0 has two sets, and
 * storing an empty third would make it look unfinished. A gap in the middle
 * makes the draft invalid rather than being silently closed up, because there
 * is no honest way to guess which set the missing one was.
 *
 * @returns {{ ok: boolean, error?: string, setsA?: number[], setsB?: number[] }}
 */
export function normaliseSets(draft = []) {
  const rows = draft.map(({ a, b }) => ({
    a: a === '' || a == null ? null : Number(a),
    b: b === '' || b == null ? null : Number(b),
  }));

  // Trim from the end while both halves are blank.
  let end = rows.length;
  while (end > 0 && rows[end - 1].a == null && rows[end - 1].b == null) end -= 1;
  const kept = rows.slice(0, end);

  if (kept.length === 0) return { ok: false, error: 'Enter at least one set.' };
  if (kept.length > BEST_OF) return { ok: false, error: `Best of ${BEST_OF} is ${BEST_OF} sets.` };

  for (let i = 0; i < kept.length; i++) {
    const { a, b } = kept[i];
    if (a == null || b == null) {
      return { ok: false, error: `Set ${i + 1} needs a score on both sides.` };
    }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      return { ok: false, error: `Set ${i + 1} needs whole numbers.` };
    }
  }

  const setsA = kept.map((r) => r.a);
  const setsB = kept.map((r) => r.b);

  if (!isDecided({ setsA, setsB })) {
    return {
      ok: false,
      error: `Nobody has won ${SETS_TO_WIN} sets yet.`,
      setsA,
      setsB,
    };
  }

  return { ok: true, setsA, setsB };
}

/** An empty draft for the entry UI: one row per possible set. */
export const emptyDraft = () =>
  Array.from({ length: BEST_OF }, () => ({ a: '', b: '' }));

/** Fill a draft from a stored game, so editing starts from what is there. */
export function draftFrom(game) {
  const rows = emptyDraft();
  setPairs(game).forEach(([a, b], i) => {
    rows[i] = { a: String(a), b: String(b) };
  });
  return rows;
}
