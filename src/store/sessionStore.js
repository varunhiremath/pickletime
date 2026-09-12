import { create } from 'zustand';
import { sessionEntrants } from '../utils/entrants.js';
import { getBackend, CONNECTION } from '../sync/backend.js';

// The app's live view of the shared data.
//
// One store rather than a hook per table: every screen needs some overlapping
// slice of {club, members, session, games}, and a single refresh keeps them
// consistent with each other. The backend pushes change events (locally today,
// via Supabase realtime from Sprint 2) and this reloads in response.

const useSessionStore = create((set, get) => ({
  loaded: false,
  club: null,
  members: [],
  sessions: [],
  session: null,
  games: [],
  // Set only when the user deliberately opened a past session from History.
  // Distinguishing that from "this happened to be loaded" is what stops a newly
  // created session being ignored — see refresh().
  openedSessionId: null,
  identity: null,
  invites: [],
  remote: false,
  canPublish: false,
  connection: CONNECTION.LOCAL,
  pending: 0,
  // Set when the first load failed outright (unreachable or misconfigured
  // server). The UI says so plainly rather than showing an empty club.
  bootError: null,
  // Games whose score changed since the last render, so Standings can flash the
  // rows that just moved.
  recentlyChanged: [],

  /** Full reload from the backend. */
  async refresh() {
    const backend = getBackend();
    const [identity, club, members, sessions, active, pending] = await Promise.all([
      backend.getIdentity(),
      backend.getClub(),
      backend.listMembers(),
      backend.listSessions(),
      backend.getActiveSession(),
      backend.pendingCount?.() ?? 0,
    ]);

    // Admin-only extras. RLS returns nothing for a player, so a failure here
    // must not take the whole refresh down with it.
    const [invites, canPublish] = await Promise.all([
      backend.listInvites?.().catch(() => []) ?? [],
      backend.hasLocalClubToPublish?.().catch(() => false) ?? false,
    ]);

    // Keep whichever session the user has explicitly opened from History,
    // instead of yanking them back to the live one on every change event.
    //
    // Keyed on openedSessionId, not on whatever is currently loaded. Using the
    // loaded session meant that creating a new one left the OLD schedule on
    // screen: the old session was still in the list, so it looked exactly like
    // a deliberate choice to view it.
    const openedId = get().openedSessionId;
    const keepOpened =
      openedId && openedId !== active?.session?.id && sessions.some((s) => s.id === openedId);
    const shown = keepOpened ? await backend.getSession(openedId) : active;

    set({
      loaded: true,
      identity,
      club,
      members,
      sessions,
      invites,
      canPublish,
      remote: backend.kind === 'supabase',
      session: shown?.session ?? null,
      games: shown?.games ?? [],
      // A session that has been deleted, or has become the active one, stops
      // being a deliberate choice.
      openedSessionId: keepOpened ? openedId : null,
      connection: backend.getConnection(),
      pending,
    });
  },

  /** Switch which session the app is showing (History → open a past session). */
  async openSession(sessionId) {
    const result = await getBackend().getSession(sessionId);
    if (result) {
      set({ session: result.session, games: result.games, openedSessionId: sessionId });
    }
  },

  /**
   * Stop pinning a past session and follow whichever one is live.
   *
   * Called after creating a session, so the app lands on the games you just
   * made rather than leaving yesterday's schedule up.
   */
  async followActive() {
    set({ openedSessionId: null });
    await get().refresh();
  },

  /** Subscribe to backend changes. Returns an unsubscribe function. */
  listen() {
    const backend = getBackend();
    return backend.subscribe((change) => {
      if (change?.gameId) {
        set({ recentlyChanged: [change.gameId] });
        setTimeout(() => {
          const current = get().recentlyChanged;
          if (current.includes(change.gameId)) set({ recentlyChanged: [] });
        }, 1400);
      }
      get().refresh();
    });
  },

  /* ---------- derived lookups ---------- */

  memberById(id) {
    return get().members.find((m) => m.id === id) ?? null;
  },

  nameOf(id) {
    return get().memberById(id)?.name ?? '—';
  },

  namesOf(ids = []) {
    return ids.map((id) => get().nameOf(id)).join(' & ');
  },

  isAdmin() {
    // In single-device mode there is nobody to be an admin relative to, so the
    // one person using the app gets full control.
    if (!get().remote) return true;
    return get().identity?.role === 'admin';
  },

  /** The live invite for a member, if the admin has minted one. */
  inviteFor(memberId) {
    return get().invites.find((i) => i.memberId === memberId) ?? null;
  },

  /** The players in the current session, in roster order. */
  sessionPlayers() {
    const { session, members } = get();
    if (!session?.playerIds) return members;
    return session.playerIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  },

  /**
   * Whoever is being ranked in the current session: players in singles and
   * americano, fixed pairs in a doubles-pairs session. Standings and the
   * playoff bracket both work on these rather than on players, so a screen
   * asking for entrants needs no idea which format is in play.
   * See utils/entrants.js.
   */
  sessionEntrants() {
    const { session, games, members } = get();
    return sessionEntrants({ session, games, members });
  },
}));

export default useSessionStore;
