import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Trophy } from 'lucide-react';
import TopBar, { Wordmark } from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import CountUp from '../components/fx/CountUp.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import MatchCard from '../components/scoreboard/MatchCard.jsx';
import useSessionStore from '../store/sessionStore.js';
import { computeStandings, sessionProgress } from '../utils/standings.js';

function StatTile({ label, value, tone = 'default' }) {
  const colors = {
    default: 'var(--text-hi)',
    good: 'var(--optic-ink)',
    bad: 'var(--clay)',
  };
  return (
    <div
      className="flex flex-1 flex-col items-center gap-0.5"
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
      }}
    >
      <CountUp
        value={value}
        className="font-display text-2xl font-extrabold"
        style={{ color: colors[tone], letterSpacing: '-0.02em' }}
      />
      <span
        className="font-sans text-[10px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-lo)' }}
      >
        {label}
      </span>
    </div>
  );
}

export default function TodayPage() {
  const { club, session, games, members, identity } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());

  const progress = useMemo(() => sessionProgress(games), [games]);
  const rows = useMemo(() => computeStandings(players, games), [players, games]);
  const me = rows.find((r) => r.id === identity?.memberId);
  const leader = rows[0]?.gp > 0 ? rows[0] : null;

  // The game being played now: the first without a score.
  const nowPlaying = useMemo(() => games.find((g) => !g.played) ?? null, [games]);

  // The next fixture that involves me, after the one on court.
  const myNext = useMemo(() => {
    if (!identity?.memberId) return null;
    return (
      games.find(
        (g) =>
          !g.played &&
          g.id !== nowPlaying?.id &&
          (g.teamA.includes(identity.memberId) || g.teamB.includes(identity.memberId))
      ) ?? null
    );
  }, [games, identity?.memberId, nowPlaying?.id]);

  const recent = useMemo(
    () => games.filter((g) => g.played).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [games]
  );

  if (!club) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-8 text-center">
        <Wordmark />
        <p className="max-w-xs font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          Schedule games, enter scores together, and watch the standings move.
        </p>
        <Link to="/club">
          <Button variant="primary" size="lg">
            Get started <ArrowRight size={18} />
          </Button>
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <TopBar title="Today" subtitle={club.name} />
        <EmptyState
          title="No session running"
          message="Pick who's playing and PickleTime will build the schedule."
        >
          <Link to="/club">
            <Button variant="primary">Start a session</Button>
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <TopBar title="Today" subtitle={`${club.name} · ${session.name}`} />

      <div className="flex flex-col gap-5 px-4">
        {/* Now playing */}
        {nowPlaying ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2
                className="font-sans text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-lo)' }}
              >
                On court
              </h2>
              <Chip tone="optic">Game {nowPlaying.ordinal}</Chip>
            </div>
            <MatchCard game={nowPlaying} members={members} courts={session.courts} to="/score" />
            <Link to="/score">
              <Button variant="primary" size="lg" full>
                Enter the score <ArrowRight size={18} />
              </Button>
            </Link>
          </section>
        ) : (
          <section
            className="flex flex-col items-center gap-2"
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--optic)',
            }}
          >
            <Trophy size={22} style={{ color: 'var(--gold-ink)' }} />
            <p className="font-display text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
              Session complete
            </p>
            {leader && (
              <p className="font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
                {leader.name} takes it with {leader.w} {leader.w === 1 ? 'win' : 'wins'}.
              </p>
            )}
            <Link to="/standings" className="mt-1">
              <Button variant="secondary">See the final table</Button>
            </Link>
          </section>
        )}

        {/* My numbers */}
        {me && (
          <section className="flex flex-col gap-2">
            <h2
              className="font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Your session
            </h2>
            <div className="flex gap-2">
              <StatTile label="Rank" value={me.rank} />
              <StatTile label="Won" value={me.w} tone="good" />
              <StatTile label="Lost" value={me.l} tone={me.l > 0 ? 'bad' : 'default'} />
              <StatTile label="Diff" value={me.diff} tone={me.diff >= 0 ? 'good' : 'bad'} />
            </div>
          </section>
        )}

        {/* Up next for me */}
        {myNext && (
          <section className="flex flex-col gap-2">
            <h2
              className="font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              You play next
            </h2>
            <MatchCard game={myNext} members={members} courts={session.courts} to="/matches" />
          </section>
        )}

        {/* Results ticker */}
        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2
              className="font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Latest results
            </h2>
            <div
              className="flex flex-col"
              style={{
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--line)',
              }}
            >
              {recent.map((g, i) => {
                const aWon = g.scoreA > g.scoreB;
                const winners = aWon ? g.teamA : g.teamB;
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                  >
                    <span className="flex -space-x-1.5">
                      {winners.map((id) => (
                        <Avatar key={id} member={members.find((m) => m.id === id)} size={20} />
                      ))}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate font-sans text-[13px]"
                      style={{ color: 'var(--text-hi)' }}
                    >
                      {winners.map((id) => members.find((m) => m.id === id)?.name ?? '—').join(' & ')}
                    </span>
                    <span
                      className="num font-display text-sm font-bold"
                      style={{ color: 'var(--text-lo)' }}
                    >
                      {Math.max(g.scoreA, g.scoreB)}–{Math.min(g.scoreA, g.scoreB)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="pb-2 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          {progress.played} of {progress.total} games played
        </p>
      </div>
    </>
  );
}
