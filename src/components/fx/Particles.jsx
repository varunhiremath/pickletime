import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import useSettingsStore from '../../store/settingsStore.js';

// One-shot burst from the centre of the screen. The parent mounts it briefly
// (~1.2s) and unmounts. Colours are the app's accents, not confetti rainbow.
const COLORS = ['#D7F205', '#1B9AAA', '#FF5C39', '#F1F5F9'];

export default function Particles({ count = 26 }) {
  const effects = useSettingsStore((s) => s.effects);

  const bits = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        tx: `${(Math.random() * 2 - 1) * 240}px`,
        ty: `${(Math.random() * 2 - 1) * 240 - 40}px`,
        rot: `${(Math.random() * 2 - 1) * 320}deg`,
        size: 5 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 90,
        dur: 700 + Math.random() * 600,
      })),
    [count]
  );

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!effects || reduced) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: b.size,
            height: b.size,
            borderRadius: i % 3 === 0 ? '50%' : '2px',
            background: b.color,
            '--tx': b.tx,
            '--ty': b.ty,
            '--rot': b.rot,
            animation: `pt-burst ${b.dur}ms var(--ease-out) ${b.delay}ms both`,
          }}
        />
      ))}
    </div>,
    document.body
  );
}
