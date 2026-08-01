import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Snowflake } from 'lucide-react';
import TopBar from '../components/layout/TopBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import FlipList from '../components/fx/FlipList.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import useSessionStore from '../store/sessionStore.js';
import { computeStandings, sessionProgress } from '../utils/standings.js';

// Four columns, not six. On a 390px phone, adding PF/PA squeezes the name column
// until "Varun" renders as "Var…" — and a name you can't read is worse than a
// stat you have to tap through for. Points for/against live on the player page.
const COLUMNS = [
  { key: 'gp', label: 'GP' },
  { key: 'w', label: 'W' },
  { key: 'l', label: 'L' },
];

function StreakBadge({ streak }) {
  if (!streak) return null;
  const hot = streak > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-sans text-[10px] font-bold"
      style={{ color: hot ? 'var(--optic-ink)' : 'var(--clay)' }}
      title={hot ? `${streak} wins in a row` : `${-streak} losses in a row`}
    >
      {hot ? <Flame size={11} /> : <Snowflake size={11} />}
      {Math.abs(streak)}
    </span>
  );
}

export default function StandingsPage() {
  const { session, games, recentlyChanged } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());

  const rows = useMemo(() => computeStandings(players, games), [players, games]);
  const progress = useMemo(() => sessionProgress(games), [games]);
  const anyPlayed = progress.played > 0;

  // Which rows should flash: anyone who played the game that just changed.
  const flashing = useMemo(() => {
    if (recentlyChanged.length === 0) return new Set();
    const ids = new Set();
    for (const g of games) {
      if (!recentlyChanged.includes(g.id)) continue;
      for (const id of [...g.teamA, ...g.teamB]) ids.add(id);
    }
    return ids;
  }, [recentlyChanged, games]);

  if (!session || players.length === 0) {
    return (
      <>
        <TopBar title="Standings" />
        <EmptyState
          title="No standings yet"
          message="Once a session is running and a game has a score, the table appears here."
        />
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Standings"
        subtitle={anyPlayed ? `${progress.played} of ${progress.total} games played` : session.name}
      />

      {!anyPlayed ? (
        <EmptyState
          title="Nothing played yet"
          message="Enter a score and the table will start moving."
        >
          <Link
            to="/score"
            className="font-sans text-sm font-semibold"
            style={{ color: 'var(--optic-ink)' }}
          >
            Go to Score →
          </Link>
        </EmptyState>
      ) : (
        <div className="px-4">
          {/* Column header — sticky so it survives a long roster. */}
          <div
            className="sticky top-0 z-10 flex items-center gap-2 py-2"
            style={{ background: 'var(--bg-deep)' }}
          >
            <span className="w-6 shrink-0" />
            <span className="flex-1 font-sans text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-lo)' }}>
              Player
            </span>
            {COLUMNS.map((c) => (
              <span
                key={c.key}
                className="w-7 shrink-0 text-right font-sans text-[11px] font-bold uppercase"
                style={{ color: 'var(--text-lo)' }}
              >
                {c.label}
              </span>
            ))}
            <span className="w-10 shrink-0 text-right font-sans text-[11px] font-bold uppercase" style={{ color: 'var(--text-lo)' }}>
              Diff
            </span>
          </div>

          <FlipList className="flex flex-col gap-1.5">
            {rows.map((row) => {
              const isFirst = row.rank === 1 && row.gp > 0;
              return (
                <Link
                  key={row.id}
                  to={`/players/${row.id}`}
                  className={`flex items-center gap-2 ${flashing.has(row.id) ? 'a-flash' : ''}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: `1px solid ${isFirst ? 'var(--gold)' : 'var(--line)'}`,
                  }}
                >
                  <span
                    className="num w-6 shrink-0 text-center font-display text-sm font-extrabold"
                    style={{ color: isFirst ? 'var(--gold-ink)' : 'var(--text-lo)' }}
                  >
                    {row.rank}
                  </span>

                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar member={players.find((p) => p.id === row.id)} size={24} />
                    <span className="min-w-0">
                      <span
                        className="block truncate font-sans text-sm font-semibold"
                        style={{ color: 'var(--text-hi)' }}
                      >
                        {row.name}
                      </span>
                      <StreakBadge streak={row.streak} />
                    </span>
                  </span>

                  {COLUMNS.map((c) => (
                    <span
                      key={c.key}
                      className="num w-7 shrink-0 text-right font-display text-sm"
                      style={{
                        color: c.key === 'w' ? 'var(--text-hi)' : 'var(--text-lo)',
                        fontWeight: c.key === 'w' ? 700 : 500,
                      }}
                    >
                      {row[c.key]}
                    </span>
                  ))}

                  <span
                    className="num w-10 shrink-0 text-right font-display text-sm font-bold"
                    style={{
                      color:
                        row.diff > 0 ? 'var(--optic-ink)' : row.diff < 0 ? 'var(--clay)' : 'var(--text-lo)',
                    }}
                  >
                    {row.diff > 0 ? '+' : ''}
                    {row.diff}
                  </span>
                </Link>
              );
            })}
          </FlipList>

          <p className="mt-4 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            Ranked by wins, then point difference · tap a player for full stats
          </p>
        </div>
      )}
    </>
  );
}
