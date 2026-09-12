import { describe, it, expect } from 'vitest';
import {
  nameCarriesTime,
  parseIsoDate,
  playLabel,
  formatClockTime,
  defaultSessionName,
  nameCarriesDate,
} from './sessionName.js';

describe('parseIsoDate', () => {
  it('reads the parts out of an ISO date', () => {
    expect(parseIsoDate('2026-09-13')).toEqual({
      year: 2026,
      month: 9,
      day: 13,
      weekday: 0,
      monthName: 'Sept',
      weekdayName: 'Sunday',
    });
  });

  it('is UTC, so the day never slips west of Greenwich', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    expect(parseIsoDate('2026-09-13').weekdayName).toBe('Sunday');
    process.env.TZ = 'Pacific/Auckland';
    expect(parseIsoDate('2026-09-13').weekdayName).toBe('Sunday');
    process.env.TZ = tz;
  });

  it('handles a leap day', () => {
    expect(parseIsoDate('2028-02-29').weekdayName).toBe('Tuesday');
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-09-00')).toBeNull();
  });

  it('rejects anything that is not an ISO date', () => {
    expect(parseIsoDate('13/09/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
});

describe('playLabel', () => {
  it('names singles', () => {
    expect(playLabel('singles')).toBe('Singles');
  });

  it('calls both kinds of doubles "Doubles"', () => {
    expect(playLabel('doubles_pairs')).toBe('Doubles');
    expect(playLabel('doubles_americano')).toBe('Doubles');
  });

  it('does not guess at an unknown format', () => {
    expect(playLabel('something_else')).toBe('Doubles');
  });
});

describe('formatClockTime', () => {
  it('renders a 12-hour time', () => {
    expect(formatClockTime('09:00')).toBe('9:00 am');
    expect(formatClockTime('18:30')).toBe('6:30 pm');
  });

  it('gets both ends of the day right', () => {
    expect(formatClockTime('00:15')).toBe('12:15 am');
    expect(formatClockTime('12:00')).toBe('12:00 pm');
  });

  it('rejects nonsense', () => {
    expect(formatClockTime('25:00')).toBeNull();
    expect(formatClockTime('9:70')).toBeNull();
    expect(formatClockTime('')).toBeNull();
    expect(formatClockTime(null)).toBeNull();
  });
});

describe('defaultSessionName', () => {
  it('names a doubles session by date and play', () => {
    expect(defaultSessionName({ date: '2026-09-13', format: 'doubles_pairs' })).toBe(
      'Sept 13 · Sunday Doubles'
    );
  });

  it('names a singles session the same way', () => {
    expect(defaultSessionName({ date: '2026-09-05', format: 'singles' })).toBe(
      'Sept 5 · Saturday Singles'
    );
  });

  it('does not distinguish Americano from fixed pairs', () => {
    const a = defaultSessionName({ date: '2026-09-13', format: 'doubles_americano' });
    const b = defaultSessionName({ date: '2026-09-13', format: 'doubles_pairs' });
    expect(a).toBe(b);
    expect(a).toBe('Sept 13 · Sunday Doubles');
  });

  it('spells the month the way people write it', () => {
    expect(defaultSessionName({ date: '2026-01-02', format: 'singles' })).toContain('Jan 2');
    expect(defaultSessionName({ date: '2026-05-20', format: 'singles' })).toContain('May 20');
    expect(defaultSessionName({ date: '2026-09-01', format: 'singles' })).toContain('Sept 1');
    expect(defaultSessionName({ date: '2026-12-25', format: 'singles' })).toContain('Dec 25');
  });

  it('gives the second session of the day its start time', () => {
    const first = defaultSessionName({ date: '2026-09-13', format: 'doubles_pairs' });
    const second = defaultSessionName({
      date: '2026-09-13',
      format: 'doubles_pairs',
      startTime: '18:00',
      taken: [first],
    });
    expect(second).toBe('Sept 13 · Sunday Doubles · 6:00 pm');
  });

  it('falls back to a counter when there is no time to tell them apart', () => {
    const first = defaultSessionName({ date: '2026-09-13', format: 'singles' });
    const second = defaultSessionName({ date: '2026-09-13', format: 'singles', taken: [first] });
    expect(second).toBe('Sept 13 · Sunday Singles · 2');
    const third = defaultSessionName({
      date: '2026-09-13',
      format: 'singles',
      taken: [first, second],
    });
    expect(third).toBe('Sept 13 · Sunday Singles · 3');
  });

  it('counts past a taken time too', () => {
    const taken = ['Sept 13 · Sunday Doubles', 'Sept 13 · Sunday Doubles · 6:00 pm'];
    expect(
      defaultSessionName({ date: '2026-09-13', format: 'doubles_pairs', startTime: '18:00', taken })
    ).toBe('Sept 13 · Sunday Doubles · 2');
  });

  it('ignores case and stray spaces when checking what is taken', () => {
    expect(
      defaultSessionName({
        date: '2026-09-13',
        format: 'singles',
        taken: ['  sept 13 · sunday singles '],
      })
    ).toBe('Sept 13 · Sunday Singles · 2');
  });

  it("does not collide with somebody else's day", () => {
    expect(
      defaultSessionName({
        date: '2026-09-13',
        format: 'singles',
        taken: ['Sept 12 · Saturday Singles'],
      })
    ).toBe('Sept 13 · Sunday Singles');
  });

  it('still returns something usable without a date', () => {
    expect(defaultSessionName({ format: 'doubles_pairs' })).toBe('Doubles');
    expect(defaultSessionName({ date: 'nope', format: 'singles' })).toBe('Singles');
  });

  it('survives being called with nothing at all', () => {
    expect(defaultSessionName()).toBe('Doubles');
  });
});

describe('nameCarriesDate', () => {
  it('is true for a name this module generated', () => {
    const name = defaultSessionName({ date: '2026-09-13', format: 'doubles_pairs' });
    expect(nameCarriesDate(name, '2026-09-13')).toBe(true);
  });

  it('accepts every way people spell the month', () => {
    expect(nameCarriesDate('Sep 13 doubles', '2026-09-13')).toBe(true);
    expect(nameCarriesDate('Sept 13 doubles', '2026-09-13')).toBe(true);
    expect(nameCarriesDate('September 13 doubles', '2026-09-13')).toBe(true);
    expect(nameCarriesDate('13 September grudge match', '2026-09-13')).toBe(true);
  });

  it('is false for a name that says nothing about the date', () => {
    expect(nameCarriesDate('Sunday Doubles', '2026-09-13')).toBe(false);
    expect(nameCarriesDate('Saturday morning', '2026-09-13')).toBe(false);
    expect(nameCarriesDate('Session', '2026-09-13')).toBe(false);
  });

  it('needs the month AND the day, not either one', () => {
    expect(nameCarriesDate('Sept doubles', '2026-09-13')).toBe(false);
    expect(nameCarriesDate('13 doubles', '2026-09-13')).toBe(false);
  });

  it('is false when the name carries a different date', () => {
    expect(nameCarriesDate('Sept 13 · Sunday Doubles', '2026-09-20')).toBe(false);
    expect(nameCarriesDate('Aug 13 · Thursday Doubles', '2026-09-13')).toBe(false);
  });

  it('does not match a day number buried in a longer number', () => {
    expect(nameCarriesDate('Sept 2013 reunion', '2026-09-13')).toBe(false);
    expect(nameCarriesDate('Sept court 131', '2026-09-13')).toBe(false);
  });

  it('matches a day at either end of the name', () => {
    expect(nameCarriesDate('13 Sept', '2026-09-13')).toBe(true);
    expect(nameCarriesDate('Sept 13', '2026-09-13')).toBe(true);
  });

  it('is false for anything unusable', () => {
    expect(nameCarriesDate('', '2026-09-13')).toBe(false);
    expect(nameCarriesDate(null, '2026-09-13')).toBe(false);
    expect(nameCarriesDate('Sept 13 · Sunday Doubles', 'nope')).toBe(false);
    expect(nameCarriesDate('Sept 13 · Sunday Doubles', null)).toBe(false);
  });
});

describe('nameCarriesTime', () => {
  it('is true for a name the generator gave a time', () => {
    expect(nameCarriesTime('Sept 13 · Sunday Doubles · 6:00 pm', '18:00')).toBe(true);
  });

  it('ignores spacing and case', () => {
    expect(nameCarriesTime('Doubles 6:00PM', '18:00')).toBe(true);
    expect(nameCarriesTime('Doubles 6:00 Pm', '18:00')).toBe(true);
  });

  it('is false for a different time', () => {
    expect(nameCarriesTime('Sept 13 · Sunday Doubles · 6:00 pm', '09:00')).toBe(false);
  });

  it('is false when there is no time in the name', () => {
    expect(nameCarriesTime('Sept 13 · Sunday Doubles', '18:00')).toBe(false);
  });

  it('is false for anything unusable', () => {
    expect(nameCarriesTime('', '18:00')).toBe(false);
    expect(nameCarriesTime(null, '18:00')).toBe(false);
    expect(nameCarriesTime('Doubles · 6:00 pm', null)).toBe(false);
    expect(nameCarriesTime('Doubles · 6:00 pm', 'nope')).toBe(false);
  });
});
