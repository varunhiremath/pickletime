import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import MatchCard from '../components/scoreboard/MatchCard.jsx';
import BracketSection from '../components/bracket/BracketSection.jsx';
import PlayoffModal from '../components/club/PlayoffModal.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { toast } from '../store/uiStore.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playChime, playError } from '../utils/sound.js';
import { resolveBracket, roundRobinGames } from '../utils/bracket.js';
import { isSessionOver } from '../utils/sessionState.js';

/**
 * Next / Done / Mine, rather than All / Mine / To play.
 *
 * Mid-session the only list anybody wants is what is left to play — a scrolling
 * wall of finished games with the next fixture buried in it is the opposite of
 * useful on a court. Played games are still one tap away, they are just not the
 * default any more, and once the session is over Done becomes the default
 * because by then the results are the point.
 */
const FILTERS = [
  { key: 'next', label: 'Next' },
  { key: 'done', label: 'Done' },
  { key: 'mine', label: 'Mine' },
];

export default function MatchesPage() {
  const { session, games, members, identity, recentlyChanged } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const refresh = useSessionStore((s) => s.refresh);
  // No initial value: which tab you want depends on whether the session is
  // finished, and that is not known until the games load. `null` means "not
  // chosen yet" so the default below can follow the session without ever
  // overriding a tap. See `filter`.
  const [picked, setPicked] = useState(null);
  const [playoffModal, setPlayoffModal] = useState(false);
  const haptic = useHaptics();

  // Entrants, not players: in a fixed-pairs session the thing that wins a game
  // and gets seeded into a semifinal is the team. See utils/entrants.js.
  const { entrants, teamPlay } = useSessionStore((s) => s.sessionEntrants());
  const bracket = useMemo(() => resolveBracket(entrants, games), [entrants, games]);

  // The round robin is what this list shows; the knockout stage has its own
  // section, because a semifinal with nobody in it yet is not a fixture you can
  // sensibly file under "Round 5".
  const fixtures = useMemo(() => roundRobinGames(games), [games]);

  const over = isSessionOver({ session, games });
  // Finished sessions open on the results; running ones open on what is left.
  const filter = picked ?? (over ? 'done' : 'next');

  const visible = useMemo(() => {
    if (filter === 'next') return fixtures.filter((g) => !g.played);
    if (filter === 'done') return fixtures.filter((g) => g.played);
    if (filter === 'mine' && identity?.memberId) {
      return fixtures.filter(
        (g) => g.teamA.includes(identity.memberId) || g.teamB.includes(identity.memberId)
      );
    }
    return fixtures;
  }, [fixtures, filter, identity?.memberId]);

  // On the chips themselves, because "how many are left" is the question the
  // tab is really being asked and a number answers it without a tap.
  const counts = useMemo(() => ({
    next: fixtures.filter((g) => !g.played).length,
    done: fixtures.filter((g) => g.played).length,
    mine: identity?.memberId
      ? fixtures.filter(
          (g) => g.teamA.includes(identity.memberId) || g.teamB.includes(identity.memberId)
        ).length
      : 0,
  }), [fixtures, identity?.memberId]);

  const rounds = useMemo(() => {
    const byRound = new Map();
    for (const g of visible) {
      if (!byRound.has(g.round)) byRound.set(g.round, []);
      byRound.get(g.round).push(g);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  /**
   * Save a score from the card itself. This is the main scoring path now:
   * fixtures rarely finish in schedule order, so being able to fill in any row
   * at any time — rather than paging to the one screen that showed one game —
   * is the difference between the app matching how a session actually runs and
   * fighting it.
   */
  const submit = async (game, a, b, teams) => {
    try {
      await getBackend().submitScore(game.id, a, b, teams);
      // A set match passes no a/b — its totals come from the sets — so "was a
      // score given" is not the same question as "is this a clear".
      const cleared = a == null && !teams?.setsA?.length;
      if (!cleared) {
        haptic('win');
        playChime();
      }
      toast(cleared ? 'Score cleared.' : 'Score saved.', { type: cleared ? 'info' : 'success' });
    } catch (err) {
      playError();
      toast(err.message ?? 'Could not save that score.', { type: 'error' });
    }
  };

  /** Swap the finish without leaving the bracket. See ClubPage for the twin. */
  const savePlayoffShape = async (shape) => {
    try {
      await getBackend().setPlayoffShape(session.id, shape);
      await refresh();
      toast(shape ? 'Playoff format changed.' : 'Playoffs removed.', { type: 'success' });
    } catch (err) {
      playError();
      toast(err.message ?? 'Could not change the finish.', { type: 'error' });
    }
  };

  if (!session || games.length === 0) {
    return (
      <>
        <TopBar title="Matches" />
        <EmptyState
          title="No schedule yet"
          message="Set up a session and PickleTime will generate the fixtures for you."
        >
          <Link to="/club">
            <Button variant="primary">Set up a session</Button>
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Matches"
        subtitle={`${session.name} · ${bracket.rr.played}/${bracket.rr.total} played`}
      />

      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setPicked(f.key)}
              className="shrink-0 font-sans text-[13px] font-semibold"
              style={{
                padding: '7px 15px',
                borderRadius: 'var(--radius-full)',
                background: active ? 'var(--optic)' : 'var(--bg-raised)',
                color: active ? 'var(--text-on-accent)' : 'var(--text-lo)',
              }}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="num ml-1.5 opacity-70">{counts[f.key]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 px-4">
        {visible.length === 0 ? (
          <EmptyState
            title={
              filter === 'mine'
                ? 'None of these are yours'
                : filter === 'done'
                  ? 'Nothing played yet'
                  : 'Every game is in'
            }
            message={
              filter === 'mine'
                ? "You're not in any of these fixtures."
                : filter === 'done'
                  ? 'Scores land here as they are entered.'
                  : 'Every round-robin game has a score. Tap Done to look back at them.'
            }
          />
        ) : (
          rounds.map(([round, roundGames]) => (
            <section key={round} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h2
                  className="font-sans text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-lo)' }}
                >
                  Round {round}
                </h2>
                <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
              </div>

              {roundGames.map((g) => (
                <MatchCard
                  key={g.id}
                  game={g}
                  members={members}
                  courts={session.courts}
                  highlight={recentlyChanged.includes(g.id)}
                  editable
                  onSubmit={(a, b, teams) => submit(g, a, b, teams)}
                  to={`/score?game=${g.id}`}
                />
              ))}
            </section>
          ))
        )}

        {/* The knockout stage always shows, filter or not — it is the session's
            destination and hiding it behind "Mine" would bury the final. */}
        <BracketSection
          bracket={bracket}
          members={members}
          session={session}
          onSubmit={submit}
          onChangeShape={isAdmin ? () => setPlayoffModal(true) : undefined}
        />
      </div>

      <PlayoffModal
        open={playoffModal}
        onClose={() => setPlayoffModal(false)}
        session={session}
        games={games}
        onSave={savePlayoffShape}
      />
    </>
  );
}
