import { describe, it, expect } from 'vitest';
import {
  collapseOutbox,
  detectConflict,
  planFlush,
  applyPending,
  mergeRemote,
  describeConflict,
} from './outboxMerge.js';

const entry = (gameId, scoreA, scoreB, queuedAt, memberId = 'me') => ({
  id: `${gameId}-${queuedAt}`,
  gameId,
  scoreA,
  scoreB,
  queuedAt,
  memberId,
});

describe('collapseOutbox', () => {
  it('is empty for an empty queue', () => {
    expect(collapseOutbox([])).toEqual([]);
  });

  it('keeps a single write untouched', () => {
    const e = entry('g1', 11, 5, 100);
    expect(collapseOutbox([e])).toEqual([e]);
  });

  it('keeps only the newest write per game', () => {
    const out = collapseOutbox([
      entry('g1', 11, 5, 100),
      entry('g1', 11, 7, 200),
      entry('g1', 11, 9, 300),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ scoreB: 9, queuedAt: 300 });
  });

  it('keeps writes for different games separate', () => {
    const out = collapseOutbox([entry('g1', 11, 5, 100), entry('g2', 9, 11, 150)]);
    expect(out.map((e) => e.gameId)).toEqual(['g1', 'g2']);
  });

  it('returns entries oldest first regardless of input order', () => {
    const out = collapseOutbox([entry('g2', 1, 2, 300), entry('g1', 3, 4, 100)]);
    expect(out.map((e) => e.gameId)).toEqual(['g1', 'g2']);
  });

  it('is not confused by out-of-order queueing of the same game', () => {
    const out = collapseOutbox([entry('g1', 11, 9, 300), entry('g1', 11, 5, 100)]);
    expect(out[0].scoreB).toBe(9);
  });
});

describe('detectConflict', () => {
  const mine = entry('g1', 11, 5, 200);

  it('is null when the game does not exist remotely', () => {
    expect(detectConflict(mine, null)).toBeNull();
  });

  it('is null when the remote row predates our queued write', () => {
    expect(detectConflict(mine, { scoreA: 8, scoreB: 11, updatedAt: 100, scoredBy: 'sam' })).toBeNull();
  });

  it('is null when the remote row has no timestamp', () => {
    expect(detectConflict(mine, { scoreA: 8, scoreB: 11, updatedAt: null, scoredBy: 'sam' })).toBeNull();
  });

  it('is null when we were the one who changed it remotely', () => {
    expect(detectConflict(mine, { scoreA: 8, scoreB: 11, updatedAt: 300, scoredBy: 'me' })).toBeNull();
  });

  it('is null when the remote already holds the score we meant to write', () => {
    expect(detectConflict(mine, { scoreA: 11, scoreB: 5, updatedAt: 300, scoredBy: 'sam' })).toBeNull();
  });

  it('reports a genuine overwrite with both sides', () => {
    const conflict = detectConflict(mine, { scoreA: 8, scoreB: 11, updatedAt: 300, scoredBy: 'sam' });
    expect(conflict).toMatchObject({
      gameId: 'g1',
      mine: { scoreA: 11, scoreB: 5, at: 200 },
      theirs: { scoreA: 8, scoreB: 11, at: 300, by: 'sam' },
    });
  });

  it('tolerates an unknown author', () => {
    const conflict = detectConflict(mine, { scoreA: 8, scoreB: 11, updatedAt: 300 });
    expect(conflict.theirs.by).toBeNull();
  });
});

describe('planFlush', () => {
  it('sends nothing and reports nothing for an empty queue', () => {
    expect(planFlush([], new Map())).toEqual({ toSend: [], conflicts: [] });
  });

  it('sends collapsed writes with no conflicts when the server is untouched', () => {
    const { toSend, conflicts } = planFlush(
      [entry('g1', 11, 5, 100), entry('g1', 11, 7, 200)],
      new Map()
    );
    expect(toSend).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  it('flags only the games somebody else changed', () => {
    const remote = new Map([
      ['g1', { scoreA: 3, scoreB: 11, updatedAt: 500, scoredBy: 'sam' }],
      ['g2', { scoreA: 11, scoreB: 2, updatedAt: 50, scoredBy: 'sam' }],
    ]);
    const { toSend, conflicts } = planFlush(
      [entry('g1', 11, 5, 200), entry('g2', 11, 6, 200)],
      remote
    );
    expect(toSend).toHaveLength(2);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].gameId).toBe('g1');
  });

  it('accepts a plain object of remote games', () => {
    const { conflicts } = planFlush([entry('g1', 11, 5, 200)], {
      g1: { scoreA: 3, scoreB: 11, updatedAt: 500, scoredBy: 'sam' },
    });
    expect(conflicts).toHaveLength(1);
  });

  it('still sends the write that conflicted — last write wins', () => {
    const { toSend } = planFlush([entry('g1', 11, 5, 200)], {
      g1: { scoreA: 3, scoreB: 11, updatedAt: 500, scoredBy: 'sam' },
    });
    expect(toSend).toHaveLength(1);
    expect(toSend[0]).toMatchObject({ scoreA: 11, scoreB: 5 });
  });
});

describe('applyPending', () => {
  it('shows the queued score immediately and marks it pending', () => {
    const out = applyPending({ id: 'g1', scoreA: null, scoreB: null, played: false }, entry('g1', 11, 5, 200));
    expect(out).toMatchObject({ scoreA: 11, scoreB: 5, played: true, pending: true, scoredBy: 'me' });
  });

  it('does not mark a half-entered score as played', () => {
    const out = applyPending({ id: 'g1' }, entry('g1', 11, null, 200));
    expect(out.played).toBe(false);
  });

  it('does not mutate the game it is given', () => {
    const game = { id: 'g1', scoreA: null };
    applyPending(game, entry('g1', 11, 5, 200));
    expect(game.scoreA).toBeNull();
  });
});

describe('mergeRemote', () => {
  it('keeps the local row when there is no remote row', () => {
    const local = { id: 'g1', scoreA: 11 };
    expect(mergeRemote(local, null)).toBe(local);
  });

  it('takes the server row when nothing is queued', () => {
    const out = mergeRemote({ id: 'g1', scoreA: 1 }, { id: 'g1', scoreA: 11, scoreB: 5 });
    expect(out).toMatchObject({ scoreA: 11, scoreB: 5, pending: false });
  });

  it('keeps our optimistic score visible while the write is still queued', () => {
    const out = mergeRemote(
      { id: 'g1' },
      { id: 'g1', scoreA: 3, scoreB: 11, updatedAt: 500 },
      entry('g1', 11, 5, 600)
    );
    expect(out).toMatchObject({ scoreA: 11, scoreB: 5, pending: true });
  });
});

describe('describeConflict', () => {
  const conflict = {
    gameId: 'g1',
    mine: { scoreA: 11, scoreB: 5, at: 200 },
    theirs: { scoreA: 3, scoreB: 11, at: 500, by: 'sam' },
  };

  it('names the other person when it can', () => {
    const msg = describeConflict(conflict, (id) => (id === 'sam' ? 'Sam' : '?'));
    expect(msg).toContain('Sam');
    expect(msg).toContain('3–11');
  });

  it('falls back to "Someone" when the author is unknown', () => {
    const msg = describeConflict({ ...conflict, theirs: { ...conflict.theirs, by: null } });
    expect(msg.startsWith('Someone')).toBe(true);
  });

  it('says plainly that the entry was replaced', () => {
    expect(describeConflict(conflict)).toContain('replaced it');
  });
});
