import { describe, it, expect } from 'vitest';
import {
  isActive,
  activeMembers,
  inactiveMembers,
  splitRoster,
  canDeactivate,
  deactivateBlockedReason,
} from './roster.js';

const m = (id, active) => ({ id, name: id, ...(active === undefined ? {} : { active }) });

describe('isActive', () => {
  it('is true for an active member', () => {
    expect(isActive({ id: 'a', active: true })).toBe(true);
  });

  it('is false only for an explicit false', () => {
    expect(isActive({ id: 'a', active: false })).toBe(false);
  });

  it('treats a missing flag as active', () => {
    // Every row written before this existed has no `active` field. The whole
    // club going inactive on upgrade would be a spectacular way to fail.
    expect(isActive({ id: 'a' })).toBe(true);
    expect(isActive({ id: 'a', active: undefined })).toBe(true);
    expect(isActive({ id: 'a', active: null })).toBe(true);
  });

  it('is false for nothing at all', () => {
    expect(isActive(null)).toBe(true);
    expect(isActive(undefined)).toBe(true);
  });
});

describe('activeMembers / inactiveMembers', () => {
  const roster = [m('a'), m('b', true), m('c', false), m('d', true), m('e', false)];

  it('keeps the active ones in order', () => {
    expect(activeMembers(roster).map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });

  it('keeps the inactive ones in order', () => {
    expect(inactiveMembers(roster).map((x) => x.id)).toEqual(['c', 'e']);
  });

  it('accounts for everybody between them', () => {
    expect(activeMembers(roster).length + inactiveMembers(roster).length).toBe(roster.length);
  });

  it('handles an empty roster', () => {
    expect(activeMembers([])).toEqual([]);
    expect(inactiveMembers([])).toEqual([]);
    expect(activeMembers()).toEqual([]);
    expect(inactiveMembers()).toEqual([]);
  });
});

describe('splitRoster', () => {
  it('splits once rather than filtering twice', () => {
    const { active, inactive } = splitRoster([m('a'), m('b', false), m('c', true)]);
    expect(active.map((x) => x.id)).toEqual(['a', 'c']);
    expect(inactive.map((x) => x.id)).toEqual(['b']);
  });

  it('handles nothing', () => {
    expect(splitRoster([])).toEqual({ active: [], inactive: [] });
    expect(splitRoster()).toEqual({ active: [], inactive: [] });
  });
});

describe('canDeactivate', () => {
  const four = [m('a'), m('b'), m('c'), m('d')];

  it('allows it while three or more are still playing', () => {
    expect(canDeactivate(four[0], four)).toBe(true);
  });

  it('refuses to leave fewer than two active players', () => {
    const three = [m('a'), m('b'), m('c', false)];
    // Two active. Deactivating one leaves a club that cannot field a fixture.
    expect(canDeactivate(three[0], three)).toBe(false);
    expect(deactivateBlockedReason(three[0], three)).toBe(
      'A club needs at least two active players.'
    );
  });

  it('gives no reason when it is allowed', () => {
    expect(deactivateBlockedReason(four[0], four)).toBeNull();
  });

  it('is false for somebody already inactive', () => {
    const roster = [m('a'), m('b'), m('c'), m('d', false)];
    expect(canDeactivate(roster[3], roster)).toBe(false);
    // Not an error though — there is nothing to explain, they are already out.
    expect(deactivateBlockedReason(roster[3], roster)).toBeNull();
  });

  it('ignores role entirely', () => {
    // Being away for a season does not make you less of an admin: the last
    // admin can be an inactive one, setting the session up without playing.
    const roster = [
      { id: 'a', role: 'admin' },
      { id: 'b', role: 'player' },
      { id: 'c', role: 'player' },
    ];
    expect(canDeactivate(roster[0], roster)).toBe(true);
  });

  it('is false for nothing', () => {
    expect(canDeactivate(null, four)).toBe(false);
    expect(canDeactivate()).toBe(false);
    expect(deactivateBlockedReason(null, four)).toBeNull();
  });
});
