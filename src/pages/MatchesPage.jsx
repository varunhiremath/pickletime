import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import MatchCard from '../components/scoreboard/MatchCard.jsx';
import BracketSection from '../components/bracket/BracketSection.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { toast } from '../store/uiStore.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playChime, playError } from '../utils/sound.js';
import { resolveBracket, roundRobinGames } from '../utils/bracket.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unplayed', label: 'To play' },
];

export default function MatchesPage() {
  const { session, games, members, identity, recentlyChanged } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());
  const [filter, setFilter] = useState('all');
  const haptic = useHaptics();

  // Entrants, not players: in a fixed-pairs session the thing that wins a game
  // and gets seeded into a semifinal is the team. See utils/entrants.js.
  const { entrants, teamPlay } = useSessionStore((s) => s.sessionEntrants());
  const bracket = useMemo(() => resolveBracket(entrants, games), [entrants, games]);

  // The round robin is what this list shows; the knockout stage has its own
  // section, because a semifinal with nobody in it yet is not a fixture you can
  // sensibly file under "Round 5".
  const fixtures = useMemo(() => roundRobinGames(games), [games]);

  const visible = useMemo(() => {
    if (filter === 'unplayed') return fixtures.filter((g) => !g.played);
    if (filter === 'mine' && identity?.memberId) {
      return fixtures.filter(
        (g) => g.teamA.includes(identity.memberId) || g.teamB.includes(identity.memberId)
      );
    }
    return fixtures;
  }, [fixtures, filter, identity?.memberId]);

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
      if (a != null) {
        haptic('win');
        playChime();
      }
      toast(a == null ? 'Score cleared.' : 'Score saved.', { type: a == null ? 'info' : 'success' });
    } catch (err) {
      playError();
      toast(err.message ?? 'Could not save that score.', { type: 'error' });
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
              onClick={() => setFilter(f.key)}
              className="shrink-0 font-sans text-[13px] font-semibold"
              style={{
                padding: '7px 15px',
                borderRadius: 'var(--radius-full)',
                background: active ? 'var(--optic)' : 'var(--bg-raised)',
                color: active ? 'var(--text-on-accent)' : 'var(--text-lo)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 px-4">
        {visible.length === 0 ? (
          <EmptyState
            title={filter === 'mine' ? 'None of these are yours' : 'Everything has been played'}
            message={
              filter === 'mine'
                ? "You're not in any of these fixtures."
                : 'Every round-robin game has a score.'
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
        />
      </div>
    </>
  );
}
