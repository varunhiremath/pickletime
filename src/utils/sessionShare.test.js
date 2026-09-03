import { describe, it, expect } from 'vitest';
import { formatSessionDate, formatSessionTime, buildSessionShare } from './sessionShare.js';

describe('formatSessionDate', () => {
  it('formats a date as a readable day', () => {
    expect(formatSessionDate('2026-08-09')).toBe('Sun 9 Aug');
  });

  it('does not shift the day for viewers west of Greenwich', () => {
    // A date-only string is parsed as UTC midnight; formatting it in local time
    // would land on the previous day in the Americas and tell half the club to
    // show up on Saturday. Built from UTC parts, so it cannot drift.
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    expect(formatSessionDate('2026-08-09')).toBe('Sun 9 Aug');
    process.env.TZ = 'Pacific/Auckland';
    expect(formatSessionDate('2026-08-09')).toBe('Sun 9 Aug');
    process.env.TZ = original;
  });

  it('handles every weekday correctly', () => {
    expect(formatSessionDate('2026-08-10')).toBe('Mon 10 Aug');
    expect(formatSessionDate('2026-08-15')).toBe('Sat 15 Aug');
  });

  it('handles a leap day', () => {
    expect(formatSessionDate('2028-02-29')).toBe('Tue 29 Feb');
  });

  it('rejects a date that does not exist', () => {
    // Date.UTC would silently roll this into March.
    expect(formatSessionDate('2026-02-31')).toBeNull();
    expect(formatSessionDate('2026-13-01')).toBeNull();
  });

  it('rejects junk', () => {
    expect(formatSessionDate('')).toBeNull();
    expect(formatSessionDate(null)).toBeNull();
    expect(formatSessionDate('9 Aug 2026')).toBeNull();
  });
});

describe('formatSessionTime', () => {
  it('formats a morning time', () => {
    expect(formatSessionTime('09:00')).toBe('9:00 am');
  });

  it('formats an afternoon time', () => {
    expect(formatSessionTime('14:30')).toBe('2:30 pm');
  });

  it('formats midnight as 12 am, not 0 am', () => {
    expect(formatSessionTime('00:15')).toBe('12:15 am');
  });

  it('formats noon as 12 pm, not 0 pm', () => {
    expect(formatSessionTime('12:00')).toBe('12:00 pm');
  });

  it('keeps a leading zero on the minutes', () => {
    expect(formatSessionTime('7:05')).toBe('7:05 am');
  });

  it('rejects impossible times', () => {
    expect(formatSessionTime('25:00')).toBeNull();
    expect(formatSessionTime('10:75')).toBeNull();
  });

  it('rejects junk', () => {
    expect(formatSessionTime('')).toBeNull();
    expect(formatSessionTime(null)).toBeNull();
    expect(formatSessionTime('morning')).toBeNull();
  });
});

