import ScoreInput from './ScoreInput.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';

/**
 * One side of the scoreboard: the team, and the score they got.
 *
 * The score is typed rather than tapped up one point at a time — see
 * ScoreInput.jsx for why. The pad itself is now just the team, the input, and
 * the win state.
 */
export default function ScorePad({ ids, members, score, onChange, won, pointsTo, side, onEnter }) {
  const memberById = (id) => members.find((m) => m.id === id);
  const atTarget = Boolean(pointsTo && score != null && score >= pointsTo);
  const names = ids.map((id) => memberById(id)?.name ?? '—').join(' and ');

  return (
    <div
      className="flex flex-1 flex-col items-center gap-3"
      style={{
        padding: 'var(--space-4) var(--space-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        border: `1.5px solid ${won ? 'var(--optic)' : 'var(--line)'}`,
        boxShadow: won ? 'var(--optic-glow)' : 'var(--shadow-card)',
        transition: 'border-color var(--dur-standard), box-shadow var(--dur-standard)',
      }}
    >
      <div className="flex min-h-[46px] flex-col items-center gap-1">
        {ids.length === 0 ? (
          <span className="font-sans text-[13px] font-semibold" style={{ color: 'var(--text-lo)' }}>
            —
          </span>
        ) : (
          ids.map((id) => {
            const m = memberById(id);
            return (
              <span key={id} className="flex items-center gap-1.5">
                <Avatar member={m} size={20} />
                <span
                  className="max-w-[92px] truncate font-sans text-[13px] font-semibold"
                  style={{ color: 'var(--text-hi)' }}
                >
                  {m?.name ?? '—'}
                </span>
              </span>
            );
          })
        )}
      </div>

      <ScoreInput
        value={score}
        onChange={onChange}
        onEnter={onEnter}
        label={`Score for ${names || `team ${side}`}`}
        won={won}
        atTarget={atTarget}
        size="lg"
      />
    </div>
  );
}
