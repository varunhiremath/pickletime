import { supabase, ensureSignedIn, currentUserId } from './supabaseClient.js';
import { db, getMeta, setMeta, clearLocalData } from '../db/db.js';
import { CONNECTION, ROLES, SESSION_STATUS } from './backend.js';
import { generateSchedule } from '../utils/schedule.js';
import { randomSeed } from '../utils/rng.js';
import { generateInviteCode, normalizeInviteCode } from '../utils/inviteCode.js';
import { buildPublishPlan } from '../utils/publishPlan.js';
import {
  clubFromRow, memberFromRow, sessionFromRow, sessionToRow,
  gameFromRow, gameToRow, inviteFromRow, scoreEventFromRow,
} from './rowMap.js';

// The shared backend. Same interface as localBackend (documented at the top of
// backend.js), so no page or store changes when this one is in use.
//
// Two things beyond plain CRUD:
//
//   * Reads are write-through cached into the Dexie mirror, and fall back to it
//     when the network fails. Courts have bad signal; without this, connecting a
//     server would make the app *worse* offline than the single-device version.
//   * subscribe() opens a realtime channel so every phone reorders its standings
//     the moment anybody scores.
//
// Score writes go through the submit_score RPC — `games` has no UPDATE policy at
// all (supabase/policies.sql), so this is not a convention, it is the only path
// the database permits.

const listeners = new Set();
let connection = CONNECTION.CONNECTING;
let channel = null;

function emit(change = {}) {
  for (const fn of listeners) fn(change);
}

function setConnection(next) {
  if (connection === next) return;
  connection = next;
  emit({ type: 'connection', connection: next });
}

/** Unwrap a PostgREST response, marking the connection state as a side effect. */
function unwrap({ data, error }) {
  if (error) {
    // A transport failure means we're offline; a policy rejection means we're
    // online and were told no. Conflating them would show "Offline" for a
    // permission error, which sends the user chasing the wrong problem.
    if (isNetworkError(error)) setConnection(CONNECTION.OFFLINE);
    throw toFriendlyError(error);
  }
  if (connection === CONNECTION.OFFLINE) setConnection(CONNECTION.LIVE);
  return data;
}

function isNetworkError(error) {
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    error?.name === 'TypeError' ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to load')
  );
}

function toFriendlyError(error) {
  const msg = error?.message ?? 'Something went wrong.';
  if (isNetworkError(error)) {
    return new Error("Can't reach the server. Your change will be saved when you're back online.");
  }
  // Postgres raises 42501 for our explicit membership checks and for a policy
  // that denied the write.
  if (error?.code === '42501' || msg.includes('row-level security')) {
    return new Error("You don't have permission to do that.");
  }
  return new Error(msg);
}

/** Run a read, falling back to the local mirror when the network is down. */
async function withMirror(remote, fallback) {
  try {
    return await remote();
  } catch (err) {
    setConnection(CONNECTION.OFFLINE);
    try {
      return await fallback();
    } catch {
      throw err;
    }
  }
}

const newId = () => crypto.randomUUID();

async function deviceId() {
  let id = await getMeta('deviceId');
  if (!id) {
    id = newId();
    await setMeta('deviceId', id);
  }
  return id;
}

