import { useRef, useLayoutEffect, Children, cloneElement } from 'react';
import useSettingsStore from '../../store/settingsStore.js';

/**
 * FLIP-animated list. When the order of children changes, rows slide from where
 * they were to where they now are instead of teleporting.
 *
 * This is the moment the whole rewrite is for: a friend enters a score on their
 * phone, and everyone else's standings physically reorder a beat later.
 *
 * FLIP = First, Last, Invert, Play:
 *   First  — measure positions before the DOM updates (kept from last render)
 *   Last   — measure after
 *   Invert — transform each row back to its old position, with no transition
 *   Play   — release the transform on the next frame and let it animate
 *
 * Transform-only, so it stays on the compositor. Every child needs a stable
 * `key`, which is what identifies a row across reorders.
 */
export default function FlipList({ children, className = '', style = {} }) {
  const effects = useSettingsStore((s) => s.effects);
  const container = useRef(null);
  const positions = useRef(new Map());

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const animate = effects && !reduced;

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;

    const rows = Array.from(node.children);
    const previous = positions.current;
    const next = new Map();

    for (const row of rows) {
      const key = row.dataset.flipKey;
      if (!key) continue;
      const top = row.offsetTop;
      next.set(key, top);

      if (!animate) continue;

      const before = previous.get(key);
      if (before === undefined || before === top) continue;

      const delta = before - top;
      // Invert: jump the row back to where it was, without a transition...
      row.style.transition = 'none';
      row.style.transform = `translateY(${delta}px)`;

      // ...then play: next frame, clear it and let the transition run.
      requestAnimationFrame(() => {
        row.style.transition = 'transform var(--dur-flip) var(--ease-out)';
        row.style.transform = '';
      });
    }

    positions.current = next;
  });

  return (
    <div ref={container} className={className} style={{ position: 'relative', ...style }}>
      {Children.map(children, (child) =>
        child ? cloneElement(child, { 'data-flip-key': child.key ?? undefined }) : child
      )}
    </div>
  );
}
