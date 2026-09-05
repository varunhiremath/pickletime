import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Trophy, Share2 } from 'lucide-react';
import TopBar, { Wordmark } from '../components/layout/TopBar.jsx';
import Button from '../components/ui/Button.jsx';
import Chip from '../components/ui/Chip.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import CountUp from '../components/fx/CountUp.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import MatchCard from '../components/scoreboard/MatchCard.jsx';
import Podium from '../components/bracket/Podium.jsx';
import useSessionStore from '../store/sessionStore.js';
import { resolveBracket, roundRobinGames } from '../utils/bracket.js';
import { buildResultsShare } from '../utils/sessionShare.js';
import { shareText } from '../utils/share.js';
import { toast } from '../store/uiStore.js';

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

  const fixtures = useMemo(() => roundRobinGames(games), [games]);
  // Entrants, not players: in a fixed-pairs session the thing that wins a game
  // and gets seeded into a semifinal is the team. See utils/entrants.js.
  const { entrants, teamPlay } = useSessionStore((s) => s.sessionEntrants());
  const bracket = useMemo(() => resolveBracket(entrants, games), [entrants, games]);
  const progress = bracket.rr;
  const rows = bracket.standings;
  // In a pairs session "your" row is your team's — you and your partner share
  // one record, because you share every game.
  const me = rows.find((r) => (r.playerIds ?? [r.id]).includes(identity?.memberId));
  const leader = rows[0]?.gp > 0 ? rows[0] : null;

  // What's on court: the next round-robin game without a score, and once those
  // are done, the next knockout fixture that actually has two players in it. An
  // empty semifinal is not something anyone can walk out and play.
  const onCourt = useMemo(() => {
    const next = fixtures.find((g) => !g.played);
    if (next) return { game: next, teamA: next.teamA, teamB: next.teamB, label: null };
    const m = bracket.matches.find((x) => x.ready && !x.played);
    return m ? { game: m.game, teamA: m.teamA, teamB: m.teamB, label: m.label } : null;
  }, [fixtures, bracket]);

  // The next fixture that involves me, after the one on court.
  const myNext = useMemo(() => {
    const meId = identity?.memberId;
    if (!meId) return null;
    const mine = (a, b) => a.includes(meId) || b.includes(meId);

    const next = fixtures.find(
      (g) => !g.played && g.id !== onCourt?.game?.id && mine(g.teamA, g.teamB)
    );
    if (next) return { game: next, teamA: next.teamA, teamB: next.teamB, label: null };

    const m = bracket.matches.find(
      (x) => x.ready && !x.played && x.game?.id !== onCourt?.game?.id && mine(x.teamA, x.teamB)
    );
    return m ? { game: m.game, teamA: m.teamA, teamB: m.teamB, label: m.label } : null;
  }, [fixtures, bracket, identity?.memberId, onCourt?.game?.id]);

  const recent = useMemo(
    () => games.filter((g) => g.played).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [games]
  );

  const shareResults = async () => {
    const text = buildResultsShare({
      session,
      games,
      members,
      url: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    const outcome = await shareText(text);
    if (outcome === 'copied') {
      toast('Results copied — paste them into your group chat.', { type: 'success' });
    } else if (outcome === 'failed') {
      toast('Could not share the results.', { type: 'error' });
    }
  };

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
        {onCourt ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2
                className="font-sans text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-lo)' }}
              >
                On court
              </h2>
              <Chip tone={onCourt.label ? 'gold' : 'optic'}>
                {onCourt.label ?? `Game ${onCourt.game.ordinal}`}
              </Chip>
            </div>
            <MatchCard
              game={onCourt.game}
              members={members}
              courts={session.courts}
              teamA={onCourt.teamA}
              teamB={onCourt.teamB}
              label={onCourt.label}
              to={`/score?game=${onCourt.game.id}`}
            />
            <Link to={`/score?game=${onCourt.game.id}`}>
              <Button variant="primary" size="lg" full>
                Enter the score <ArrowRight size={18} />
              </Button>
            </Link>
          </section>
        ) : bracket.complete ? (
          <section className="flex flex-col gap-2">
            <Podium
              champion={bracket.champion}
              runnerUp={bracket.runnerUp}
              third={bracket.third}
              members={members}
            />
            {/* Offered right here because this is the moment it gets shared:
                the final has just been scored and the champion is on screen. */}
            <Button variant="primary" full onClick={shareResults}>
              <Share2 size={16} />
              Share the final results
            </Button>
            <Link to="/standings">
              <Button variant="secondary" full>
                See the final table
              </Button>
            </Link>
          </section>
        ) : bracket.enabled ? (
          <section
            className="flex flex-col items-center gap-2"
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--line)',
            }}
          >
            <Trophy size={22} style={{ color: 'var(--gold-ink)' }} />
            <p className="font-display text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
              Playoffs waiting
            </p>
            <p className="text-center font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
              A result is needed before the next tie can be set.
            </p>
            <Link to="/matches" className="mt-1">
              <Button variant="secondary">Open the bracket</Button>
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
              {teamPlay ? 'Your team' : 'Your session'}
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
            <MatchCard
              game={myNext.game}
              members={members}
              courts={session.courts}
              teamA={myNext.teamA}
              teamB={myNext.teamB}
              label={myNext.label}
              to={`/score?game=${myNext.game.id}`}
            />
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
