import { Check } from 'lucide-react';
import ScoreInput from './ScoreInput.jsx';
import { BEST_OF, SETS_TO_WIN, normaliseSets, setsStatus } from '../../utils/sets.js';

/**
 * Entering a match played as sets.
 *
 * One row per possible set, all shown at once rather than revealed as the match
 * goes on. A best-of-three won 2–0 simply leaves the third row blank, which is
 * both how it reads on paper and how it is stored — normaliseSets() trims the
 * trailing empties.
 *
 * The draft lives with the caller, because the same rows serve the match card
 * and the full scoreboard, and because a half-typed set must survive a re-render
 * when somebody else's score lands live.
 */
export default function SetEntry({ draft, onChange, disabled = false, label = 'match' }) {
  const check = normaliseSets(draft);
  const status = setsStatus(check);
  // Only nag once there is something to nag about. An untouched match should
  // not open with an error under it.
  const started = draft.some((r) => r.a !== '' || r.b !== '');

  const set = (i, side, value) =>
    onChange(draft.map((row, j) => (j === i ? { ...row, [side]: value ?? '' } : row)));

  return (
    <div className="flex flex-col gap-2">
      {draft.map((row, i) => {
        const decided = row.a !== '' && row.b !== '' && Number(row.a) !== Number(row.b);
        const aWon = decided && Number(row.a) > Number(row.b);
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-12 shrink-0 font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Set {i + 1}
            </span>
            <span className="w-[58px]">
              <ScoreInput
                size="sm"
                value={row.a === '' ? null : Number(row.a)}
                onChange={(v) => set(i, 'a', v == null ? '' : String(v))}
                label={`Set ${i + 1}, first score for ${label}`}
                won={aWon}
                disabled={disabled}
              />
            </span>
            <span className="font-sans text-xs font-bold" style={{ color: 'var(--text-lo)' }}>
              –
            </span>
            <span className="w-[58px]">
              <ScoreInput
                size="sm"
                value={row.b === '' ? null : Number(row.b)}
                onChange={(v) => set(i, 'b', v == null ? '' : String(v))}
                label={`Set ${i + 1}, second score for ${label}`}
                won={decided && !aWon}
                disabled={disabled}
              />
            </span>
            {decided && (
              <span style={{ color: 'var(--optic-ink)' }}>
                <Check size={14} />
              </span>
            )}
          </div>
        );
      })}

      <p
        className="font-sans text-xs"
        style={{ color: status.tone === 'error' ? 'var(--clay)' : 'var(--text-lo)' }}
      >
        {started
          ? status.message
          : `Best of ${BEST_OF} — first to ${SETS_TO_WIN} sets. Save as you go; leave the third blank if it went 2–0.`}
      </p>
    </div>
  );
}
