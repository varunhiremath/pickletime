import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Maximize2, RotateCcw, Lock } from 'lucide-react';
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
import {
  resolveBracket, isKnockout, slotLabel, slotShortLabel,
} from '../utils/bracket.js';

export default function ScorePage() {
  const { session, games, members } = useSessionStore();
  const players = useSessionStore((s) => s.sessionPlayers());
  const haptic = useHaptics();
  const [params, setParams] = useSearchParams();

  const bracket = useMemo(() => resolveBracket(players, games), [players, games]);

  // Which game is open.
  //
  // Games are rarely played in the order they were scheduled — somebody
  // finishes court 2 first, or reads six results off a scrap of paper at the
  // end — so any game must be reachable at any time. `?game=<id>` is the
  // addressable form of that: the Matches list links straight to a fixture, and
  // the strip below jumps between them.
  const requestedIndex = games.findIndex((g) => g.id === params.get('game'));
  const firstUnplayed = useMemo(() => {
    const idx = games.findIndex((g) => !g.played);
    return idx === -1 ? Math.max(0, games.length - 1) : idx;
  }, [games]);

  const [fallbackIndex, setFallbackIndex] = useState(firstUnplayed);
  const index = requestedIndex !== -1 ? requestedIndex : Math.min(fallbackIndex, games.length - 1);
  const game = games[index];

  const goTo = (i) => {
    const target = games[Math.max(0, Math.min(games.length - 1, i))];
    if (!target) return;
    setFallbackIndex(i);
    setParams({ game: target.id }, { replace: true });
  };

  const [draft, setDraft] = useState({ a: null, b: null });
  const [burst, setBurst] = useState(false);
  const stripRef = useRef(null);

  useEffect(() => {
    if (!game) return;
    setDraft({ a: game.scoreA, b: game.scoreB });
  }, [game?.id, game?.scoreA, game?.scoreB]);

  // Keep the open game visible in the strip when it changes from underneath —
  // a deep link, or advancing after a save.
  useEffect(() => {
    stripRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [game?.id]);

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

  // A knockout fixture is stored with empty sides until it is played, so the
  // players shown here come from the bracket. See utils/bracket.js.
  const match = isKnockout(game)
    ? bracket.matches.find((m) => m.slot === game.slot)
    : null;
  const teamA = match ? match.teamA : game.teamA;
  const teamB = match ? match.teamB : game.teamB;
  const locked = Boolean(match && !match.ready);

  const a = draft.a ?? 0;
  const b = draft.b ?? 0;
  const dirty = draft.a !== game.scoreA || draft.b !== game.scoreB;
  const canSubmit = draft.a != null && draft.b != null && dirty && !locked;

  const submit = async () => {
    try {
      // For a knockout game the line-up travels with the score: entering it is
      // what turns "seed 1 vs seed 4" into a record of who actually played.
      await getBackend().submitScore(game.id, a, b, match ? { teamA, teamB } : null);
      haptic('win');
      playChime();
      setBurst(true);
      setTimeout(() => setBurst(false), 1300);
      toast('Score saved.', { type: 'success' });
      const next = games.findIndex((g, i) => i > index && !g.played);
      if (next !== -1) goTo(next);
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

      {/* Jump strip: every game in the session, one tap away. Played games are
          filled in, so it doubles as an at-a-glance view of what's left. */}
      <div ref={stripRef} className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto px-4">
        {games.map((g, i) => {
          const current = i === index;
          const short = slotShortLabel(g);
          return (
            <button
              key={g.id}
              data-current={current}
              onClick={() => goTo(i)}
              aria-label={short ? `Go to ${slotLabel(g)}` : `Go to game ${g.ordinal}`}
              aria-current={current ? 'true' : undefined}
              className="num shrink-0 font-display text-[13px] font-bold tabular-nums"
              style={{
                minWidth: short ? undefined : 34,
                padding: short ? '6px 10px' : '6px 0',
                borderRadius: 'var(--radius-full)',
                background: current
                  ? 'var(--optic)'
                  : g.played
                    ? 'var(--bg-raised)'
                    : 'transparent',
                border: `1.5px solid ${current ? 'var(--optic)' : 'var(--line)'}`,
                color: current
                  ? 'var(--text-on-accent)'
                  : g.played
                    ? 'var(--text-hi)'
                    : 'var(--text-lo)',
              }}
            >
              {short ?? g.ordinal}
            </button>
          );
        })}
      </div>

      <div className="px-4">
        {/* Game switcher */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous game"
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-hi)' }}
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex flex-col items-center gap-1">
            <span className="font-display num text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
              {slotLabel(game) ?? `Game ${game.ordinal} of ${games.length}`}
            </span>
            <div className="flex items-center gap-1.5">
              {match ? <Chip tone="gold">{match.source}</Chip> : <Chip>Round {game.round}</Chip>}
              {session.courts > 1 && <Chip tone="court">Court {game.court}</Chip>}
              {game.played && <Chip tone="optic">Final</Chip>}
            </div>
          </div>

          <button
            onClick={() => goTo(index + 1)}
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
            ids={teamA}
            members={members}
            score={draft.a}
            onChange={(v) => setDraft((d) => ({ ...d, a: v }))}
            won={draft.a != null && draft.b != null && a > b}
            pointsTo={session.pointsTo}
          />
          <ScorePad
            side="B"
            ids={teamB}
            members={members}
            score={draft.b}
            onChange={(v) => setDraft((d) => ({ ...d, b: v }))}
            won={draft.a != null && draft.b != null && b > a}
            pointsTo={session.pointsTo}
          />
        </div>

        {locked && (
          <p
            className="mt-3 flex items-center justify-center gap-1.5 text-center font-sans text-xs"
            style={{ color: 'var(--text-lo)' }}
          >
            <Lock size={12} />
            {bracket.rr.complete
              ? `Waiting on the ${match.source.toLowerCase()}.`
              : `${bracket.rr.remaining} round-robin ${
                  bracket.rr.remaining === 1 ? 'game' : 'games'
                } left before this is set.`}
          </p>
        )}

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
          Anyone can enter or fix a score, in any order. Every change is logged.
        </p>
      </div>
    </>
  );
}
