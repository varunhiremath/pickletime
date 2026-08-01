import { useState, useEffect, useRef } from 'react';
import useSettingsStore from '../../store/settingsStore.js';

/**
 * Animated odometer that eases to `value` whenever it changes.
 * Falls back to the plain number when effects are off or motion is reduced.
 */
export default function CountUp({
  value = 0,
  duration = 700,
  format = (n) => Math.round(n).toLocaleString(),
  className = '',
  style = {},
}) {
  const effects = useSettingsStore((s) => s.effects);
  const [n, setN] = useState(value);
  const raf = useRef();
  const from = useRef(value);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = effects && !reduced;

  useEffect(() => {
    if (!animate) {
      setN(value);
      from.current = value;
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    cancelAnimationFrame(raf.current);
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(origin + delta * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, animate]);

  return (
    <span className={`num ${className}`} style={style}>
      {format(n)}
    </span>
  );
}
