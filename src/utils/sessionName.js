// What a session is called when nobody types a name.
//
// "Session", "Session (2)", "Saturday morning" told you nothing in a History
// list six weeks later. The name a session gets by default is now the two facts
// you actually look for: when it was, and what was played.
//
//   Sept 13 · Sunday Doubles
//   Sept 5 · Saturday Singles
//
// It is a default, not a rule — the field stays editable, and a session named
// by hand keeps its name.
//
// All pure, so the formatting is tested rather than eyeballed.

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// "Sept", not "Sep". It is how people write September, and it is what the month
// is called everywhere else this app shows it in a name.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
];

/**
 * "2026-09-13" → `{ year, month, day, weekday, monthName, weekdayName }`, or
 * null for anything unparseable.
 *
 * Built from UTC parts on purpose. A date-only string fed to `new Date()` is
 * parsed as UTC midnight but formatted in local time, so anyone west of
 * Greenwich sees the day before — the classic off-by-one that would tell half
 * the club to show up on Saturday.
 */
export function parseIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;

  const dt = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC silently rolls 2026-02-31 into March, so confirm it survived intact.
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;

  return {
    year,
    month,
    day,
    weekday: dt.getUTCDay(),
    monthName: MONTHS[month - 1],
    weekdayName: WEEKDAYS[dt.getUTCDay()],
  };
}

/** Singles is singles; both kinds of doubles are just "Doubles" in a name. */
export function playLabel(format) {
  return format === 'singles' ? 'Singles' : 'Doubles';
}

/** "09:00" → "9:00 am". Null for anything unparseable. Shared with the shares. */
export function formatClockTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;

  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * The name a new session gets on its own.
 *
 * @param date      ISO date, "2026-09-13"
 * @param format    a FORMATS value
 * @param startTime "18:00", used only to tell two sessions on one day apart
 * @param taken     names already in use, so a second Sunday session is not a
 *                  duplicate of the first in the History list
 *
 * Two sessions on the same day are common — a morning and an evening — and
 * two identical rows is exactly the problem this is meant to fix, so the
 * second one carries its start time. A third with no time to distinguish it
 * falls back to a counter rather than colliding.
 */
export function defaultSessionName({ date, format, startTime, taken = [] } = {}) {
  const parts = parseIsoDate(date);
  const play = playLabel(format);

  // No usable date — better a plain "Doubles" than "Invalid Date · Doubles".
  const base = parts ? `${parts.monthName} ${parts.day} · ${parts.weekdayName} ${play}` : play;

  const used = new Set((taken ?? []).filter(Boolean).map((n) => n.trim().toLowerCase()));
  const free = (candidate) => !used.has(candidate.trim().toLowerCase());
  if (free(base)) return base;

  const time = formatClockTime(startTime);
  if (time && free(`${base} · ${time}`)) return `${base} · ${time}`;

  for (let n = 2; n < 100; n++) {
    if (free(`${base} · ${n}`)) return `${base} · ${n}`;
  }
  return base;
}

/**
 * Does this name already say what time it started?
 *
 * The second session of a day is named "… · 6:00 pm" to tell it apart from the
 * morning one, which made the line underneath repeat the time straight back.
 */
export function nameCarriesTime(name, hhmm) {
  const time = formatClockTime(hhmm);
  if (!time || !name) return false;
  // Compare loosely on the spacing: "6:00 pm", "6:00pm" and "6:00 PM" are all
  // the same time to a reader, and the second session of a day carries one.
  const flat = (v) => v.toLowerCase().replace(/\s+/g, '');
  return flat(name).includes(flat(time));
}

/**
 * Does this name already say what day it was?
 *
 * The date used to be shown under the name everywhere, which now reads as a
 * stutter — "Sept 13 · Sunday Doubles" over "Sun 13 Sept". Rather than assume
 * every name is auto-generated, ask the name itself: a hand-typed "Sept 13
 * grudge match" should suppress the second date just the same, and a session
 * called "Doubles" should not.
 *
 * Deliberately loose about how the month is spelled — "Sep", "Sept" and
 * "September" all count — because people type all three.
 */
export function nameCarriesDate(name, iso) {
  const parts = parseIsoDate(iso);
  if (!parts || !name) return false;

  const hay = name.toLowerCase();
  // "Sept" and "September" both start with "sep", so the three-letter stem
  // matches every spelling without needing a list of them.
  const stem = MONTHS[parts.month - 1].slice(0, 3).toLowerCase();
  const hasMonth = hay.includes(stem);
  // Word-bounded: "13" must not match the 13 inside "2013" or "131".
  const hasDay = new RegExp(`(^|\\D)${parts.day}(\\D|$)`).test(hay);
  return hasMonth && hasDay;
}
