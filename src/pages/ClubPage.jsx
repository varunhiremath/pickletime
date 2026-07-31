import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Trash2, Pencil, History, Play } from 'lucide-react';
import TopBar, { Wordmark } from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import NewSessionModal from '../components/club/NewSessionModal.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { toast, confirmDialog, promptDialog } from '../store/uiStore.js';

export default function ClubPage() {
  const { club, members, sessions, session, identity } = useSessionStore();
  const refresh = useSessionStore((s) => s.refresh);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const [sessionModal, setSessionModal] = useState(false);

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

  const createSession = async (config) => {
    await getBackend().createSession(config);
    await refresh();
    toast('Schedule generated.', { type: 'success' });
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
                className="flex items-center gap-3"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--line)',
                }}
              >
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
