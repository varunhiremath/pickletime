import { useRef } from 'react';
import { useHaptics } from '../../hooks/useHaptics.js';

export const MAX_SCORE = 99;

/**
 * A score, typed.
 *
 * This replaced a tap-to-increment pad. Counting up one tap at a time only works
 * if you score while you play — and in practice nobody does. Games finish out of
 * order, somebody reads six results off a scrap of paper afterwards, and
 * "11" then meant eleven taps. So the number is an input: tap it, type it, done.
 *
 * Details that matter on a phone:
 *   - inputMode="numeric" brings up the digits keypad, not the full keyboard.
 *   - Focusing selects the whole value, so correcting a score is type-over
 *     rather than backspace-then-type.
 *   - Empty is a real state and means "not scored yet" — distinct from 0, which
 *     is a legitimate final score in a game somebody was shut out of.
 *   - Non-digits are stripped rather than rejected, so a stray character from a
 *     predictive keyboard doesn't wipe what was typed.
 */
export default function ScoreInput({
  value,
  onChange,
  label,
  won = false,
  atTarget = false,
  size = 'lg',
  disabled = false,
  onEnter,
}) {
  const haptic = useHaptics();
  const ref = useRef(null);

  const dims = {
    lg: { font: 64, height: 92, radius: 'var(--radius-lg)' },
    sm: { font: 30, height: 52, radius: 'var(--radius-md)' },
  }[size];

  const handle = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (digits === '') {
      onChange(null);
      return;
    }
    const n = Math.min(MAX_SCORE, Number(digits));
    if (n !== value) haptic('bump');
    onChange(n);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      enterKeyHint="done"
      aria-label={label}
      disabled={disabled}
      value={value ?? ''}
      placeholder="–"
      onChange={(e) => handle(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
          onEnter?.();
        }
      }}
      className="num w-full text-center font-display tabular-nums outline-none"
      style={{
        fontSize: dims.font,
        height: dims.height,
        lineHeight: 1,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        borderRadius: dims.radius,
        background: 'var(--bg-raised)',
        border: `1.5px solid ${won ? 'var(--optic)' : 'var(--line)'}`,
        color: atTarget ? 'var(--optic-ink)' : 'var(--text-hi)',
        fontVariantNumeric: 'tabular-nums',
        opacity: disabled ? 0.4 : 1,
        transition: 'border-color var(--dur-standard), color var(--dur-standard)',
      }}
    />
  );
}
