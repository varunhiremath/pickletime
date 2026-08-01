import { Minus, Plus } from 'lucide-react';
import Numeral from '../scoreboard/Numeral.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';
import { useHaptics } from '../../hooks/useHaptics.js';
import { playTick } from '../../utils/sound.js';

/**
 * One side of the scoreboard: the team, a big number, and +/- controls.
 *
 * The number itself is the increment target — it's the biggest thing on screen
 * and the easiest to hit while holding a paddle. The explicit minus button is
 * there because a long-press is undiscoverable for a correction.
 */
export default function ScorePad({ ids, members, score, onChange, won, pointsTo, side }) {
  const haptic = useHaptics();
  const memberById = (id) => members.find((m) => m.id === id);
  const value = score ?? 0;

  const bump = (delta) => {
    const next = Math.max(0, Math.min(99, value + delta));
    if (next === value) return;
    haptic('bump');
    playTick();
    onChange(next);
  };

  const atTarget = pointsTo && value >= pointsTo;

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
        {ids.map((id) => {
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
        })}
      </div>

      <button
        onClick={() => bump(1)}
        aria-label={`Add a point for team ${side}`}
        className="flex w-full items-center justify-center active:scale-95"
        style={{ transition: 'transform var(--dur-micro)', minHeight: 96 }}
      >
        <Numeral value={value} size={76} style={{ color: atTarget ? 'var(--optic-ink)' : undefined }} />
      </button>

      <div className="flex w-full items-center justify-center gap-3">
        <button
          onClick={() => bump(-1)}
          aria-label={`Remove a point from team ${side}`}
          disabled={value === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30 active:scale-90"
          style={{
            background: 'var(--bg-raised)',
            color: 'var(--text-hi)',
            transition: 'transform var(--dur-micro)',
          }}
        >
          <Minus size={19} />
        </button>
        <button
          onClick={() => bump(1)}
          aria-label={`Add a point for team ${side}`}
          className="flex h-11 w-11 items-center justify-center rounded-full active:scale-90"
          style={{
            background: 'var(--optic)',
            color: 'var(--text-on-accent)',
            transition: 'transform var(--dur-micro)',
          }}
        >
          <Plus size={19} />
        </button>
      </div>
    </div>
  );
}
