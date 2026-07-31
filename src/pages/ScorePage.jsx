import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Maximize2, RotateCcw } from 'lucide-react';
import TopBar from '../components/layout/TopBar.jsx';
import Chip from '../components/ui/Chip.jsx';
import Button from '../components/ui/Button.jsx';
import ScorePad from '../components/score/ScorePad.jsx';
import Particles from '../components/fx/Particles.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { toast } from '../store/uiStore.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playChime, playError } from '../utils/sound.js';

export default function ScorePage() {
  const { session, games, members } = useSessionStore();
  const haptic = useHaptics();

  // Start on the first unplayed game — that's almost always the one being played.
  const firstUnplayed = useMemo(() => {
    const idx = games.findIndex((g) => !g.played);
    return idx === -1 ? Math.max(0, games.length - 1) : idx;
  }, [games]);

  const [index, setIndex] = useState(firstUnplayed);
  const [draft, setDraft] = useState({ a: null, b: null });
  const [burst, setBurst] = useState(false);

  const game = games[index];

  // Reset the draft whenever the visible game changes — including when a
  // realtime update lands on the game currently open.
  useEffect(() => {
    setIndex((i) => (i >= games.length ? Math.max(0, games.length - 1) : i));
  }, [games.length]);

  useEffect(() => {
    if (!game) return;
    setDraft({ a: game.scoreA, b: game.scoreB });
  }, [game?.id, game?.scoreA, game?.scoreB]);

  if (!session || games.length === 0) {
    return (
      <>
        <TopBar title="Score" />
        <EmptyState
          title="No games to score"
          message="Create a session from the Club tab and the schedule will show up here."
        >
          <Link to="/club">
            <Button variant="primary">Go to Club</Button>
          </Link>
        </EmptyState>
      </>
    );
  }

  const a = draft.a ?? 0;
  const b = draft.b ?? 0;
  const dirty = draft.a !== game.scoreA || draft.b !== game.scoreB;
  const canSubmit = draft.a != null && draft.b != null && dirty;

  const submit = async () => {
    try {
      await getBackend().submitScore(game.id, a, b);
      haptic('win');
      playChime();
      setBurst(true);
      setTimeout(() => setBurst(false), 1300);
      toast('Score saved.', { type: 'success' });
      // Advance to the next unplayed game so scoring a run of games flows.
      const next = games.findIndex((g, i) => i > index && !g.played);
      if (next !== -1) setIndex(next);
    } catch (err) {
      playError();
      toast(err.message ?? 'Could not save that score.', { type: 'error' });
    }
  };

  const clear = async () => {
    try {
      await getBackend().submitScore(game.id, null, null);
      toast('Score cleared.', { type: 'info' });
    } catch (err) {
      toast(err.message ?? 'Could not clear that score.', { type: 'error' });
    }
  };

  return (
    <>
      {burst && <Particles />}

      <TopBar
        title="Score"
        subtitle={session.name}
        action={
          <Link
            to="/score/courtside"
            aria-label="Courtside mode"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
          >
            <Maximize2 size={16} />
          </Link>
        }
      />

      <div className="px-4">
        {/* Game switcher */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Previous game"
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-hi)' }}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex flex-col items-center gap-1">
            <span className="font-display num text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
              Game {game.ordinal} of {games.length}
            </span>
            <div className="flex items-center gap-1.5">
              <Chip>Round {game.round}</Chip>
              {session.courts > 1 && <Chip tone="court">Court {game.court}</Chip>}
              {game.played && <Chip tone="optic">Final</Chip>}
            </div>
          </div>

          <button
            onClick={() => setIndex((i) => Math.min(games.length - 1, i + 1))}
            disabled={index === games.length - 1}
            aria-label="Next game"
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-hi)' }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* The scoreboard */}
        <div className="flex items-stretch gap-3">
          <ScorePad
            side="A"
            ids={game.teamA}
            members={members}
            score={draft.a}
            onChange={(v) => setDraft((d) => ({ ...d, a: v }))}
            won={draft.a != null && draft.b != null && a > b}
            pointsTo={session.pointsTo}
          />
          <ScorePad
            side="B"
            ids={game.teamB}
            members={members}
            score={draft.b}
            onChange={(v) => setDraft((d) => ({ ...d, b: v }))}
            won={draft.a != null && draft.b != null && b > a}
            pointsTo={session.pointsTo}
          />
        </div>

        {game.byes?.length > 0 && (
          <p className="mt-3 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            Sitting out: {game.byes.map((id) => members.find((m) => m.id === id)?.name ?? '—').join(', ')}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          {game.played && (
            <Button variant="secondary" onClick={clear} aria-label="Clear score">
              <RotateCcw size={16} />
            </Button>
          )}
          <Button variant="primary" size="lg" full disabled={!canSubmit} onClick={submit}>
            <Check size={18} />
            {game.played ? 'Update score' : 'Save score'}
          </Button>
        </div>

        <p className="mt-3 text-center font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          Anyone can enter or fix a score. Every change is logged.
        </p>
      </div>
    </>
  );
}
