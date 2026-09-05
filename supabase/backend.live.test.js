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
  // The playoff columns and the five-argument submit_score are a schema change,
  // and a schema change that hasn't been applied to the project fails here and
  // nowhere else — the unit tests happily pass against a database that has never
  // heard of a bracket. This block is what proves the migration landed.
  describe('the knockout stage', () => {
    let poSessionId = null;
    let bracketPlayers;

    afterAll(async () => {
      if (poSessionId) await supabase.from('sessions').delete().eq('id', poSessionId);
    });

    it('creates the four knockout fixtures alongside the round robin', async () => {
      const extra = await Promise.all([
        backend.addMember({ name: 'Third' }),
        backend.addMember({ name: 'Fourth' }),
      ]);
      bracketPlayers = [adminMemberId, friendMemberId, extra[0].id, extra[1].id];

      const { session, games } = await backend.createSession({
        name: 'Live playoff session',
        format: FORMATS.SINGLES,
        playerIds: bracketPlayers,
        courts: 1,
        pointsTo: 11,
        seed: 7,
        playoffs: true,
      });
      poSessionId = session.id;

      expect(session.playoffs).toBe(true);

      // Four players → six round-robin games, plus the bracket.
      const rr = games.filter((g) => g.stage === 'rr');
      const ko = games.filter((g) => g.stage !== 'rr');
      expect(rr).toHaveLength(6);
      expect(ko.map((g) => g.slot)).toEqual(['sf1', 'sf2', 'bronze', 'final']);

      // The line-ups are deliberately empty — nobody knows who plays a semifinal
      // until the round robin is done.
      for (const g of ko) {
        expect(g.teamA).toEqual([]);
        expect(g.teamB).toEqual([]);
        expect(g.played).toBe(false);
      }
    });

    it('stores the line-up when a knockout score is submitted', async () => {
      const { games } = await backend.getSession(poSessionId);
      const sf1 = games.find((g) => g.slot === 'sf1');

      const teamA = [bracketPlayers[0]];
      const teamB = [bracketPlayers[3]];
      const saved = await backend.submitScore(sf1.id, 11, 6, { teamA, teamB });

      expect(saved).toMatchObject({ scoreA: 11, scoreB: 6, played: true });
      expect(saved.teamA).toEqual(teamA);
      expect(saved.teamB).toEqual(teamB);

      const events = await backend.listScoreEvents(sf1.id);
      expect(events[0].teamA).toEqual(teamA);
      expect(events[0].teamB).toEqual(teamB);
    });

    it('empties the line-up again when the score is cleared', async () => {
      const { games } = await backend.getSession(poSessionId);
      const sf1 = games.find((g) => g.slot === 'sf1');

      const cleared = await backend.submitScore(sf1.id, null, null);
      expect(cleared.played).toBe(false);
      expect(cleared.teamA).toEqual([]);
      expect(cleared.teamB).toEqual([]);
    });

    it('will not write another club\'s players into this club\'s bracket', async () => {
      const { games } = await backend.getSession(poSessionId);
      const sf2 = games.find((g) => g.slot === 'sf2');
      const stranger = '00000000-0000-0000-0000-000000000001';

      await expect(
        backend.submitScore(sf2.id, 11, 5, { teamA: [bracketPlayers[1]], teamB: [stranger] })
      ).rejects.toThrow(/not in this club/i);
    });

    it('leaves a round-robin line-up alone whatever the caller passes', async () => {
      const { games } = await backend.getSession(poSessionId);
      const rrGame = games.find((g) => g.stage === 'rr');
      const original = { teamA: rrGame.teamA, teamB: rrGame.teamB };

      const saved = await backend.submitScore(rrGame.id, 11, 4, {
        teamA: [bracketPlayers[2]],
        teamB: [bracketPlayers[3]],
      });

      expect(saved.teamA).toEqual(original.teamA);
      expect(saved.teamB).toEqual(original.teamB);
    });
  });

  // The format constraint lives in the database, so a new format value fails
  // against the real project and nowhere else — the unit tests happily create
  // fixed-pairs sessions against no database at all. This is what proves
  // supabase/migrate-pairs.sql was applied.
  describe('fixed-pairs doubles', () => {
    let pairsSessionId = null;

    afterAll(async () => {
      if (pairsSessionId) await supabase.from('sessions').delete().eq('id', pairsSessionId);
    });

    it('accepts doubles_pairs as a format', async () => {
      // Adds its own eight rather than slicing the roster, so the test does not
      // depend on what earlier blocks happened to leave behind.
      const eight = [];
      for (const n of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) {
        eight.push((await backend.addMember({ name: n })).id);
      }
      expect(eight).toHaveLength(8);

      const { session, games } = await backend.createSession({
        name: 'Live pairs session',
        format: FORMATS.PAIRS,
        playerIds: eight,
        courts: 1,
        pointsTo: 11,
        seed: 12,
        playoffs: true,
      });
      pairsSessionId = session.id;

      expect(session.format).toBe(FORMATS.PAIRS);
      expect(session.playoffs).toBe(true);

      // Four teams → six round-robin games, plus the four knockout fixtures.
      const rr = games.filter((g) => g.stage === 'rr');
      expect(rr).toHaveLength(6);
      expect(games.filter((g) => g.stage !== 'rr')).toHaveLength(4);
      for (const g of rr) {
        expect(g.teamA).toHaveLength(2);
        expect(g.teamB).toHaveLength(2);
      }
    });

    it('round-trips the two-player sides through the database', async () => {
      const { games } = await backend.getSession(pairsSessionId);
      const rr = games.filter((g) => g.stage === 'rr');
      // uuid[] columns must come back as arrays of two, not flattened or stringified.
      for (const g of rr) {
        expect(Array.isArray(g.teamA)).toBe(true);
        expect(g.teamA).toHaveLength(2);
        expect(g.teamB).toHaveLength(2);
      }
      // Partners are fixed: every player has exactly one partner across the set.
      const partner = new Map();
      for (const g of rr) {
        for (const side of [g.teamA, g.teamB]) {
          expect(partner.get(side[0]) ?? side[1]).toBe(side[1]);
          partner.set(side[0], side[1]);
          partner.set(side[1], side[0]);
        }
      }
      expect(partner.size).toBe(8);
    });

    it('scores a pairs fixture through the RPC', async () => {
      const { games } = await backend.getSession(pairsSessionId);
      const g = games.find((x) => x.stage === 'rr');
      const saved = await backend.submitScore(g.id, 11, 7);
      expect(saved).toMatchObject({ scoreA: 11, scoreB: 7, played: true });
      expect(saved.teamA).toHaveLength(2);
    });
  });

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
