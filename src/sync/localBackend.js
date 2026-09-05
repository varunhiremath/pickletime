import { db, getMeta, setMeta, clearLocalData } from '../db/db.js';
import { CONNECTION, ROLES, SESSION_STATUS } from './backend.js';
import { generateSchedule } from '../utils/schedule.js';
import { roundRobinGames, isKnockout } from '../utils/bracket.js';
import { randomSeed } from '../utils/rng.js';
import { uuid } from '../utils/uuid.js';
import { generateInviteCode } from '../utils/inviteCode.js';
import {
  readLegacyState,
  hasImportableData,
  convertLegacyState,
  IMPORT_FLAG,
} from '../utils/legacyImport.js';

// Single-device backend: everything lives in the local Dexie mirror.
//
// This is what Sprint 1 ships, and it stays useful afterwards — it is the
// fallback when no Supabase project is configured, and it is what the app falls
// back to if someone wants to run a session entirely offline. Because it
// implements the same interface as the eventual supabaseBackend, no page needs
// to change when the server arrives.

const newId = () => uuid();
const now = () => Date.now();

// In-process change notification. The Supabase backend will fan out realtime
// events through the same callback list.
const listeners = new Set();
function emit(change = {}) {
  for (const fn of listeners) fn(change);
}

async function deviceId() {
  let id = await getMeta('deviceId');
  if (!id) {
    id = newId();
    await setMeta('deviceId', id);
  }
  return id;
}

