import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import MatchCard from '../components/scoreboard/MatchCard.jsx';
import useSessionStore from '../store/sessionStore.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'unplayed', label: 'To play' },
];

export default function MatchesPage() {
  const { session, games, members, identity, recentlyChanged } = useSessionStore();
  const [filter, setFilter] = useState('all');

  const visible = useMemo(() => {
    if (filter === 'unplayed') return games.filter((g) => !g.played);
    if (filter === 'mine' && identity?.memberId) {
      return games.filter(
        (g) => g.teamA.includes(identity.memberId) || g.teamB.includes(identity.memberId)
      );
    }
    return games;
  }, [games, filter, identity?.memberId]);

  const rounds = useMemo(() => {
    const byRound = new Map();
    for (const g of visible) {
      if (!byRound.has(g.round)) byRound.set(g.round, []);
      byRound.get(g.round).push(g);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

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
        subtitle={`${session.name} · ${games.filter((g) => g.played).length}/${games.length} played`}
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

      {visible.length === 0 ? (
        <EmptyState
          title={filter === 'mine' ? 'None of these are yours' : 'Everything has been played'}
          message={
            filter === 'mine'
              ? "You're not in any of these fixtures."
              : 'Every game in this session has a score.'
          }
        />
      ) : (
        <div className="flex flex-col gap-5 px-4">
          {rounds.map(([round, roundGames]) => (
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
                  to="/score"
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
