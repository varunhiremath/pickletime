import { useEffect, useState, useRef } from 'react';
import useSettingsStore from '../../store/settingsStore.js';

/**
 * A big scoreboard number.
 *
 * Always tabular so the layout does not shift as digits change — the single most
 * common polish bug in live score UIs. When the value changes under the user
 * (someone else scored the game), the digits roll in rather than snapping.
 */
export default function Numeral({ value, size = 72, dim = false, className = '', style = {} }) {
  const effects = useSettingsStore((s) => s.effects);
  const [rolling, setRolling] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (!effects) return;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 260);
    return () => clearTimeout(t);
  }, [value, effects]);

  const display = value == null ? '–' : value;

  return (
    <span
      key={rolling ? `roll-${value}` : `still-${value}`}
      className={`font-display num tabular-nums ${rolling ? 'a-roll' : ''} ${className}`}
      style={{
        fontSize: size,
        lineHeight: 0.92,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: dim ? 'var(--text-lo)' : 'var(--text-hi)',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {display}
    </span>
  );
}
