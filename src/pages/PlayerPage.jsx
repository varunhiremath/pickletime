import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import TopBar from '../components/layout/TopBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import CountUp from '../components/fx/CountUp.jsx';
import { Avatar } from '../components/scoreboard/PlayerChip.jsx';
import useSessionStore from '../store/sessionStore.js';
import { computeStandings, headToHead, partnerRecords } from '../utils/standings.js';

function Stat({ label, value, tone }) {
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
        className="font-display text-xl font-extrabold"
        style={{ color: tone ?? 'var(--text-hi)' }}
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

function RecordList({ title, rows, render }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2
        className="font-sans text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-lo)' }}
      >
        {title}
      </h2>
      <div
        className="flex flex-col"
        style={{
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--line)',
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
          >
            {render(r)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PlayerPage() {
  const { id } = useParams();
  const { games, members } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());

  const member = members.find((m) => m.id === id);
  const row = useMemo(
    () => computeStandings(players, games).find((r) => r.id === id),
    [players, games, id]
  );
  const h2h = useMemo(() => headToHead(id, members, games), [id, members, games]);
  const partners = useMemo(() => partnerRecords(id, members, games), [id, members, games]);

  if (!member) {
    return (
      <>
        <TopBar title="Player" showLive={false} />
        <EmptyState title="Player not found" message="They may have been removed from the roster." />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link
          to="/standings"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
        >
          <ChevronLeft size={18} />
        </Link>
        <Avatar member={member} size={38} />
        <div className="min-w-0 flex-1">
          <h1
            className="truncate font-display text-xl font-extrabold"
            style={{ letterSpacing: '-0.02em', color: 'var(--text-hi)' }}
          >
            {member.name}
          </h1>
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            {member.role === 'admin' ? 'Admin' : 'Player'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5 px-4">
        {row && row.gp > 0 ? (
          <>
            <div className="flex gap-2">
              <Stat label="Rank" value={row.rank} />
              <Stat label="Won" value={row.w} tone="var(--optic-ink)" />
              <Stat label="Lost" value={row.l} tone={row.l > 0 ? 'var(--clay)' : undefined} />
              <Stat
                label="Diff"
                value={row.diff}
                tone={row.diff >= 0 ? 'var(--optic-ink)' : 'var(--clay)'}
              />
            </div>

            <div className="flex gap-2">
              <Stat label="Played" value={row.gp} />
              <Stat label="Points for" value={row.pf} />
              <Stat label="Against" value={row.pa} />
            </div>

            <RecordList
              title="Against"
              rows={h2h}
              render={(r) => (
                <>
                  <Avatar member={members.find((m) => m.id === r.id)} size={22} />
                  <span
                    className="min-w-0 flex-1 truncate font-sans text-[13px]"
                    style={{ color: 'var(--text-hi)' }}
                  >
                    {r.name}
                  </span>
                  <span className="num font-display text-sm font-bold" style={{ color: 'var(--text-lo)' }}>
                    {r.w}–{r.l}
                    {r.t > 0 ? `–${r.t}` : ''}
                  </span>
                </>
              )}
            />

            <RecordList
              title="With"
              rows={partners}
              render={(r) => (
                <>
                  <Avatar member={members.find((m) => m.id === r.id)} size={22} />
                  <span
                    className="min-w-0 flex-1 truncate font-sans text-[13px]"
                    style={{ color: 'var(--text-hi)' }}
                  >
                    {r.name}
                  </span>
                  <span className="num font-display text-sm font-bold" style={{ color: 'var(--text-lo)' }}>
                    {r.w}–{r.l}
                    {r.t > 0 ? `–${r.t}` : ''}
                  </span>
                </>
              )}
            />
          </>
        ) : (
          <EmptyState title="No games yet" message={`${member.name} hasn't played in this session.`} />
        )}
      </div>
    </>
  );
}
