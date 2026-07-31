import { useMemo, useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Minimize2, Check } from 'lucide-react';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playTick, playChime } from '../utils/sound.js';

/**
 * Courtside mode: the whole screen is the scoreboard.
 *
 * No nav chrome, no cards — just two enormous numbers that stay readable from
 * the far side of the court, and tap targets that fill half the screen each so
 * they can be hit without looking. This is the one screen designed to be used
 * while a phone is propped against a bag.
 */
export default function CourtsidePage() {
  const navigate = useNavigate();
  const { session, games, members, loaded } = useSessionStore();
  const haptic = useHaptics();

  const game = useMemo(() => games.find((g) => !g.played) ?? games[games.length - 1], [games]);
  const [draft, setDraft] = useState({ a: 0, b: 0 });

  useEffect(() => {
    if (game) setDraft({ a: game.scoreA ?? 0, b: game.scoreB ?? 0 });
  }, [game?.id, game?.scoreA, game?.scoreB]);

  // Keep the screen awake while a game is being scored — the whole point of
  // propping the phone up is that nobody has to touch it between rallies.
  useEffect(() => {
    let lock = null;
    let released = false;
    navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        if (released) l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {}); // Unsupported or denied — not worth surfacing.
    return () => {
      released = true;
      lock?.release?.().catch(() => {});
    };
  }, []);

  // The store is still loading on a cold deep-link — hold the dark screen rather
  // than flashing a redirect before the data has had a chance to arrive.
  if (!loaded) {
    return <div className="fixed inset-0" style={{ background: 'var(--bg-deep)' }} />;
  }

  // Redirect declaratively. Calling navigate() during render is a side effect in
  // the render phase and misbehaves under StrictMode's double-invoke.
  if (!game) return <Navigate to="/score" replace />;

  const nameOf = (ids) => ids.map((id) => members.find((m) => m.id === id)?.name ?? '—').join(' & ');
  const bump = (side) => {
    haptic('bump');
    playTick();
    setDraft((d) => ({ ...d, [side]: Math.min(99, d[side] + 1) }));
  };
  const drop = (side) => {
    haptic('tap');
    setDraft((d) => ({ ...d, [side]: Math.max(0, d[side] - 1) }));
  };

  const save = async () => {
    await getBackend().submitScore(game.id, draft.a, draft.b);
    haptic('win');
    playChime();
    navigate('/score');
  };

  const Side = ({ side, ids, value, won }) => (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-2"
      style={{
        background: won ? 'color-mix(in srgb, var(--optic) 10%, var(--bg-surface))' : 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: `2px solid ${won ? 'var(--optic)' : 'var(--line)'}`,
      }}
    >
      <button
        onClick={() => bump(side)}
        aria-label={`Add a point for ${nameOf(ids)}`}
        className="flex w-full flex-1 items-center justify-center active:opacity-80"
      >
        <span
          className="font-display num tabular-nums"
          style={{
            fontSize: 'min(34vw, 26vh)',
            lineHeight: 0.85,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: 'var(--text-hi)',
          }}
        >
          {value}
        </span>
      </button>

      <span
        className="max-w-full truncate px-3 font-sans text-sm font-semibold"
        style={{ color: 'var(--text-lo)' }}
      >
        {nameOf(ids)}
      </span>

      <button
        onClick={() => drop(side)}
        aria-label={`Remove a point from ${nameOf(ids)}`}
        className="mb-3 h-9 w-16 rounded-full font-display text-lg font-bold"
        style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
      >
        −
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-2 p-3"
      style={{
        background: 'var(--bg-deep)',
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-1">
        <span className="font-sans text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-lo)' }}>
          Game {game.ordinal} · to {session?.pointsTo ?? 11}
        </span>
        <button
          onClick={() => navigate('/score')}
          aria-label="Exit courtside mode"
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
        >
          <Minimize2 size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <Side side="a" ids={game.teamA} value={draft.a} won={draft.a > draft.b} />
        <Side side="b" ids={game.teamB} value={draft.b} won={draft.b > draft.a} />
      </div>

      <button
        onClick={save}
        className="flex shrink-0 items-center justify-center gap-2 font-sans font-bold active:scale-[0.98]"
        style={{
          minHeight: 54,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--optic)',
          color: 'var(--text-on-accent)',
          transition: 'transform var(--dur-micro)',
        }}
      >
        <Check size={19} /> Save score
      </button>
    </div>
  );
}
