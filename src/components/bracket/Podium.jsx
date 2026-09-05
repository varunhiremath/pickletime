import { Trophy } from 'lucide-react';
import { Faces } from '../scoreboard/PlayerChip.jsx';

/**
 * The result of a tournament: one champion, plus who came second and third.
 *
 * This is the payoff for the whole session, so it gets the one genuinely loud
 * surface in the app — a gold field, the winner's name at display size, and the
 * other two placings sized down beneath it. Text on gold is --text-on-accent by
 * the rule in styles/tokens.css; nothing else may go there.
 */
export default function Podium({ champion, runnerUp, third, members, compact = false }) {
  if (!champion) return null;

  // A champion can be one player or a whole pair, so faces come from the
  // entrant's players rather than from its id — a team's id is a synthetic key
  // that matches no member. See utils/entrants.js.
  const facesOf = (row) => (row?.playerIds ?? (row?.id ? [row.id] : []));

  const Placing = ({ row, medal, label }) => (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="text-base leading-none" aria-hidden="true">{medal}</span>
      <span
        className="max-w-full truncate font-sans text-[13px] font-bold"
        style={{ color: 'var(--text-on-accent)' }}
      >
        {row?.name ?? '—'}
      </span>
      <span
        className="font-sans text-[10px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-on-accent)', opacity: 0.65 }}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div
      className="a-pop flex flex-col items-center"
      style={{
        padding: compact ? 'var(--space-4)' : 'var(--space-5) var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(150deg, var(--gold), color-mix(in srgb, var(--gold) 72%, #fff))',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span style={{ color: 'var(--text-on-accent)' }}>
        <Trophy size={compact ? 22 : 30} strokeWidth={2.2} />
      </span>
      <span
        className="mt-1 font-sans text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: 'var(--text-on-accent)', opacity: 0.7 }}
      >
        Champion
      </span>

      <span className="mt-1.5 flex max-w-full items-center gap-2 px-2">
        <Faces ids={facesOf(champion)} members={members} size={compact ? 26 : 32} />
        <span
          className="min-w-0 font-display font-extrabold"
          style={{
            // A pair's name is two names joined, so it needs to be allowed to
            // wrap and to shrink — "Ana & Ben" must not push the card wider
            // than the phone.
            fontSize: compact ? 22 : 28,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            color: 'var(--text-on-accent)',
            overflowWrap: 'anywhere',
          }}
        >
          {champion.name}
        </span>
      </span>

      {(runnerUp || third) && (
        <div
          className="mt-3 grid w-full grid-cols-2 gap-2 pt-3"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--text-on-accent) 18%, transparent)' }}
        >
          <Placing row={runnerUp} medal="🥈" label="Runner-up" />
          <Placing row={third} medal="🥉" label="Third" />
        </div>
      )}
    </div>
  );
}
