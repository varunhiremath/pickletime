import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import Chip from '../ui/Chip.jsx';
import { Avatar } from './PlayerChip.jsx';

/**
 * One fixture in the Matches list.
 *
 * The winning side gets an optic rail and the losing side desaturates — the
 * result is legible at a glance without a trophy icon competing with the score.
 */
export default function MatchCard({ game, members, courts = 1, highlight = false, to }) {
  const memberById = (id) => members.find((m) => m.id === id);
  const played = game.played && game.scoreA != null && game.scoreB != null;
  const aWon = played && game.scoreA > game.scoreB;
  const bWon = played && game.scoreB > game.scoreA;

  const Side = ({ ids, score, won, lost }) => (
    <div className="flex min-w-0 flex-1 items-center gap-2" style={{ opacity: lost ? 0.55 : 1 }}>
      {won && (
        <span
          className="a-rail shrink-0"
          style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--optic)' }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {ids.map((id) => {
          const m = memberById(id);
          return (
            <span key={id} className="flex items-center gap-1.5">
              <Avatar member={m} size={20} />
              <span
                className="truncate font-sans text-sm"
                style={{ fontWeight: won ? 700 : 500, color: 'var(--text-hi)' }}
              >
                {m?.name ?? '—'}
              </span>
            </span>
          );
        })}
      </div>
      <span
        className="font-display num shrink-0 tabular-nums"
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: played ? 'var(--text-hi)' : 'var(--text-lo)',
        }}
      >
        {score ?? '–'}
      </span>
    </div>
  );

  const body = (
    <div
      className={`flex flex-col gap-3 ${highlight ? 'a-flash' : ''}`}
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        border: `1px solid ${game.pending ? 'var(--court)' : 'var(--line)'}`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-2">
        <Chip>Game {game.ordinal}</Chip>
        {courts > 1 && <Chip tone="court">Court {game.court}</Chip>}
        {!played && <Chip tone="neutral">Not played</Chip>}
        {game.pending && (
          <Chip tone="court">
            <Clock size={10} /> Queued
          </Chip>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Side ids={game.teamA} score={game.scoreA} won={aWon} lost={bWon} />
        <span className="font-sans text-xs font-bold" style={{ color: 'var(--text-lo)' }}>
          vs
        </span>
        <Side ids={game.teamB} score={game.scoreB} won={bWon} lost={aWon} />
      </div>

      {game.byes?.length > 0 && (
        <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          Sitting out: {game.byes.map((id) => memberById(id)?.name ?? '—').join(', ')}
        </p>
      )}
    </div>
  );

  return to ? (
    <Link to={to} className="block active:scale-[0.99]" style={{ transition: 'transform var(--dur-micro)' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
