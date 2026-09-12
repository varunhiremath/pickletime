import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Check, RotateCcw, Lock, ChevronRight, Layers } from 'lucide-react';
import Chip from '../ui/Chip.jsx';
import ScoreInput from '../score/ScoreInput.jsx';
import SetEntry from '../score/SetEntry.jsx';
import { Avatar } from './PlayerChip.jsx';
import {
  BEST_OF, isMultiSet, displayScore, setsLine, setsWon, winnerOf,
  normaliseSets, draftFrom, emptyDraft,
} from '../../utils/sets.js';

/**
 * One fixture in the Matches list.
 *
 * The winning side gets an optic rail and the losing side desaturates — the
 * result is legible at a glance without a trophy icon competing with the score.
 *
 * In `editable` mode the scores become inputs and the card saves in place. That
 * is deliberately the primary way to score: games do not finish in the order
 * they were scheduled, and somebody usually enters several at once from a scrap
 * of paper. Making them hunt for each fixture on a separate screen first was the
 * friction worth removing. The card is not a link in that mode — a text input
 * inside a link is a bad time on a phone — so a chevron opens the full
 * scoreboard instead.
 */
export default function MatchCard({
  game,
  members,
  courts = 1,
  highlight = false,
  to,
  editable = false,
  onSubmit,
  teamA: teamAOverride,
  teamB: teamBOverride,
  label,
  locked = false,
  lockedNote,
}) {
  const memberById = (id) => members.find((m) => m.id === id);
  const played = game.played && game.scoreA != null && game.scoreB != null;
  // Not a score comparison: a best-of-three is won two sets to one by a side
  // that can have scored fewer points overall. See utils/sets.js.
  const aWon = played && winnerOf(game) === 'a';
  const bWon = played && winnerOf(game) === 'b';
  // What goes in the big numerals — sets won for a set match, points otherwise.
  const shown = displayScore(game);

  // A knockout fixture is stored with empty sides until it is played, so the
  // bracket passes in who it worked out should be playing. See utils/bracket.js.
  const teamA = teamAOverride ?? game.teamA;
  const teamB = teamBOverride ?? game.teamB;

  const [draft, setDraft] = useState({ a: game.scoreA, b: game.scoreB });
  const [busy, setBusy] = useState(false);
  // Whether this fixture is being entered as sets. Seeded from what is stored,
  // so a saved best-of-three re-opens as one, and switchable either way — which
  // match is best-of-three is decided on the day, not when the session is made.
  const [sets, setSets] = useState(() => isMultiSet(game));
  const [setDraftRows, setSetDraftRows] = useState(() => draftFrom(game));

  // Follow the row, including when somebody else's score lands here live.
  useEffect(() => {
    setDraft({ a: game.scoreA, b: game.scoreB });
    setSets(isMultiSet(game));
    setSetDraftRows(draftFrom(game));
  }, [game.id, game.scoreA, game.scoreB, game.setsA, game.setsB]);

  const setCheck = normaliseSets(setDraftRows);
  const setsDirty =
    setCheck.ok &&
    (setCheck.setsA.join() !== (game.setsA ?? []).join() ||
      setCheck.setsB.join() !== (game.setsB ?? []).join());

  const dirty = draft.a !== game.scoreA || draft.b !== game.scoreB;
  const canSave = editable && !locked && (
    sets ? setsDirty || (setCheck.ok && !isMultiSet(game))
         : draft.a != null && draft.b != null && dirty
  );

  // While typing, the highlight follows what is on screen rather than what was
  // last saved — otherwise correcting a result leaves the rail on the old winner.
  const live = sets
    ? setsWon({ setsA: setCheck.setsA ?? [], setsB: setCheck.setsB ?? [] })
    : { a: draft.a, b: draft.b };
  // A lead is not a win. One set up shows no winner's rail, the same way a
  // half-finished match is not counted in the table.
  const bothTyped = sets
    ? Boolean(setCheck.decided)
    : live.a != null && live.b != null;
  const aLeads = editable && bothTyped ? live.a > live.b : aWon;
  const bLeads = editable && bothTyped ? live.b > live.a : bWon;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (sets) {
        // The totals are recomputed from the sets by the backend, so what is
        // passed here for a/b is ignored — see supabase/functions.sql.
        await onSubmit?.(null, null, {
          teamA, teamB, setsA: setCheck.setsA, setsB: setCheck.setsB,
        });
      } else {
        await onSubmit?.(draft.a, draft.b, { teamA, teamB });
      }
    } finally {
      setBusy(false);
    }
  };

  /** Switch this fixture between one game and best-of-three. */
  const toggleSets = () => {
    const next = !sets;
    setSets(next);
    if (next) setSetDraftRows(draftFrom(game));
    else setSetDraftRows(emptyDraft());
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit?.(null, null, { teamA, teamB });
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div
      className={`flex flex-col gap-3 ${highlight ? 'a-flash' : ''}`}
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        border: `1px solid ${game.pending ? 'var(--court)' : 'var(--line)'}`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center gap-2">
        <Chip tone={label ? 'gold' : 'neutral'}>{label ?? `Game ${game.ordinal}`}</Chip>
        {courts > 1 && <Chip tone="court">Court {game.court}</Chip>}
        {/* A set match with sets on it but no winner is neither played nor
            untouched — saying "not played" over a 1–0 scoreline would read as
            though the entry had been lost. */}
        {!played && !locked && (
          isMultiSet(game)
            ? <Chip tone="court">In progress</Chip>
            : <Chip tone="neutral">Not played</Chip>
        )}
        {game.pending && (
          <Chip tone="court">
            <Clock size={10} /> Queued
          </Chip>
        )}
        {/* Read-only: a set match says so wherever it is shown. */}
        {!editable && isMultiSet(game) && <Chip tone="court">Best of {BEST_OF}</Chip>}

        {editable && !locked && (
          <button
            onClick={toggleSets}
            aria-pressed={sets}
            className="ml-auto flex shrink-0 items-center gap-1 font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{
              padding: '4px 9px',
              borderRadius: 'var(--radius-full)',
              background: sets ? 'var(--optic)' : 'var(--bg-raised)',
              color: sets ? 'var(--text-on-accent)' : 'var(--text-lo)',
            }}
          >
            <Layers size={12} /> Best of {BEST_OF}
          </button>
        )}

        {editable && to && (
          <Link
            to={to}
            aria-label={`Open game ${game.ordinal} on the scoreboard`}
            className={`${editable && !locked ? '' : 'ml-auto '}flex h-7 w-7 shrink-0 items-center justify-center rounded-full`}
            style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
          >
            <ChevronRight size={15} />
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Side
          ids={teamA}
          members={members}
          score={sets ? live.a : shown.a}
          won={aLeads}
          lost={bLeads}
          editable={editable && !locked && !sets}
          value={draft.a}
          onChange={(v) => setDraft((d) => ({ ...d, a: v }))}
          onEnter={save}
          label={`First score for ${label ?? `game ${game.ordinal}`}`}
          played={played || (sets && bothTyped)}
        />
        <span className="font-sans text-xs font-bold" style={{ color: 'var(--text-lo)' }}>
          vs
        </span>
        <Side
          ids={teamB}
          members={members}
          score={sets ? live.b : shown.b}
          won={bLeads}
          lost={aLeads}
          editable={editable && !locked && !sets}
          value={draft.b}
          onChange={(v) => setDraft((d) => ({ ...d, b: v }))}
          onEnter={save}
          label={`Second score for ${label ?? `game ${game.ordinal}`}`}
          played={played || (sets && bothTyped)}
        />
      </div>

      {/* The sets themselves. Editable while entering, and a plain line
          underneath the result once it is saved. */}
      {sets && editable && !locked && (
        <SetEntry
          draft={setDraftRows}
          onChange={setSetDraftRows}
          disabled={busy}
          label={label ?? `game ${game.ordinal}`}
        />
      )}

      {isMultiSet(game) && !(sets && editable && !locked) && (
        <p className="num font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          {setsLine(game)}
        </p>
      )}

      {locked && lockedNote && (
        <p
          className="flex items-center gap-1.5 font-sans text-xs"
          style={{ color: 'var(--text-lo)' }}
        >
          <Lock size={12} /> {lockedNote}
        </p>
      )}

      {game.byes?.length > 0 && (
        <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
          Sitting out: {game.byes.map((id) => memberById(id)?.name ?? '—').join(', ')}
        </p>
      )}

      {/* The save row only exists once there is something to do, so a list of
          twelve unplayed fixtures isn't twelve buttons of visual noise. */}
      {editable && !locked && (canSave || played) && (
        <div className="flex gap-2">
          {played && (
            <button
              onClick={clear}
              disabled={busy}
              aria-label={`Clear the score for game ${game.ordinal}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
              style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
            >
              <RotateCcw size={15} />
            </button>
          )}
          {canSave && (
            <button
              onClick={save}
              disabled={busy}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 font-sans text-[13px] font-bold disabled:opacity-40"
              style={{
                borderRadius: 'var(--radius-full)',
                background: 'var(--optic)',
                color: 'var(--text-on-accent)',
              }}
            >
              <Check size={15} />
              {played ? 'Update' : 'Save'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // In editable mode the card holds inputs, so it must not also be a link.
  return to && !editable ? (
    <Link to={to} className="block active:scale-[0.99]" style={{ transition: 'transform var(--dur-micro)' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * One side of a fixture: the players, and their score.
 *
 * Defined at module scope, deliberately. It used to live inside MatchCard, and
 * once it contained an <input> that became a real bug: a function declared in
 * the render body is a NEW component type on every render, so React unmounted
 * and remounted the subtree on each keystroke — the input lost focus after a
 * single digit and a two-digit score could not be typed at all.
 */
function Side({
  ids, members, score, won, lost, editable, value, onChange, onEnter, label, played,
}) {
  const memberById = (id) => members.find((m) => m.id === id);
  // Two names and a score box have to share half a phone's width. At the singles
  // sizes "Srinath" and "Sudheer" elide, which is worse than a slightly smaller
  // name — a partner you cannot read is not a fixture you can act on.
  const doubles = ids.length > 1;

  return (
    <div
      className={`flex min-w-0 flex-1 items-center ${doubles ? 'gap-1.5' : 'gap-2'}`}
      style={{ opacity: lost ? 0.55 : 1 }}
    >
      {won && (
        <span
          className="a-rail shrink-0"
          style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--optic)' }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {ids.length === 0 ? (
          <span className="font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
            —
          </span>
        ) : (
          ids.map((id) => {
            const m = memberById(id);
            return (
              <span key={id} className={`flex items-center ${doubles ? 'gap-1' : 'gap-1.5'}`}>
                <Avatar member={m} size={doubles ? 18 : 20} />
                <span
                  className={`truncate font-sans ${doubles ? 'text-[13px]' : 'text-sm'}`}
                  style={{ fontWeight: won ? 700 : 500, color: 'var(--text-hi)' }}
                >
                  {m?.name ?? '—'}
                </span>
              </span>
            );
          })
        )}
      </div>

      {editable ? (
        <span className={`shrink-0 ${doubles ? 'w-[50px]' : 'w-[58px]'}`}>
          <ScoreInput size="sm" value={value} onChange={onChange} onEnter={onEnter} label={label} won={won} />
        </span>
      ) : (
        <span
          className="font-display num shrink-0 tabular-nums"
          style={{
            fontSize: doubles ? 25 : 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: played ? 'var(--text-hi)' : 'var(--text-lo)',
          }}
        >
          {score ?? '–'}
        </span>
      )}
    </div>
  );
}
