import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Trash2, Pencil, History, Play, UploadCloud, LogIn, Megaphone } from 'lucide-react';
import { buildSessionShare, formatSessionDate, formatSessionTime } from '../utils/sessionShare.js';
import TopBar, { Wordmark } from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import NewSessionModal from '../components/club/NewSessionModal.jsx';
import InviteRow from '../components/club/InviteRow.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { toast, confirmDialog, promptDialog } from '../store/uiStore.js';

export default function ClubPage() {
  const { club, members, sessions, session, games, identity, remote, canPublish } =
    useSessionStore();
  const refresh = useSessionStore((s) => s.refresh);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const inviteFor = useSessionStore((s) => s.inviteFor);
  const [sessionModal, setSessionModal] = useState(false);
  const [publishing, setPublishing] = useState(false);

  /* ---------- club setup (first run) ---------- */

  if (!club) {
    return (
      <>
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-8 text-center">
          <Wordmark />
          <p className="max-w-xs font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
            Create your club, add everyone who plays, then start a session.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={async () => {
              const name = await promptDialog({
                title: 'Name your club',
                placeholder: 'Sunday Picklers',
                confirmLabel: 'Create',
              });
              if (!name) return;
              const me = await promptDialog({
                title: "What's your name?",
                message: "You'll be the admin.",
                placeholder: 'Your name',
                confirmLabel: 'Done',
              });
              if (!me) return;
              await getBackend().createClub({ name, adminName: me });
              await refresh();
              toast('Club created.', { type: 'success' });
            }}
          >
            Create a club
          </Button>

          {remote && (
            <Link
              to="/join"
              className="flex items-center gap-1.5 font-sans text-sm"
              style={{ color: 'var(--text-lo)' }}
            >
              <LogIn size={15} /> I have an invite code
            </Link>
          )}
        </div>
      </>
    );
  }

  /* ---------- roster actions ---------- */

  const addPlayer = async () => {
    const name = await promptDialog({
      title: 'Add a player',
      placeholder: 'Name',
      confirmLabel: 'Add',
    });
    if (!name) return;
    await getBackend().addMember({ name });
    await refresh();
  };

  const renamePlayer = async (member) => {
    const name = await promptDialog({
      title: 'Rename player',
      defaultValue: member.name,
      confirmLabel: 'Save',
    });
    if (!name) return;
    await getBackend().renameMember(member.id, name);
    await refresh();
  };

  const removePlayer = async (member) => {
    const ok = await confirmDialog({
      title: `Remove ${member.name}?`,
      message:
        'Their fixtures are removed too, along with any scores on them — standings will be recalculated without them. This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await getBackend().removeMember(member.id);
    await refresh();
    toast(`${member.name} removed.`, { type: 'info' });
  };

  /**
   * Announce the session to the group chat.
   *
   * The app has no push notifications — a static site cannot send them — so
   * this is how people actually find out a session exists.
   */
  const announceSession = async () => {
    const text = buildSessionShare({
      session,
      games,
      members,
      url: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Details copied — paste them into your group chat.', { type: 'success' });
      }
    } catch {
      // Share sheet dismissed, or the clipboard was blocked. Neither is worth
      // interrupting the user over.
    }
  };

  const createSession = async (config) => {
    await getBackend().createSession(config);
    await refresh();
    toast('Schedule generated.', { type: 'success' });
  };

  const mintInvite = async (memberId) => {
    await getBackend().mintInvite(memberId);
    await refresh();
  };

  const revokeInvite = async (memberId) => {
    await getBackend().revokeInvite(memberId);
    await refresh();
  };

  const publish = async () => {
    const ok = await confirmDialog({
      title: 'Publish this club to the server?',
      message:
        'Your roster, sessions, games and scores upload, and you become the admin. ' +
        'Everyone else gets an invite code you can send them. This does not delete anything on this phone.',
      confirmLabel: 'Publish',
    });
    if (!ok) return;

    setPublishing(true);
    try {
      const plan = await getBackend().publishLocalClub();
      await refresh();
      const dropped = plan.skipped.length
        ? ` ${plan.skipped.length} incomplete game${plan.skipped.length === 1 ? '' : 's'} skipped.`
        : '';
      toast(
        `Published ${plan.members.length + 1} players and ${plan.games.length} games.${dropped}`,
        { type: 'success', duration: 5000 }
      );
    } catch (err) {
      toast(err.message ?? 'Could not publish.', { type: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const deleteSession = async (s) => {
    const ok = await confirmDialog({
      title: `Delete "${s.name}"?`,
      message: 'The schedule, every score, and the change history for this session are removed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await getBackend().deleteSession(s.id);
    await refresh();
  };

  return (
    <>
      <TopBar
        title="Club"
        subtitle={club.name}
        action={
          <Link
            to="/settings"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
          >
            <Settings size={17} />
          </Link>
        }
      />

      <div className="flex flex-col gap-6 px-4">
        {/* This device has a club from before the server was connected. */}
        {canPublish && (
          <section
            className="flex flex-col gap-2"
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--optic)',
            }}
          >
            <h2 className="font-display text-base font-bold" style={{ color: 'var(--text-hi)' }}>
              Share this club with your friends
            </h2>
            <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
              This club only exists on this phone. Publishing it uploads your roster,
              sessions and scores so everyone can see the same standings.
            </p>
            <Button variant="primary" full disabled={publishing} onClick={publish}>
              <UploadCloud size={16} />
              {publishing ? 'Publishing…' : 'Publish to the server'}
            </Button>
          </section>
        )}

        {/* Session control */}
        <section className="flex flex-col gap-2">
          <h2
            className="font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Session
          </h2>
          {session ? (
            <div
              className="flex items-center gap-3"
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--line)',
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-bold" style={{ color: 'var(--text-hi)' }}>
                  {session.name}
                </p>
                <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                  {[formatSessionDate(session.date), formatSessionTime(session.startTime)]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                  {session.format === 'singles' ? 'Singles round robin' : 'Doubles · Americano'} ·{' '}
                  {session.numGames} games · to {session.pointsTo}
                </p>
              </div>
              <Chip tone={session.status === 'final' ? 'neutral' : 'optic'}>{session.status}</Chip>
            </div>
          ) : (
            <p className="font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
              No session running.
            </p>
          )}

          {session && (
            <Button variant="secondary" full onClick={announceSession}>
              <Megaphone size={16} />
              Tell everyone
            </Button>
          )}

          {isAdmin && (
            <Button variant="primary" full onClick={() => setSessionModal(true)} disabled={members.length < 2}>
              <Play size={16} />
              {session ? 'Start another session' : 'Start a session'}
            </Button>
          )}
          {members.length < 2 && (
            <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
              Add at least two players first.
            </p>
          )}
        </section>

        {/* Roster */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2
              className="font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Roster ({members.length})
            </h2>
            {isAdmin && (
              <button
                onClick={addPlayer}
                className="flex items-center gap-1 font-sans text-[13px] font-semibold"
                style={{ color: 'var(--optic-ink)' }}
              >
                <Plus size={15} /> Add
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar member={m} size={30} />
                  <Link to={`/players/${m.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                      {m.name}
                    </span>
                    <span className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                      {m.role === 'admin' ? 'Admin' : 'Player'}
                      {m.id === identity?.memberId ? ' · you' : ''}
                    </span>
                  </Link>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => renamePlayer(m)}
                        aria-label={`Rename ${m.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                      >
                        <Pencil size={14} />
                      </button>
                      {m.role !== 'admin' && (
                        <button
                          onClick={() => removePlayer(m)}
                          aria-label={`Remove ${m.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                          style={{ background: 'var(--bg-raised)', color: 'var(--clay)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Invites only exist when there's a server to join. */}
                {remote && isAdmin && m.role !== 'admin' && (
                  <div className="pl-[42px]">
                    <InviteRow
                      member={m}
                      invite={inviteFor(m.id)}
                      clubName={club.name}
                      onMint={mintInvite}
                      onRevoke={revokeInvite}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* History */}
        {sessions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2
              className="flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              <History size={13} /> Sessions
            </h2>
            <div className="flex flex-col gap-1.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: `1px solid ${s.id === session?.id ? 'var(--optic)' : 'var(--line)'}`,
                  }}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => useSessionStore.getState().openSession(s.id)}
                  >
                    <span className="block truncate font-sans text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                      {s.name}
                    </span>
                    <span className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                      {s.date} · {s.numGames} games
                    </span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => deleteSession(s)}
                      aria-label={`Delete ${s.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'var(--bg-raised)', color: 'var(--clay)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <NewSessionModal
        open={sessionModal}
        onClose={() => setSessionModal(false)}
        members={members}
        onCreate={createSession}
      />
    </>
  );
}