export function createSupabaseBackend() {
  // Cached so every call doesn't re-query the roster to find out who we are.
  let identityCache = null;

  async function loadIdentity({ force = false } = {}) {
    if (identityCache && !force) return identityCache;

    const device = await deviceId();

    // Signing in needs the network. When it fails — no signal, or a paused free
    // project — fall back to whoever this device was last known to be, so the
    // app opens on cached data.
    //
    // This must never throw. A boot that rejects here leaves the user staring at
    // the splash screen forever, which is precisely what a paused project on a
    // Saturday morning would look like.
    let user = null;
    try {
      user = await ensureSignedIn();
    } catch (err) {
      setConnection(CONNECTION.OFFLINE);
      return cachedIdentity(device, err);
    }

    if (!user) return cachedIdentity(device);

    const rows = await withMirror(
      async () =>
        unwrap(await supabase.from('members').select('*').eq('user_id', user.id).limit(1)),
      async () => {
        const cached = await getMeta('memberId');
        return cached ? [await db.members.get(cached)].filter(Boolean).map(toRowish) : [];
      }
    );

    const member = rows?.[0] ? (rows[0].club_id ? memberFromRow(rows[0]) : rows[0]) : null;

    identityCache = {
      deviceId: device,
      userId: user.id,
      memberId: member?.id ?? null,
      clubId: member?.clubId ?? null,
      role: member?.role ?? null,
    };
    if (member?.id) await setMeta('memberId', member.id);
    return identityCache;
  }

  // The mirror stores camelCase; the fallback path above expects row shape.
  function toRowish(m) {
    return { ...m, club_id: m.clubId, user_id: m.userId, color_index: m.colorIndex };
  }

  /** Identity reconstructed from the local mirror when the server is unreachable. */
  async function cachedIdentity(device, error = null) {
    const memberId = await getMeta('memberId');
    const member = memberId ? await db.members.get(memberId) : null;
    identityCache = {
      deviceId: device,
      userId: null,
      memberId: member?.id ?? null,
      clubId: member?.clubId ?? null,
      role: member?.role ?? null,
      // Surfaced by the UI so a misconfigured project says so rather than
      // looking like an empty club.
      authError: error?.message ?? null,
    };
    return identityCache;
  }

  async function requireClubId() {
    const { clubId } = await loadIdentity();
    if (!clubId) throw new Error('You are not in a club yet.');
    return clubId;
  }

  return {
    kind: 'supabase',

    /* ---------------------------------------------------------- identity */

    async getIdentity() {
      return loadIdentity();
    },

    async claimInvite(rawCode) {
      const code = normalizeInviteCode(rawCode);
      if (!code) throw new Error("That doesn't look like a code. They look like PT-7Q2K-9XR4.");

      await ensureSignedIn();
      // The server compares the code — the client only tidies the typing. A
      // client that decided validity itself would be trivially bypassed.
      //
      // Rejections come back as {ok:false, error} rather than as a thrown
      // Postgres error, because raising would roll back the attempt counter and
      // silently disable the brute-force throttle. See supabase/functions.sql.
      const data = unwrap(await supabase.rpc('claim_invite', { p_code: code }));
      if (!data?.ok) throw new Error(data?.error ?? 'That code did not work.');

      identityCache = null;
      const result = { club: clubFromRow(data.club), member: memberFromRow(data.member) };
      await setMeta('memberId', result.member.id);
      await loadIdentity({ force: true });
      emit({ type: 'joined' });
      return result;
    },

    async signOut() {
      await supabase.auth.signOut();
      await clearLocalData();
      identityCache = null;
      emit({ type: 'reset' });
    },

    /* ------------------------------------------------------------- reads */

    async getClub() {
      const { clubId } = await loadIdentity();
      if (!clubId) return null;
      return withMirror(
        async () => {
          const row = unwrap(
            await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle()
          );
          const club = clubFromRow(row);
          if (club) await db.clubs.put(club);
          return club;
        },
        () => db.clubs.get(clubId).then((c) => c ?? null)
      );
    },

    async listMembers() {
      const { clubId } = await loadIdentity();
      if (!clubId) return [];
      return withMirror(
        async () => {
          const rows = unwrap(
            await supabase.from('members').select('*').eq('club_id', clubId).order('created_at')
          );
          const members = rows.map(memberFromRow);
          await db.members.bulkPut(members);
          return members;
        },
        () => db.members.where('clubId').equals(clubId).sortBy('createdAt')
      );
    },

    async listSessions() {
      const { clubId } = await loadIdentity();
      if (!clubId) return [];
      return withMirror(
        async () => {
          const rows = unwrap(
            await supabase
              .from('sessions')
              .select('*')
              .eq('club_id', clubId)
              .order('created_at', { ascending: false })
          );
          const sessions = rows.map(sessionFromRow);
          await db.sessions.bulkPut(sessions);
          return sessions;
        },
        async () => {
          const cached = await db.sessions.where('clubId').equals(clubId).toArray();
          return cached.sort((a, b) => b.createdAt - a.createdAt);
        }
      );
    },

    async getSession(sessionId) {
      return withMirror(
        async () => {
          const [sRow, gRows] = await Promise.all([
            supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle().then(unwrap),
            supabase.from('games').select('*').eq('session_id', sessionId).order('ordinal').then(unwrap),
          ]);
          if (!sRow) return null;
          const session = sessionFromRow(sRow);
          const games = gRows.map(gameFromRow);
          await db.sessions.put(session);
          await db.games.bulkPut(games);
          return { session, games };
        },
        async () => {
          const session = await db.sessions.get(sessionId);
          if (!session) return null;
          const games = await db.games.where('sessionId').equals(sessionId).sortBy('ordinal');
          return { session, games };
        }
      );
    },

    async getActiveSession() {
      const sessions = await this.listSessions();
      const live = sessions.find((s) => s.status !== SESSION_STATUS.FINAL);
      const target = live ?? sessions[0];
      return target ? this.getSession(target.id) : null;
    },

    async listScoreEvents(gameId) {
      return withMirror(
        async () => {
          const rows = unwrap(
            await supabase
              .from('score_events')
              .select('*')
              .eq('game_id', gameId)
              .order('created_at', { ascending: false })
          );
          const events = rows.map(scoreEventFromRow);
          await db.scoreEvents.bulkPut(events);
          return events;
        },
        async () => {
          const cached = await db.scoreEvents.where('gameId').equals(gameId).toArray();
          return cached.sort((a, b) => b.createdAt - a.createdAt);
        }
      );
    },

    /** Admin-only: RLS returns nothing for anyone else. */
    async listInvites() {
      const { clubId, role } = await loadIdentity();
      if (!clubId || role !== ROLES.ADMIN) return [];
      const rows = unwrap(await supabase.from('invites').select('*').eq('club_id', clubId));
      return rows.map(inviteFromRow);
    },

    /* ------------------------------------------------------ club & roster */

    async createClub({ name, adminName }) {
      await ensureSignedIn();
      const data = unwrap(
        await supabase.rpc('create_club', { p_name: name, p_admin_name: adminName })
      );
      const club = clubFromRow(data.club);
      const member = memberFromRow(data.member);

      await db.clubs.put(club);
      await db.members.put(member);
      await setMeta('memberId', member.id);
      identityCache = null;
      await loadIdentity({ force: true });
      emit({ type: 'club' });
      return { club, member };
    },

    async addMember({ name }) {
      const clubId = await requireClubId();
      const count = await db.members.where('clubId').equals(clubId).count();
      const row = unwrap(
        await supabase
          .from('members')
          .insert({
            club_id: clubId,
            name: name?.trim() || `Player ${count + 1}`,
            role: ROLES.PLAYER,
            color_index: count % 8,
          })
          .select()
          .single()
      );
      const member = memberFromRow(row);
      await db.members.put(member);
      emit({ type: 'members' });
      return member;
    },

    async renameMember(memberId, name) {
      const row = unwrap(
        await supabase.from('members').update({ name: name.trim() }).eq('id', memberId).select().single()
      );
      const member = memberFromRow(row);
      await db.members.put(member);
      emit({ type: 'members' });
      return member;
    },

    /**
     * Removing someone takes their fixtures with them — a game with a missing
     * side can't be scored or ranked coherently. The database cascades
     * score_events; the games themselves are deleted here, then the affected
     * sessions are renumbered so the match list stays contiguous.
     */
    async removeMember(memberId) {
      const clubId = await requireClubId();

      const sessionRows = unwrap(
        await supabase.from('sessions').select('id').eq('club_id', clubId)
      );
      const sessionIds = sessionRows.map((s) => s.id);

      if (sessionIds.length > 0) {
        const gameRows = unwrap(
          await supabase.from('games').select('*').in('session_id', sessionIds)
        );
        const games = gameRows.map(gameFromRow);
        const doomed = games.filter(
          (g) => g.teamA.includes(memberId) || g.teamB.includes(memberId)
        );

        if (doomed.length > 0) {
          unwrap(await supabase.from('games').delete().in('id', doomed.map((g) => g.id)));
        }

        // Drop them from any remaining sit-out lists.
        for (const g of games) {
          if (doomed.some((d) => d.id === g.id)) continue;
          if (!g.byes.includes(memberId)) continue;
          unwrap(
            await supabase
              .from('games')
              .update({ byes: g.byes.filter((id) => id !== memberId) })
              .eq('id', g.id)
          );
        }

        // Renumber every session that lost a game.
        for (const sessionId of new Set(doomed.map((g) => g.sessionId))) {
          const remaining = games
            .filter((g) => g.sessionId === sessionId && !doomed.some((d) => d.id === g.id))
            .sort((a, b) => a.ordinal - b.ordinal);
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].ordinal === i + 1) continue;
            unwrap(await supabase.from('games').update({ ordinal: i + 1 }).eq('id', remaining[i].id));
          }
          unwrap(
            await supabase.from('sessions').update({ num_games: remaining.length }).eq('id', sessionId)
          );
        }
      }

      unwrap(await supabase.from('members').delete().eq('id', memberId));
      await db.members.delete(memberId);
      emit({ type: 'members' });
      emit({ type: 'games' });
    },

    /* ----------------------------------------------------------- invites */

    async mintInvite(memberId) {
      const clubId = await requireClubId();
      const code = generateInviteCode();

      // One live invite per member, so re-minting replaces the old row.
      unwrap(await supabase.from('invites').delete().eq('member_id', memberId));
      const row = unwrap(
        await supabase
          .from('invites')
          .insert({ club_id: clubId, member_id: memberId, code })
          .select()
          .single()
      );
      emit({ type: 'members' });
      return { code, invite: inviteFromRow(row) };
    },

    /**
     * Revoking both flags the invite and unbinds the account, so the device
     * loses access on its very next request rather than at some later refresh.
     */
    async revokeInvite(memberId) {
      unwrap(await supabase.from('invites').update({ revoked: true }).eq('member_id', memberId));
      unwrap(await supabase.from('members').update({ user_id: null }).eq('id', memberId));
      emit({ type: 'members' });
    },

    /* ---------------------------------------------------------- sessions */

    async createSession({ name, date, format, playerIds, numGames, courts, pointsTo, seed }) {
      const clubId = await requireClubId();
      const { memberId } = await loadIdentity();

      const usedSeed = seed ?? randomSeed();
      const sessionId = newId();
      const generated = generateSchedule({ format, playerIds, numGames, courts, seed: usedSeed });

      const session = {
        id: sessionId,
        clubId,
        name: name?.trim() || 'Session',
        date: date ?? new Date().toISOString().slice(0, 10),
        format,
        playerIds,
        numGames: generated.length,
        courts,
        pointsTo,
        rngSeed: usedSeed,
        status: SESSION_STATUS.LIVE,
        createdBy: memberId,
        imported: false,
      };

      unwrap(await supabase.from('sessions').insert(sessionToRow(session)));

      const games = generated.map((g) => ({ ...g, id: newId(), sessionId, scoredBy: null }));
      unwrap(await supabase.from('games').insert(games.map(gameToRow)));

      emit({ type: 'sessions' });
      return this.getSession(sessionId);
    },

    async regenerateSchedule(sessionId, { seed } = {}) {
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
        numGames: session.numGames,
        courts: session.courts,
        seed: usedSeed,
      });

      unwrap(await supabase.from('games').delete().eq('session_id', sessionId));
      const games = generated.map((g) => ({ ...g, id: newId(), sessionId, scoredBy: null }));
      unwrap(await supabase.from('games').insert(games.map(gameToRow)));
      unwrap(
        await supabase
          .from('sessions')
          .update({ rng_seed: usedSeed, num_games: games.length })
          .eq('id', sessionId)
      );

      await db.games.where('sessionId').equals(sessionId).delete();
      emit({ type: 'games' });
      return this.getSession(sessionId);
    },

    async setSessionStatus(sessionId, status) {
      const row = unwrap(
        await supabase.from('sessions').update({ status }).eq('id', sessionId).select().single()
      );
      const session = sessionFromRow(row);
      await db.sessions.put(session);
      emit({ type: 'sessions' });
      return session;
    },

    async deleteSession(sessionId) {
      // games and score_events cascade in the database.
      unwrap(await supabase.from('sessions').delete().eq('id', sessionId));
      await db.games.where('sessionId').equals(sessionId).delete();
      await db.sessions.delete(sessionId);
      emit({ type: 'sessions' });
    },

    /* ------------------------------------------------------------ scores */

    async submitScore(gameId, scoreA, scoreB) {
      const row = unwrap(
        await supabase.rpc('submit_score', { p_game_id: gameId, p_a: scoreA, p_b: scoreB })
      );
      const game = gameFromRow(row);
      await db.games.put(game);
      emit({ type: 'games', gameId });
      return game;
    },

    /* ----------------------------------------------------------- publish */

    /**
     * Upload a club that was built on this device before the server existed.
     *
     * Games are inserted with their scores intact rather than replayed through
     * submit_score: a bulk import is not a score edit, and replaying would
     * fabricate audit entries for changes that never happened.
     */
    async publishLocalClub() {
      const local = await readLocalClub();
      if (!local) throw new Error('There is nothing on this device to publish.');

      const { club, member } = await this.createClub({
        name: local.club.name,
        adminName: local.adminName,
      });

      const plan = buildPublishPlan(local, { clubId: club.id, adminMemberId: member.id, newId });

      if (plan.members.length > 0) {
        unwrap(
          await supabase.from('members').insert(
            plan.members.map((m) => ({
              id: m.id,
              club_id: m.clubId,
              name: m.name,
              role: m.role,
              color_index: m.colorIndex,
            }))
          )
        );
      }
      if (plan.sessions.length > 0) {
        unwrap(await supabase.from('sessions').insert(plan.sessions.map(sessionToRow)));
      }
      if (plan.games.length > 0) {
        unwrap(await supabase.from('games').insert(plan.games.map(gameToRow)));
      }

      await setMeta('publishedAt', Date.now());
      emit({ type: 'club' });
      return plan;
    },

    /** Is there a local club worth offering to publish? */
    async hasLocalClubToPublish() {
      if (await getMeta('publishedAt')) return false;
      const { clubId } = await loadIdentity();
      if (clubId) return false; // already on a server club
      const local = await readLocalClub();
      return Boolean(local && local.members.length > 0);
    },

    /* ---------------------------------------------------------- realtime */

    subscribe(onChange) {
      listeners.add(onChange);

      if (!channel) {
        setConnection(CONNECTION.CONNECTING);
        channel = supabase
          .channel('pickletime')
          // No filter on session_id: the active session changes as the club
          // plays on, and re-subscribing on every switch drops events during
          // the gap. The payload is tiny either way.
          .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (payload) =>
            emit({ type: 'games', gameId: payload.new?.id ?? payload.old?.id })
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () =>
            emit({ type: 'sessions' })
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () =>
            emit({ type: 'members' })
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setConnection(CONNECTION.LIVE);
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setConnection(CONNECTION.OFFLINE);
            } else if (status === 'CLOSED') setConnection(CONNECTION.CONNECTING);
          });
      }

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
      };
    },

    getConnection() {
      return connection;
    },

    // The write outbox arrives in Sprint 3; until then writes go straight out.
    async pendingCount() {
      return 0;
    },
  };
}

/** Read whatever single-device club is sitting in the local mirror. */
async function readLocalClub() {
  const club = await db.clubs.toCollection().first();
  if (!club) return null;
  const members = await db.members.where('clubId').equals(club.id).sortBy('createdAt');
  const sessions = await db.sessions.where('clubId').equals(club.id).toArray();
  const games = sessions.length
    ? await db.games.where('sessionId').anyOf(sessions.map((s) => s.id)).toArray()
    : [];
  const adminId = await getMeta('memberId');
  const admin = members.find((m) => m.id === adminId) ?? members.find((m) => m.role === 'admin');
  return { club, members, sessions, games, adminId: admin?.id ?? null, adminName: admin?.name ?? 'Me' };
}
