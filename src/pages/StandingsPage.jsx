import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Snowflake, Share2, GitBranch } from 'lucide-react';
import TopBar from '../components/layout/TopBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import FlipList from '../components/fx/FlipList.jsx';
import { Faces } from '../components/scoreboard/PlayerChip.jsx';
import Podium from '../components/bracket/Podium.jsx';
import useSessionStore from '../store/sessionStore.js';
import Button from '../components/ui/Button.jsx';
import { resolveBracket, roundRobinGames } from '../utils/bracket.js';
import { buildResultsShare, formatSessionDate } from '../utils/sessionShare.js';
import { renderBracketPng } from '../utils/bracketImage.js';
import { shareText, shareFile } from '../utils/share.js';
import { toast } from '../store/uiStore.js';

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

/**
 * A standings row. Individuals link to their player page; a team does not have
 * one — it is two people, and picking one of them to link to would be a lie.
 */
function Row({ teamPlay, row, children, className, style }) {
  if (teamPlay) {
    return <div className={className} style={style}>{children}</div>;
  }
  return (
    <Link to={`/players/${row.id}`} className={className} style={style}>
      {children}
    </Link>
  );
}

/** "Sunday Doubles" → "sunday-doubles", for a filename people can find again. */
const slug = (name) =>
  (name ?? 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';

export default function StandingsPage() {
  const { club, session, games, members, recentlyChanged } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());

  // The table is the ROUND ROBIN table. Playoff results must not feed back into
  // it: the standings are what seeds the bracket, so counting semifinals here
  // would let the bracket rewrite its own seeding.
  const fixtures = useMemo(() => roundRobinGames(games), [games]);
  // Entrants, not players: in a fixed-pairs session the thing that wins a game
  // and gets seeded into a semifinal is the team. See utils/entrants.js.
  const { entrants, teamPlay } = useSessionStore((s) => s.sessionEntrants());
  const bracket = useMemo(() => resolveBracket(entrants, games), [entrants, games]);
  // The bracket already ranks the entrants, and this is the same table that
  // seeds it — deriving it twice would be two chances to disagree.
  const rows = bracket.standings;
  // A team name is two names joined, so it needs the width back that three
  // one- or two-digit columns do not use. "Anand & Sudheer" elided by four
  // pixels before this.
  const numWidth = teamPlay ? 'w-6' : 'w-7';
  const progress = bracket.rr;
  const anyPlayed = progress.played > 0;

  // Which rows should flash: anyone who played the game that just changed.
  const flashing = useMemo(() => {
    if (recentlyChanged.length === 0) return new Set();
    const ids = new Set();
    for (const g of fixtures) {
      if (!recentlyChanged.includes(g.id)) continue;
      for (const id of [...g.teamA, ...g.teamB]) ids.add(id);
    }
    return ids;
  }, [recentlyChanged, fixtures]);

  /**
   * Post the results to the group chat. Same reasoning as the session
   * announcement on the Club tab: the app cannot send a notification, so the
   * chat is where results actually reach people who weren't there.
   */
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

  /**
   * Post the bracket as a picture.
   *
   * Its own button rather than an attachment on the results message: iOS drops
   * the text when a share carries a file, so bundling them would quietly lose
   * the scores. See utils/share.js.
   */
  const shareBracket = async () => {
    const png = await renderBracketPng({
      bracket,
      nameOf: (ids) => (ids ?? []).map((id) => members.find((m) => m.id === id)?.name ?? '—').join(' & '),
      title: session.name,
      subtitle: [formatSessionDate(session.date), club?.name].filter(Boolean).join(' · '),
    });
    if (!png) {
      toast('Nothing to draw yet — play a playoff game first.', { type: 'info' });
      return;
    }

    const file = new File([png], `${slug(session.name)}-bracket.png`, { type: 'image/png' });
    const outcome = await shareFile(file, { title: `${session.name} — bracket` });
    if (outcome === 'downloaded') {
      toast('Bracket saved to your downloads.', { type: 'success' });
    } else if (outcome === 'failed') {
      toast('Could not share the bracket.', { type: 'error' });
    }
  };

  if (!session || entrants.length === 0) {
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
        subtitle={
          anyPlayed
            ? `${bracket.enabled ? 'Round robin' : 'Session'} · ${progress.played} of ${progress.total} played`
            : session.name
        }
      />

      {/* The tournament's result outranks the table that produced it. */}
      {bracket.complete && (
        <div className="mb-4 px-4">
          <Podium
            champion={bracket.champion}
            runnerUp={bracket.runnerUp}
            third={bracket.third}
            members={members}
          />
        </div>
      )}

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
              {teamPlay ? 'Team' : 'Player'}
            </span>
            {COLUMNS.map((c) => (
              <span
                key={c.key}
                className={`${numWidth} shrink-0 text-right font-sans text-[11px] font-bold uppercase`}
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
                <Row
                  key={row.id}
                  teamPlay={teamPlay}
                  row={row}
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
                    <Faces ids={row.playerIds ?? [row.id]} members={members} size={24} />
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
                      className={`num ${numWidth} shrink-0 text-right font-display text-sm`}
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
                </Row>
              );
            })}
          </FlipList>

          <div className="mt-5 flex flex-col gap-2">
            <Button variant={bracket.complete ? 'primary' : 'secondary'} full onClick={shareResults}>
              <Share2 size={16} />
              {bracket.complete ? 'Share the final results' : 'Share results so far'}
            </Button>
            {/* Only once there is a bracket with something in it — a picture of
                four empty fixtures tells nobody anything. */}
            {bracket.matches.some((m) => m.played) && (
              <Button variant="secondary" full onClick={shareBracket}>
                <GitBranch size={16} />
                Share the bracket as a picture
              </Button>
            )}
          </div>

          <p className="mt-4 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            {bracket.enabled ? 'Round-robin table — this is what seeds the playoffs. ' : ''}
            Ranked by wins, then point difference · tap a player for full stats
          </p>
        </div>
      )}
    </>
  );
}
