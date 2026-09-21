import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Trash2, Pencil, History, Play, UploadCloud, LogIn, Megaphone, Shuffle, Users, ShieldPlus, ShieldMinus, Trophy, Flag, RotateCcw, UserMinus, UserPlus } from 'lucide-react';
import {
  buildSessionShare, buildSessionCaption, sessionWhen, formatLabel,
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
import PlayoffModal from '../components/club/PlayoffModal.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { isTeamFormat, canRunPlayoffs, FORMATS } from '../utils/schedule.js';
import { isSessionOver, endedEarly, unplayedCount } from '../utils/sessionState.js';
import { splitRoster, activeMembers, deactivateBlockedReason } from '../utils/roster.js';
import { toast, confirmDialog, promptDialog } from '../store/uiStore.js';


/**
 * One roster row.
 *
 * Module level, not declared in the page body: a component defined inside a
 * render is a new type every render, so React remounts its subtree — and the
 * invite row inside this one holds a "copied" flash and a busy flag that a
 * remount would throw away.
 */
function RosterRow({
  member, isAdmin, isYou, adminCount, inactive, blockedReason,
  remote, clubName, appUrl, invite,
  onRole, onRename, onRemove, onActive, onMint, onRevoke,
}) {
  return (
    <div
      className="flex flex-col gap-2"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
        // Dimmed rather than hidden: they are still on the roster, and every
        // result they ever had still counts.
        opacity: inactive ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar member={member} size={30} />
        <Link to={`/players/${member.id}`} className="min-w-0 flex-1">
          <span
            className="block truncate font-sans text-sm font-semibold"
            style={{ color: 'var(--text-hi)' }}
          >
            {member.name}
          </span>
          <span className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            {member.role === 'admin' ? 'Admin' : 'Player'}
            {isYou ? ' · you' : ''}
            {inactive ? ' · not playing' : ''}
          </span>
        </Link>
        {isAdmin && (
          <div className="flex shrink-0 gap-1">
            {inactive ? (
              <button
                onClick={() => onActive(member, true)}
                aria-label={`Bring ${member.name} back`}
                title={`Bring ${member.name} back`}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: 'var(--bg-raised)', color: 'var(--optic-ink)' }}
              >
                <UserPlus size={14} />
              </button>
            ) : (
              <>
                {member.role === 'admin' ? (
                  <button
                    onClick={() => onRole(member, 'player')}
                    disabled={adminCount <= 1}
                    aria-label={`Remove ${member.name}'s admin`}
                    title={
                      adminCount <= 1
                        ? 'A club needs at least one admin.'
                        : `Remove ${member.name}'s admin`
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
                    style={{ background: 'var(--bg-raised)', color: 'var(--gold-ink)' }}
                  >
                    <ShieldMinus size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => onRole(member, 'admin')}
                    aria-label={`Make ${member.name} an admin`}
                    title={`Make ${member.name} an admin`}
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                  >
                    <ShieldPlus size={14} />
                  </button>
                )}
                <button
                  onClick={() => onRename(member)}
                  aria-label={`Rename ${member.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                >
                  <Pencil size={14} />
                </button>
                {/* Stepping back, not deleting. This is what somebody who moved
                    away needs, and unlike a delete it costs them nothing. */}
                <button
                  onClick={() => onActive(member, false)}
                  disabled={Boolean(blockedReason)}
                  aria-label={`${member.name} is not playing any more`}
                  title={blockedReason ?? `${member.name} is not playing any more`}
                  className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30"
                  style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
                >
                  <UserMinus size={14} />
                </button>
              </>
            )}
            {member.role !== 'admin' && (
              <button
                onClick={() => onRemove(member)}
                aria-label={`Delete ${member.name}`}
                title={`Delete ${member.name} and everything they played`}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: 'var(--bg-raised)', color: 'var(--clay)' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Invites only exist when there's a server to join, and you do not
          invite yourself. Keyed off identity rather than role: once admin can
          be shared, an admin who has not claimed a device still needs a code.
          Not offered to somebody who has stepped back — there is nothing for
          them to join right now. */}
      {remote && isAdmin && !isYou && !inactive && (
        <div className="pl-[42px]">
          <InviteRow
            member={member}
            invite={invite}
            clubName={clubName}
            appUrl={appUrl}
            onMint={onMint}
            onRevoke={onRevoke}
          />
        </div>
      )}
    </div>
  );
}

/** "Sunday Doubles" → "sunday-doubles", for a filename people can find again. */
const slug = (name) =>
  (name ?? 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';

export default function ClubPage() {
  const { club, members, sessions, session, games, identity, remote, canPublish } =
    useSessionStore();
  const refresh = useSessionStore((s) => s.refresh);
  const followActive = useSessionStore((s) => s.followActive);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const inviteFor = useSessionStore((s) => s.inviteFor);
  const [sessionModal, setSessionModal] = useState(false);
  const [teamsModal, setTeamsModal] = useState(false);
  const [playoffModal, setPlayoffModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  // The last admin cannot hand the job back — there would be nobody left who
  // could start a session, and no way to appoint one.
  const adminCount = members.filter((m) => m.role === 'admin').length;
  // Whether there is anything left to play. Derived from the games, so it is
  // the same answer on every phone the moment the last score lands — see
  // utils/sessionState.js.
  const over = isSessionOver({ session, games });
  const reopenable = endedEarly({ session, games });
  // Who is still playing, and who has stepped back. Inactive members keep
  // every game and result they ever had — see utils/roster.js.
  const { active, inactive } = splitRoster(members);

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

  /**
   * Step somebody back from the roster, or bring them back.
   *
   * What people actually want when somebody moves away. Deleting them takes
   * their fixtures and every score on them with it, which silently rewrites
   * the standings of sessions played months ago; this costs them nothing.
   */
  const setActive = async (member, next) => {
    if (!next) {
      const ok = await confirmDialog({
        title: `${member.name} is not playing any more?`,
        message:
          `They stay on the roster and keep every game and result they have ever had — ` +
          `old sessions and standings do not change at all. They just will not be ` +
          `picked for new sessions. You can bring them back whenever they turn up.`,
        confirmLabel: 'Not playing',
      });
      if (!ok) return;
    }
    try {
      await getBackend().setMemberActive(member.id, next);
      await refresh();
      toast(
        next ? `${member.name} is back on the list.` : `${member.name} stepped back.`,
        { type: next ? 'success' : 'info' }
      );
    } catch (err) {
      toast(err.message ?? 'Could not change that.', { type: 'error' });
    }
  };

  const removePlayer = async (member) => {
    const ok = await confirmDialog({
      title: `Delete ${member.name}?`,
      message:
        'Their fixtures go too, along with every score on them — the standings of sessions they played months ago will change. This cannot be undone. ' +
        'If they have just stopped playing, use "not playing" instead: they keep everything and are only left out of new sessions.',
      confirmLabel: 'Delete anyway',
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
    const outcome = await shareFile(file, {
      title: session.name,
      // The link the picture cannot carry. See utils/share.js.
      text: buildSessionCaption({ session, url: appUrl }),
    });
    if (outcome === 'downloaded') {
      toast('Image saved, link copied — paste them into your group chat.', { type: 'success' });
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
    const pooled = session.format === FORMATS.POOLS;
    const ok = await confirmDialog({
      title: pooled ? 'Redraw the pools?' : 'Reshuffle the schedule?',
      message: pooled
        ? 'The field is split into two pools again from scratch, so everybody may end up somewhere different. Only possible before any score is entered.'
        : 'A new random schedule for the same players. Only possible before any score is entered.',
      confirmLabel: pooled ? 'Redraw' : 'Reshuffle',
    });
    if (!ok) return;
    try {
      await getBackend().regenerateSchedule(session.id);
      await refresh();
      toast(pooled ? 'Pools redrawn.' : 'Schedule reshuffled.', { type: 'success' });
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

  /**
   * Swap the finish on a running session.
   *
   * The playoff fixtures are rebuilt from scratch; the round robin and its
   * scores are never touched. The backend refuses once a playoff game has been
   * scored, so a failure here is worth showing rather than swallowing.
   */
  const savePlayoffShape = async (shape) => {
    try {
      await getBackend().setPlayoffShape(session.id, shape);
      await refresh();
      toast(shape ? 'Playoff format changed.' : 'Playoffs removed.', { type: 'success' });
    } catch (err) {
      toast(err.message ?? 'Could not change the finish.', { type: 'error' });
    }
  };

  /**
   * End a session with fixtures still unplayed.
   *
   * The ordinary case — everything played — needs nothing stored: the games
   * say it. This is the evening that ran out of daylight, which is the one
   * thing the games cannot tell you apart from a session still in progress.
   */
  const finishSession = async () => {
    const left = unplayedCount(games);
    const ok = await confirmDialog({
      title: 'Finish this session?',
      message:
        `${left} ${left === 1 ? 'game' : 'games'} still ${left === 1 ? 'has' : 'have'} no score. ` +
        'The standings keep what was played, and you can reopen it if you change your mind.',
      confirmLabel: 'Finish',
    });
    if (!ok) return;
    try {
      await getBackend().setSessionStatus(session.id, 'final');
      await refresh();
      toast('Session finished.', { type: 'success' });
    } catch (err) {
      toast(err.message ?? 'Could not finish the session.', { type: 'error' });
    }
  };

  const reopenSession = async () => {
    try {
      await getBackend().setSessionStatus(session.id, 'live');
      await refresh();
      toast('Session reopened.', { type: 'success' });
    } catch (err) {
      toast(err.message ?? 'Could not reopen the session.', { type: 'error' });
    }
  };

  const createSession = async (config) => {
    await getBackend().createSession(config);
    // followActive, not refresh: if a past session was open from History the
    // app used to stay on it, leaving yesterday's schedule up after you had
    // just built today's.
    await followActive();
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
                {/* Empty when the name already carries the date, which it does
                    by default now — see sessionWhen(). */}
                {sessionWhen(session) && (
                  <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                    {sessionWhen(session)}
                  </p>
                )}
                <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                  {/* Was hardcoded to Americano for every non-singles session,
                      so a fixed-pairs morning was labelled as the wrong format
                      on the one screen that sets it up. */}
                  {formatLabel(session.format)} · {session.numGames} games · to {session.pointsTo}
                </p>
              </div>
              {/* Keyed on whether there is anything left to play, not on the
                  stored status — which nothing used to write, so this chip said
                  "live" forever. */}
              <Chip tone={over ? 'neutral' : 'optic'}>{over ? 'finished' : 'live'}</Chip>
            </div>
          ) : (
            <p className="font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
              No session running.
            </p>
          )}

          {/* Announcing a schedule nobody is going to play is worse than not
              offering it. The results share lives on Standings. */}
          {session && !over && (
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

          {/* Everything that shapes a session in progress is hidden once there
              is nothing left to play. Offering "Reshuffle schedule" under a
              finished session is noise at best and a trap at worst. */}
          {session && isAdmin && !over && (
            <Button
              variant="secondary"
              full
              onClick={() => (isTeamFormat(session.format) ? setTeamsModal(true) : reshuffle())}
            >
              {isTeamFormat(session.format) ? <Users size={16} /> : <Shuffle size={16} />}
              {isTeamFormat(session.format)
                ? 'Edit teams'
                : session.format === FORMATS.POOLS
                  ? 'Redraw the pools'
                  : 'Reshuffle schedule'}
            </Button>
          )}

          {/* The finish is decided on the court as often as in the setup sheet
              — "let's make it a Page" comes up once people see the table. */}
          {session &&
            isAdmin &&
            !over &&
            canRunPlayoffs({ format: session.format, playerCount: session.playerIds.length }) && (
              <Button variant="secondary" full onClick={() => setPlayoffModal(true)}>
                <Trophy size={16} />
                Change the finish
              </Button>
            )}

          {/* Stopping early. The derived "everything is played" case needs no
              button; this is for the evening that ran out of daylight. */}
          {session && isAdmin && !over && unplayedCount(games) > 0 && games.length > 0 && (
            <Button variant="secondary" full onClick={finishSession}>
              <Flag size={16} />
              Finish the session
            </Button>
          )}

          {session && isAdmin && reopenable && (
            <Button variant="secondary" full onClick={reopenSession}>
              <RotateCcw size={16} />
              Reopen the session
            </Button>
          )}

          {isAdmin && (
            <Button variant="primary" full onClick={() => setSessionModal(true)} disabled={active.length < 2}>
              <Play size={16} />
              {!session ? 'Start a session' : over ? 'Start the next session' : 'Start another session'}
            </Button>
          )}
          {isAdmin && active.length < 2 && (
            <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
              {members.length < 2
                ? 'Add at least two players first.'
                : 'At least two players need to be playing. Bring somebody back from the list below.'}
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
              Roster ({active.length})
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
            {active.map((m) => (
              <RosterRow
                key={m.id}
                member={m}
                isAdmin={isAdmin}
                isYou={m.id === identity?.memberId}
                adminCount={adminCount}
                inactive={false}
                blockedReason={deactivateBlockedReason(m, members)}
                remote={remote}
                clubName={club.name}
                appUrl={appUrl}
                invite={inviteFor(m.id)}
                onRole={setRole}
                onRename={renamePlayer}
                onRemove={removePlayer}
                onActive={setActive}
                onMint={mintInvite}
                onRevoke={revokeInvite}
              />
            ))}
          </div>

          {/* Everybody who has stepped back, below the line. Still here, still
              tappable, still holding every result they ever had — just not
              offered for the next session. */}
          {inactive.length > 0 && (
            <>
              <div className="mt-3 flex items-center gap-3">
                <h2
                  className="font-sans text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-lo)' }}
                >
                  Not playing ({inactive.length})
                </h2>
                <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
              </div>
              <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                Left out of new sessions. Every game they played still counts.
              </p>
              <div className="flex flex-col gap-1.5">
                {inactive.map((m) => (
                  <RosterRow
                    key={m.id}
                    member={m}
                    isAdmin={isAdmin}
                    isYou={m.id === identity?.memberId}
                    adminCount={adminCount}
                    inactive
                    blockedReason={null}
                    remote={remote}
                    clubName={club.name}
                    appUrl={appUrl}
                    invite={inviteFor(m.id)}
                    onRole={setRole}
                    onRename={renamePlayer}
                    onRemove={removePlayer}
                    onActive={setActive}
                    onMint={mintInvite}
                    onRevoke={revokeInvite}
                  />
                ))}
              </div>
            </>
          )}
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
                      {[sessionWhen(s), `${s.numGames} games`].filter(Boolean).join(' · ')}
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
        sessions={sessions}
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

      {session && (
        <PlayoffModal
          open={playoffModal}
          onClose={() => setPlayoffModal(false)}
          session={session}
          games={games}
          onSave={savePlayoffShape}
        />
      )}
    </>
  );
}