describe('buildSessionShare', () => {
  const members = [
    { id: 'a', name: 'Varun' },
    { id: 'b', name: 'Priya' },
    { id: 'c', name: 'Sam' },
    { id: 'd', name: 'Dev' },
    { id: 'e', name: 'Mira' },
  ];

  const session = {
    name: 'Sunday Tournament',
    date: '2026-08-09',
    startTime: '09:00',
    format: 'doubles_americano',
    numGames: 8,
    courts: 1,
    pointsTo: 11,
    playerIds: ['a', 'b', 'c', 'd'],
  };

  const games = [
    { ordinal: 1, round: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'], byes: ['e'] },
    { ordinal: 2, round: 2, court: 1, teamA: ['a', 'c'], teamB: ['b', 'd'], byes: ['e'] },
  ];

  it('leads with the name, date and time', () => {
    expect(buildSessionShare({ session, games, members })).toContain(
      '🥒 Sunday Tournament — Sun 9 Aug, 9:00 am'
    );
  });

  it('states the format and scoring', () => {
    const msg = buildSessionShare({ session, games, members });
    expect(msg).toContain('Doubles · Americano');
    expect(msg).toContain('8 games');
    expect(msg).toContain('to 11');
  });

  it('lists the first round with real names', () => {
    const msg = buildSessionShare({ session, games, members });
    expect(msg).toContain('Round 1');
    expect(msg).toContain('Varun & Priya vs Sam & Dev');
  });

  it('does NOT list later rounds', () => {
    // A wall of fixtures in a group chat goes unread, and the rotation makes
    // later rounds less useful anyway.
    expect(buildSessionShare({ session, games, members })).not.toContain('Priya & Dev');
  });

  it('names who is sitting out', () => {
    expect(buildSessionShare({ session, games, members })).toContain('Sitting out: Mira');
  });

  it('omits the sit-out line when everyone plays', () => {
    const noByes = [{ ...games[0], byes: [] }];
    expect(buildSessionShare({ session, games: noByes, members })).not.toContain('Sitting out');
  });

  it('shows court numbers only when there is more than one court', () => {
    const single = buildSessionShare({ session, games, members });
    expect(single).not.toContain('Court 1:');

    const twoCourts = buildSessionShare({
      session: { ...session, courts: 2 },
      games: [
        { ordinal: 1, round: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'], byes: [] },
        { ordinal: 2, round: 1, court: 2, teamA: ['e'], teamB: ['a'], byes: [] },
      ],
      members,
    });
    expect(twoCourts).toContain('Court 1:');
    expect(twoCourts).toContain('Court 2:');
  });

  it('lists every concurrent game in the first round', () => {
    const msg = buildSessionShare({
      session: { ...session, courts: 2 },
      games: [
        { ordinal: 1, round: 1, court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'], byes: [] },
        { ordinal: 2, round: 1, court: 2, teamA: ['e'], teamB: ['a'], byes: [] },
        { ordinal: 3, round: 2, court: 1, teamA: ['a'], teamB: ['b'], byes: [] },
      ],
      members,
    });
    expect(msg).toContain('Varun & Priya vs Sam & Dev');
    expect(msg).toContain('Mira vs Varun');
  });

  it('says how many are playing', () => {
    expect(buildSessionShare({ session, games, members })).toContain('4 playing');
  });

  it('includes the app link when given one', () => {
    const msg = buildSessionShare({ session, games, members, url: 'https://example.test/pickletime/' });
    expect(msg).toContain('Full schedule: https://example.test/pickletime/');
  });

  it('reads fine with no time set', () => {
    const msg = buildSessionShare({ session: { ...session, startTime: null }, games, members });
    expect(msg).toContain('🥒 Sunday Tournament — Sun 9 Aug');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('null');
  });

  it('reads fine for singles, which has no fixed game count', () => {
    const msg = buildSessionShare({
      session: { ...session, format: 'singles', playerIds: ['a', 'b', 'c'] },
      games: [{ ordinal: 1, round: 1, court: 1, teamA: ['a'], teamB: ['b'], byes: ['c'] }],
      members,
    });
    expect(msg).toContain('Singles round robin');
    expect(msg).not.toContain('8 games');
    expect(msg).toContain('Varun vs Priya');
  });

  it('falls back to a dash for a player no longer on the roster', () => {
    const msg = buildSessionShare({
      session,
      games: [{ ordinal: 1, round: 1, court: 1, teamA: ['ghost'], teamB: ['a'], byes: [] }],
      members,
    });
    expect(msg).toContain('— vs Varun');
  });

  it('handles a session with no games generated yet', () => {
    const msg = buildSessionShare({ session, games: [], members });
    expect(msg).toContain('Sunday Tournament');
    expect(msg).not.toContain('Round 1');
  });

  it('is empty with no session', () => {
    expect(buildSessionShare({ session: null })).toBe('');
    expect(buildSessionShare()).toBe('');
  });
});
