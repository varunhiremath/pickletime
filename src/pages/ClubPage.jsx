import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Trash2, Pencil, History, Play, UploadCloud, LogIn, Megaphone, Shuffle, Users, ShieldPlus, ShieldMinus } from 'lucide-react';
import {
  buildSessionShare, formatSessionDate, formatSessionTime, formatLabel,
} from '../utils/sessionShare.js';
import { renderSessionPng } from '../utils/sessionImage.js';
import { shareText, shareFile } from '../utils/share.js';
import TopBar, { Wordmark } from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import NewSessionModal from '../components/club/NewSessionModal.jsx';
import EditTeamsModal from '../components/club/EditTeamsModal.jsx';
import InviteRow from '../components/club/InviteRow.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { isTeamFormat } from '../utils/schedule.js';
import { toast, confirmDialog, promptDialog } from '../store/uiStore.js';

/** "Sunday Doubles" → "sunday-doubles", for a filename people can find again. */
const slug = (name) =>
  (name ?? 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';

export default function ClubPage() {
  const { club, members, sessions, session, games, identity, remote, canPublish } =
    useSessionStore();
  const refresh = useSessionStore((s) => s.refresh);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const inviteFor = useSessionStore((s) => s.inviteFor);
  const [sessionModal, setSessionModal] = useState(false);
  const [teamsModal, setTeamsModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  // The last admin cannot hand the job back — there would be nobody left who
  // could start a session, and no way to appoint one.
  const adminCount = members.filter((m) => m.role === 'admin').length;

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

  /**
   * Hand out — or take back — the admin job.
   *
   * The point of this is scheduling: only an admin can start a session, and a
   * club with one admin cannot play at all if that person is away. The confirm
   * says what the promotion actually grants rather than the word "admin", which
   * on its own tells nobody anything.
   */
  const setRole = async (member, role) => {
    const promoting = role === 'admin';
    const ok = await confirmDialog({
      title: promoting ? `Make ${member.name} an admin?` : `Remove ${member.name}'s admin?`,
      message: promoting
        ? `${member.name} will be able to start sessions, edit the roster and invite people — the same as you.${
            member.userId ? '' : ' It takes effect when they join with their invite code.'
          }`
        : `${member.name} keeps their results and stays on the roster, but can no longer start a session.`,
      confirmLabel: promoting ? 'Make admin' : 'Remove admin',
      danger: !promoting,
    });
    if (!ok) return;
    try {
      await getBackend().setMemberRole(member.id, role);
      await refresh();
      toast(
        promoting ? `${member.name} is now an admin.` : `${member.name} is a player again.`,
        { type: 'success' }
      );
    } catch (err) {
      toast(err.message ?? 'Could not change that.', { type: 'error' });
    }
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
    const png = await renderSessionPng({
      session,
      games,
      members,
      clubName: club.name,
      url: appUrl,
    });

    // A browser that refuses toBlob still gets the message out.
    if (!png) {
      await announceSessionText();
      return;
    }

    const file = new File([png], `${slug(session.name)}.png`, { type: 'image/png' });
    const outcome = await shareFile(file, { title: session.name });
    if (outcome === 'downloaded') {
      toast('Session card saved to your downloads.', { type: 'success' });
    } else if (outcome === 'failed') {
      toast('Could not share the session.', { type: 'error' });
    }
  };

  /**
   * The same announcement as text.
   *
   * A picture has no tappable link, and iOS drops the text field when a share
   * carries a file — so the two are offered separately rather than together.
   */
  const announceSessionText = async () => {
    const outcome = await shareText(
      buildSessionShare({ session, games, members, url: appUrl })
    );
    if (outcome === 'copied') {
      toast('Details copied — paste them into your group chat.', { type: 'success' });
    } else if (outcome === 'failed') {
      toast('Could not share the session.', { type: 'error' });
    }
  };

  /**
   * Reshuffle a non-team schedule. Teams have their own editor — a blind
   * re-randomise is the wrong gesture once partnerships can be chosen.
   */
  const reshuffle = async () => {
    const ok = await confirmDialog({
      title: 'Reshuffle the schedule?',
      message: 'A new random schedule for the same players. Only possible before any score is entered.',
      confirmLabel: 'Reshuffle',
    });
    if (!ok) return;
    try {
      await getBackend().regenerateSchedule(session.id);
      await refresh();
      toast('Schedule reshuffled.', { type: 'success' });
    } catch (err) {
      toast(err.message ?? 'Could not reshuffle.', { type: 'error' });
    }
  };

  /** Apply hand-picked (or freshly drawn) teams to the live session. */
  const saveTeams = async (teams) => {
    try {
      await getBackend().regenerateSchedule(session.id, { teams });
      await refresh();
      toast('Teams updated.', { type: 'success' });
    } catch (err) {
      toast(err.message ?? 'Could not update the teams.', { type: 'error' });
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
                  {/* Was hardcoded to Americano for every non-singles session,
                      so a fixed-pairs morning was labelled as the wrong format
                      on the one screen that sets it up. */}
                  {formatLabel(session.format)} · {session.numGames} games · to {session.pointsTo}
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
            <div className="flex flex-col items-center gap-2">
              <Button variant="secondary" full onClick={announceSession}>
                <Megaphone size={16} />
                Tell everyone
              </Button>
              <button
                onClick={announceSessionText}
                className="font-sans text-[13px] font-semibold"
                style={{ color: 'var(--text-lo)' }}
              >
                Send as text instead
              </button>
            </div>
          )}

          {session && isAdmin && (
            <Button
              variant="secondary"
              full
              onClick={() => (isTeamFormat(session.format) ? setTeamsModal(true) : reshuffle())}
            >
              {isTeamFormat(session.format) ? <Users size={16} /> : <Shuffle size={16} />}
              {isTeamFormat(session.format) ? 'Edit teams' : 'Reshuffle schedule'}
            </Button>
          )}

          {isAdmin && (
            <Button variant="primary" full onClick={() => setSessionModal(true)} disabled={members.length < 2}>
              <Play size={16} />
              {session ? 'Start another session' : 'Start a session'}
            </Button>
          )}
          {isAdmin && members.length < 2 && (
            <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
              Add at least two players first.
            </p>
          )}
          {/* Without this the button is simply absent and nobody knows why. */}
          {!isAdmin && (
            <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
              Only an admin can start a session. Ask one of them to make you an admin and
              you can set the games up yourself.
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
                      {m.role === 'admin' ? (
                        <button
                          onClick={() => setRole(m, 'player')}
                          disabled={adminCount <= 1}
                          aria-label={`Remove ${m.name}'s admin`}
                          title={
                            adminCount <= 1
                              ? 'A club needs at least one admin.'
                              : `Remove ${m.name}'s admin`
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
                          style={{ background: 'var(--bg-raised)', color: 'var(--gold-ink)' }}
                        >
                          <ShieldMinus size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(m, 'admin')}
                          aria-label={`Make ${m.name} an admin`}
                          title={`Make ${m.name} an admin`}
                          className="flex h-8 w-8 items-center justify-center rounded-full"
                          style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                        >
                          <ShieldPlus size={14} />
                        </button>
                      )}
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

                {/* Invites only exist when there's a server to join, and you do
                    not invite yourself. Keyed off identity rather than role:
                    once admin can be shared, an admin who has not claimed a
                    device still needs a code. */}
                {remote && isAdmin && m.id !== identity?.memberId && (
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

      {session && (
        <EditTeamsModal
          open={teamsModal}
          onClose={() => setTeamsModal(false)}
          session={session}
          games={games}
          members={members}
          onSave={saveTeams}
        />
      )}
    </>
  );
}