export function createLocalBackend() {
  return {
    kind: 'local',

    /* ---------- identity ---------- */

    async getIdentity() {
      const club = await db.clubs.toCollection().first();
      if (!club) return { deviceId: await deviceId(), memberId: null, clubId: null, role: null };
      const memberId = await getMeta('memberId');
      const member = memberId ? await db.members.get(memberId) : null;
      return {
        deviceId: await deviceId(),
        memberId: member?.id ?? null,
        clubId: club.id,
        role: member?.role ?? ROLES.ADMIN,
      };
    },

    // There is no server to validate against in local mode. Rather than pretend,
    // this reports plainly that joining needs a configured backend.
    async claimInvite() {
      throw new Error('Joining a club needs a server. This device is in single-device mode.');
    },

    async signOut() {
      await clearLocalData();
      emit({ type: 'reset' });
    },

    /* ---------- reads ---------- */

    async getClub() {
      return (await db.clubs.toCollection().first()) ?? null;
    },

    async listMembers() {
      const club = await this.getClub();
      if (!club) return [];
      return db.members.where('clubId').equals(club.id).sortBy('createdAt');
    },

    async listSessions() {
      const club = await this.getClub();
      if (!club) return [];
      const sessions = await db.sessions.where('clubId').equals(club.id).toArray();
      return sessions.sort((a, b) => b.createdAt - a.createdAt);
    },

    async getSession(sessionId) {
      const session = await db.sessions.get(sessionId);
      if (!session) return null;
      const games = await db.games.where('sessionId').equals(sessionId).sortBy('ordinal');
      return { session, games };
    },

    async getActiveSession() {
      const sessions = await this.listSessions();
      // The newest session that hasn't been finalised, else the newest overall.
      const live = sessions.find((s) => s.status !== SESSION_STATUS.FINAL);
      const target = live ?? sessions[0];
      return target ? this.getSession(target.id) : null;
    },

    async listScoreEvents(gameId) {
      const events = await db.scoreEvents.where('gameId').equals(gameId).toArray();
      return events.sort((a, b) => b.createdAt - a.createdAt);
    },

    /* ---------- club & roster ---------- */

    async createClub({ name, adminName }) {
      const club = { id: newId(), name: name?.trim() || 'My club', createdAt: now() };
      const admin = {
        id: newId(),
        clubId: club.id,
        name: adminName?.trim() || 'Me',
        role: ROLES.ADMIN,
        userId: null,
        colorIndex: 0,
        createdAt: now(),
      };
      await db.transaction('rw', db.clubs, db.members, db.meta, async () => {
        await db.clubs.put(club);
        await db.members.put(admin);
        await setMeta('memberId', admin.id);
      });
      emit({ type: 'club' });
      return { club, member: admin };
    },

    /**
     * Delete the whole club. In single-device mode that is the same thing as
     * wiping local storage, since there is nowhere else the data exists.
     */
    async deleteClub() {
      const club = await this.getClub();
      if (!club) throw new Error('There is no club to delete.');
      await clearLocalData();
      emit({ type: 'reset' });
    },

    async addMember({ name }) {
      const club = await this.getClub();
      if (!club) throw new Error('Create a club first.');
      const count = await db.members.where('clubId').equals(club.id).count();
      const member = {
        id: newId(),
        clubId: club.id,
        name: name?.trim() || `Player ${count + 1}`,
        role: ROLES.PLAYER,
        userId: null,
        colorIndex: count % 8,
        createdAt: now(),
      };
      await db.members.put(member);
      emit({ type: 'members' });
      return member;
    },

    async renameMember(memberId, name) {
      await db.members.update(memberId, { name: name.trim() });
      emit({ type: 'members' });
      return db.members.get(memberId);
    },

    /**
     * Removing someone takes their fixtures with them. A game they were part of
     * can't be scored or ranked coherently once a side is missing, so it is
     * removed along with its score events — derived data never outlives its
     * source. Sessions are renumbered so the match list stays contiguous.
     */
    async removeMember(memberId) {
      await db.transaction('rw', db.members, db.games, db.scoreEvents, async () => {
        await db.members.delete(memberId);

        const affected = await db.games
          .filter((g) => g.teamA.includes(memberId) || g.teamB.includes(memberId))
          .toArray();

        for (const g of affected) {
          await db.scoreEvents.where('gameId').equals(g.id).delete();
          await db.games.delete(g.id);
        }

        // Drop them from any remaining sit-out lists, and renumber each session.
        const touchedSessions = new Set(affected.map((g) => g.sessionId));
        const remaining = await db.games.toArray();
        for (const g of remaining) {
          if (g.byes?.includes(memberId)) {
            await db.games.update(g.id, { byes: g.byes.filter((id) => id !== memberId) });
          }
        }
        for (const sessionId of touchedSessions) {
          const games = await db.games.where('sessionId').equals(sessionId).sortBy('ordinal');
          await Promise.all(games.map((g, i) => db.games.update(g.id, { ordinal: i + 1 })));
          await db.sessions.update(sessionId, { numGames: games.length });
        }
      });
      emit({ type: 'members' });
      emit({ type: 'games' });
    },

    /* ---------- invites ---------- */

    // Local mode has no server to store hashes on, so a minted code is only a
    // placeholder the admin can write down ahead of connecting a backend.
    async mintInvite(memberId) {
      const code = generateInviteCode();
      await db.members.update(memberId, { inviteMintedAt: now() });
      emit({ type: 'members' });
      return { code, invite: { memberId, mintedAt: now(), local: true } };
    },

    async revokeInvite(memberId) {
      await db.members.update(memberId, { inviteMintedAt: null, userId: null });
      emit({ type: 'members' });
    },

    /* ---------- sessions ---------- */

    async createSession({
      name, date, startTime, format, playerIds, numGames, courts, pointsTo, seed, playoffs, teams,
    }) {
      const club = await this.getClub();
      if (!club) throw new Error('Create a club first.');

      const usedSeed = seed ?? randomSeed();
      const sessionId = newId();
      const generated = generateSchedule({
        format,
        playerIds,
        numGames,
        courts,
        seed: usedSeed,
        playoffs,
        teams,
      });

      const session = {
        id: sessionId,
        clubId: club.id,
        name: name?.trim() || 'Session',
        date: date ?? new Date().toISOString().slice(0, 10),
        startTime: startTime || null,
        format,
        playerIds,
        numGames: generated.length,
        courts,
        pointsTo,
        rngSeed: usedSeed,
        // What was generated, not what was asked for — a field too small for a
        // bracket gets none, and the session should say so.
        playoffs: generated.some((g) => g.stage !== 'rr'),
        status: SESSION_STATUS.LIVE,
        createdAt: now(),
      };

      const games = generated.map((g) => ({
        ...g,
        id: newId(),
        sessionId,
        scoredBy: null,
        updatedAt: now(),
      }));

      await db.transaction('rw', db.sessions, db.games, async () => {
        await db.sessions.put(session);
        await db.games.bulkPut(games);
      });
      emit({ type: 'sessions' });
      return { session, games };
    },

    /**
     * Reshuffle: a new seed produces a different schedule from the same players.
     * Refuses once anything has been scored — silently discarding results would
     * be worse than making the admin clear them deliberately.
     */
    async regenerateSchedule(sessionId, { seed, teams } = {}) {
      const existing = await this.getSession(sessionId);
      if (!existing) throw new Error('Session not found.');
      if (existing.games.some((g) => g.played)) {
        throw new Error('Some games already have scores. Clear them before reshuffling.');
      }

      const { session } = existing;
      const usedSeed = seed ?? randomSeed();
      const generated = generateSchedule({
        format: session.format,
        playerIds: session.playerIds,
        // The round-robin count, not the total — the generator appends the four
        // knockout fixtures itself, so passing the total back in would grow the
        // round robin by four games on every reshuffle.
        numGames: roundRobinGames(existing.games).length,
        courts: session.courts,
        seed: usedSeed,
        playoffs: session.playoffs,
        teams,
      });

      const games = generated.map((g) => ({
        ...g,
        id: newId(),
        sessionId,
        scoredBy: null,
        updatedAt: now(),
      }));

      await db.transaction('rw', db.sessions, db.games, db.scoreEvents, async () => {
        const old = await db.games.where('sessionId').equals(sessionId).toArray();
        for (const g of old) await db.scoreEvents.where('gameId').equals(g.id).delete();
        await db.games.where('sessionId').equals(sessionId).delete();
        await db.games.bulkPut(games);
        await db.sessions.update(sessionId, { rngSeed: usedSeed, numGames: games.length });
      });
      emit({ type: 'games' });
      return { session: await db.sessions.get(sessionId), games };
    },

    async setSessionStatus(sessionId, status) {
      await db.sessions.update(sessionId, { status });
      emit({ type: 'sessions' });
      return db.sessions.get(sessionId);
    },

    /** Deleting a session takes its games and their audit trail with it. */
    async deleteSession(sessionId) {
      await db.transaction('rw', db.sessions, db.games, db.scoreEvents, async () => {
        const games = await db.games.where('sessionId').equals(sessionId).toArray();
        for (const g of games) await db.scoreEvents.where('gameId').equals(g.id).delete();
        await db.games.where('sessionId').equals(sessionId).delete();
        await db.sessions.delete(sessionId);
      });
      emit({ type: 'sessions' });
    },

    /* ---------- scores ---------- */

    /**
     * The single write path for a score — mirroring the server, where a
     * `submit_score` RPC is the only way to touch a game, so the audit log can
     * never be bypassed. Passing null for both clears the score.
     *
     * `teams` names who played a knockout fixture. Those rows are created empty
     * — the semifinalists aren't known until the round robin ends — so entering
     * the score is also the act that records the line-up. Mirrors the server's
     * submit_score(); see supabase/functions.sql for why.
     */
    async submitScore(gameId, scoreA, scoreB, teams = null) {
      const game = await db.games.get(gameId);
      if (!game) throw new Error('Game not found.');

      const identity = await this.getIdentity();
      const played = scoreA != null && scoreB != null;
      const stamp = now();

      // Round-robin line-ups come from the generated schedule and are never
      // rewritten by a score. Clearing a knockout score un-decides the slot, so
      // it goes back to being derived from the standings.
      let { teamA, teamB } = game;
      if (isKnockout(game)) {
        if (!played) {
          teamA = [];
          teamB = [];
        } else if (teams?.teamA?.length && teams?.teamB?.length) {
          teamA = teams.teamA;
          teamB = teams.teamB;
        }
      }

      const event = {
        id: newId(),
        gameId,
        memberId: identity.memberId,
        scoreA,
        scoreB,
        prevA: game.scoreA,
        prevB: game.scoreB,
        teamA,
        teamB,
        createdAt: stamp,
      };

      await db.transaction('rw', db.games, db.scoreEvents, async () => {
        await db.scoreEvents.put(event);
        await db.games.update(gameId, {
          scoreA,
          scoreB,
          teamA,
          teamB,
          played,
          scoredBy: identity.memberId,
          updatedAt: stamp,
        });
      });

      emit({ type: 'games', gameId });
      return db.games.get(gameId);
    },

    /* ---------- legacy import ---------- */

    /**
     * Import the original app's localStorage state, once. Returns null when
     * there is nothing to import or it has already run.
     */
    async importLegacyIfPresent(storage = globalThis.localStorage) {
      if (await getMeta(IMPORT_FLAG)) return null;

      const state = readLegacyState(storage);
      if (!hasImportableData(state)) {
        await setMeta(IMPORT_FLAG, true);
        return null;
      }

      const club = { id: newId(), name: 'My club', createdAt: now() };
      const converted = convertLegacyState(state, { clubId: club.id, newId, now: now() });
      if (!converted) {
        await setMeta(IMPORT_FLAG, true);
        return null;
      }

      const { members, session, games } = converted;
      session.playerIds = members.map((m) => m.id);

      await db.transaction('rw', db.clubs, db.members, db.sessions, db.games, db.meta, async () => {
        await db.clubs.put(club);
        await db.members.bulkPut(members);
        await db.sessions.put(session);
        await db.games.bulkPut(games);
        if (members[0]) await setMeta('memberId', members[0].id);
        await setMeta(IMPORT_FLAG, true);
      });

      emit({ type: 'imported' });
      return { club, members, session, games };
    },

    /* ---------- realtime ---------- */

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    getConnection() {
      return CONNECTION.LOCAL;
    },

    // No queue in local mode — every write lands immediately.
    async pendingCount() {
      return 0;
    },
  };
}
