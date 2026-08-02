import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSupabaseBackend } from '../src/sync/supabaseBackend.js';
import { supabase, isSupabaseConfigured } from '../src/sync/supabaseClient.js';
import { db } from '../src/db/db.js';
import { CONNECTION } from '../src/sync/backend.js';
import { FORMATS } from '../src/utils/schedule.js';

// Drives the real supabaseBackend against the real project.
//
// The layer that unit tests cannot reach: rls.test.mjs proves the database rules
// with raw SQL, and rowMap.test.js proves the mapping with hand-written
// fixtures — but a fixture that doesn't match a real row proves nothing. This
// closes that gap by round-tripping actual rows through the actual methods.
//
//   npm run test:live

const configured = isSupabaseConfigured();
const describeLive = configured ? describe : describe.skip;

if (!configured) {
  console.warn('\nVITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping live tests.\n');
}

describeLive('supabaseBackend against the live project', () => {
  let backend;
  let clubId = null;
  let adminMemberId;
  let friendMemberId;

  beforeAll(async () => {
    backend = createSupabaseBackend();
    const { club, member } = await backend.createClub({
      name: 'Backend scratch club',
      adminName: 'Admin',
    });
    clubId = club.id;
    adminMemberId = member.id;
  });

  afterAll(async () => {
    if (clubId) await supabase.from('clubs').delete().eq('id', clubId);
    await db.delete().catch(() => {});
  });

  it('creates a club and binds the caller as its admin', async () => {
    const identity = await backend.getIdentity();
    expect(identity.clubId).toBe(clubId);
    expect(identity.memberId).toBe(adminMemberId);
    expect(identity.role).toBe('admin');
    expect(identity.userId).toBeTruthy();
  });

  it('maps the club row into the app shape', async () => {
    const club = await backend.getClub();
    expect(club).toMatchObject({ id: clubId, name: 'Backend scratch club' });
    // A camelCase/snake_case slip would leave this NaN or undefined.
    expect(typeof club.createdAt).toBe('number');
    expect(club.createdAt).toBeGreaterThan(0);
    expect(club).not.toHaveProperty('created_at');
  });

  it('mirrors reads into the local cache so the app opens offline', async () => {
    await backend.getClub();
    const cached = await db.clubs.get(clubId);
    expect(cached?.name).toBe('Backend scratch club');
  });

  it('adds a member with every field mapped', async () => {
    const member = await backend.addMember({ name: 'Friend' });
    friendMemberId = member.id;
    expect(member).toMatchObject({ clubId, name: 'Friend', role: 'player' });
    expect(member.userId).toBeNull();
    expect(typeof member.colorIndex).toBe('number');
    expect(member).not.toHaveProperty('club_id');
  });

  it('lists members in roster order', async () => {
    const members = await backend.listMembers();
    expect(members.map((m) => m.name)).toEqual(['Admin', 'Friend']);
  });

  it('renames a member', async () => {
    const renamed = await backend.renameMember(friendMemberId, 'Priya');
    expect(renamed.name).toBe('Priya');
    expect((await backend.listMembers()).map((m) => m.name)).toContain('Priya');
  });

  it('mints an invite the admin can read back', async () => {
    const { code } = await backend.mintInvite(friendMemberId);
    expect(code).toMatch(/^PT-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const invites = await backend.listInvites();
    const mine = invites.find((i) => i.memberId === friendMemberId);
    expect(mine?.code).toBe(code);
    expect(mine.revoked).toBe(false);
    expect(mine.claimedAt).toBeNull();
  });

  it('replaces the previous invite when re-minting', async () => {
    const first = await backend.mintInvite(friendMemberId);
    const second = await backend.mintInvite(friendMemberId);
    expect(second.code).not.toBe(first.code);
    const forMember = (await backend.listInvites()).filter((i) => i.memberId === friendMemberId);
    expect(forMember).toHaveLength(1);
  });

  describe('sessions and scoring', () => {
    let sessionId;
    let games;

    it('creates a session and generates its schedule server-side', async () => {
      const result = await backend.createSession({
        name: 'Live scratch session',
        format: FORMATS.SINGLES,
        playerIds: [adminMemberId, friendMemberId],
        numGames: 1,
        courts: 1,
        pointsTo: 11,
        seed: 4242,
      });
      sessionId = result.session.id;
      games = result.games;

      expect(result.session).toMatchObject({
        clubId, name: 'Live scratch session', format: FORMATS.SINGLES, pointsTo: 11,
      });
      // bigint arrives from PostgREST as a string; the RNG needs a number.
      expect(result.session.rngSeed).toBe(4242);
      expect(typeof result.session.rngSeed).toBe('number');
      expect(result.session.playerIds).toEqual([adminMemberId, friendMemberId]);
      // Two players, singles round robin → exactly one game.
      expect(games).toHaveLength(1);
    });

    it('maps game rows completely', async () => {
      const g = games[0];
      expect(g.sessionId).toBe(sessionId);
      expect(g.teamA).toEqual([adminMemberId]);
      expect(g.teamB).toEqual([friendMemberId]);
      expect(g.scoreA).toBeNull();
      expect(g.played).toBe(false);
      expect(g).not.toHaveProperty('team_a');
    });

    it('finds the session as the active one', async () => {
      const active = await backend.getActiveSession();
      expect(active?.session.id).toBe(sessionId);
    });

    it('submits a score through the RPC and writes the audit log', async () => {
      const updated = await backend.submitScore(games[0].id, 11, 7);
      expect(updated).toMatchObject({ scoreA: 11, scoreB: 7, played: true });
      expect(updated.scoredBy).toBe(adminMemberId);

      const events = await backend.listScoreEvents(games[0].id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ scoreA: 11, scoreB: 7, memberId: adminMemberId });
      expect(events[0].prevA).toBeNull();
    });

    it('records the previous score when a result is corrected', async () => {
      await backend.submitScore(games[0].id, 11, 9);
      const events = await backend.listScoreEvents(games[0].id);
      expect(events).toHaveLength(2);
      // Newest first.
      expect(events[0]).toMatchObject({ scoreA: 11, scoreB: 9, prevA: 11, prevB: 7 });
    });

    it('clears a score without losing the history', async () => {
      const cleared = await backend.submitScore(games[0].id, null, null);
      expect(cleared.played).toBe(false);
      expect(cleared.scoreA).toBeNull();
      expect(await backend.listScoreEvents(games[0].id)).toHaveLength(3);
    });

    it('preserves a zero score rather than treating it as empty', async () => {
      const zeroed = await backend.submitScore(games[0].id, 0, 11);
      expect(zeroed.scoreA).toBe(0);
      expect(zeroed.played).toBe(true);
    });

    it('refuses to reshuffle a session that already has scores', async () => {
      await expect(backend.regenerateSchedule(sessionId)).rejects.toThrow(/already have scores/i);
    });

    it('reshuffles once the scores are cleared', async () => {
      await backend.submitScore(games[0].id, null, null);
      const result = await backend.regenerateSchedule(sessionId, { seed: 99 });
      expect(result.session.rngSeed).toBe(99);
      expect(result.games).toHaveLength(1);
      expect(result.games[0].id).not.toBe(games[0].id);
    });

    it('changes session status', async () => {
      const finalised = await backend.setSessionStatus(sessionId, 'final');
      expect(finalised.status).toBe('final');
    });

    it('deletes a session and its games together', async () => {
      await backend.deleteSession(sessionId);
      expect(await backend.getSession(sessionId)).toBeNull();
      const { data } = await supabase.from('games').select('id').eq('session_id', sessionId);
      expect(data).toEqual([]);
    });
  });

  it('revokes an invite and unbinds the account', async () => {
    await backend.revokeInvite(friendMemberId);
    const invite = (await backend.listInvites()).find((i) => i.memberId === friendMemberId);
    expect(invite.revoked).toBe(true);
    const member = (await backend.listMembers()).find((m) => m.id === friendMemberId);
    expect(member.userId).toBeNull();
  });

  it('removes a member', async () => {
    await backend.removeMember(friendMemberId);
    expect((await backend.listMembers()).map((m) => m.id)).not.toContain(friendMemberId);
  });

  it('reports a live connection', () => {
    expect([CONNECTION.LIVE, CONNECTION.CONNECTING]).toContain(backend.getConnection());
  });

  // Last, because it destroys the fixture everything above depends on.
  describe('deleting the club', () => {
    it('removes the club and cascades to its rows', async () => {
      // Something to leave behind if the cascade were broken.
      const { session } = await backend.createSession({
        name: 'Doomed session',
        format: FORMATS.SINGLES,
        playerIds: [adminMemberId],
        numGames: 1,
        courts: 1,
        pointsTo: 11,
        seed: 7,
      });

      await backend.deleteClub();

      const { data: clubs } = await supabase.from('clubs').select('id').eq('id', clubId);
      expect(clubs).toEqual([]);

      const { data: sessions } = await supabase.from('sessions').select('id').eq('id', session.id);
      expect(sessions).toEqual([]);

      const { data: games } = await supabase.from('games').select('id').eq('session_id', session.id);
      expect(games).toEqual([]);

      const { data: leftoverMembers } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', clubId);
      expect(leftoverMembers).toEqual([]);

      clubId = null; // afterAll has nothing left to clean up
    });

    it('leaves the caller with no club', async () => {
      const identity = await backend.getIdentity();
      expect(identity.clubId).toBeNull();
      expect(await backend.getClub()).toBeNull();
    });

    it('refuses when there is no club to delete', async () => {
      await expect(backend.deleteClub()).rejects.toThrow(/not in a club/i);
    });
  });
});
