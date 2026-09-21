import { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';
import {
  FORMATS, gamesPerPlayer, canRunPlayoffs, playoffShape,
  playoffShapesFor, resolvePlayoffShape, POOL_COUNT,
} from '../../utils/schedule.js';
import { MIN_POOL_FIELD, QUALIFY_PER_POOL, poolName } from '../../utils/pools.js';
import { defaultSessionName } from '../../utils/sessionName.js';
import { splitRoster } from '../../utils/roster.js';
import { BRACKET_SIZE, SHAPES, slotsForShape } from '../../utils/bracket.js';

import ShapeChoice, { SHAPE_COPY } from './ShapeChoice.jsx';
import TeamPicker from './TeamPicker.jsx';
import { drawAll, pruneToField, isComplete } from '../../utils/teamDraft.js';
import { randomSeed } from '../../utils/rng.js';
import useSettingsStore from '../../store/settingsStore.js';

const FORMAT_OPTIONS = [
  {
    value: FORMATS.SINGLES,
    title: 'Singles',
    desc: 'Round robin — everyone plays everyone once.',
    min: 2,
  },
  {
    value: FORMATS.PAIRS,
    title: 'Doubles · Fixed pairs',
    desc: 'Teams stay together all session — draw them or enter them yourself.',
    min: 4,
    evenOnly: true,
  },
  {
    value: FORMATS.AMERICANO,
    title: 'Doubles · Americano',
    desc: 'Partners and opponents rotate every game.',
    min: 4,
  },
  {
    value: FORMATS.POOLS,
    title: 'Singles · Two pools',
    desc: 'Split at random into two pools, top two from each into the semifinals.',
    min: MIN_POOL_FIELD,
  },
];

/** Today where the phone is, as "2026-09-12". See the `date` state below. */
function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Stepper({ label, value, onChange, min = 1, max = 50, hint }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="font-sans text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
          {label}
        </span>
        {hint && (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            {hint}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="h-9 w-9 rounded-full font-display text-lg font-bold disabled:opacity-30"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-hi)' }}
        >
          −
        </button>
        <span
          className="num w-8 text-center font-display text-lg font-extrabold"
          style={{ color: 'var(--text-hi)' }}
        >
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="h-9 w-9 rounded-full font-display text-lg font-bold disabled:opacity-30"
          style={{ background: 'var(--bg-raised)', color: 'var(--text-hi)' }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function NewSessionModal({ open, onClose, members, sessions = [], onCreate }) {
  const settings = useSettingsStore();
  // Empty means "use the automatic name". The field is not left blank though —
  // it shows the automatic name so you can see what you are getting and edit it
  // if you want something else.
  const [name, setName] = useState('');
  // Defaults to today, but a session is usually scheduled ahead — you set up
  // Sunday's tournament on Thursday — so both are editable.
  //
  // Local parts, not toISOString(): that is UTC, so anybody west of Greenwich
  // setting up an evening session would be handed tomorrow's date. Invisible
  // while the field said "Saturday morning"; obvious now the name says the day.
  const [date, setDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('');
  const [format, setFormat] = useState(settings.lastFormat);
  // Only the people still playing. Somebody who moved away should not have to
  // be unticked every week. See utils/roster.js.
  const [picked, setPicked] = useState(() => new Set(splitRoster(members).active.map((m) => m.id)));
  // ...but a visitor back for one night can be added without an admin having
  // to reactivate and then deactivate them again around the session.
  const [showStepped, setShowStepped] = useState(false);
  const [numGames, setNumGames] = useState(settings.lastNumGames);
  const [courts, setCourts] = useState(settings.lastCourts);
  const [pointsTo, setPointsTo] = useState(settings.lastPointsTo);
  const [playoffs, setPlayoffs] = useState(true);
  // The chosen finish. Kept across a format switch — resolvePlayoffShape falls
  // back when the new format cannot run it, so nothing has to be reset here.
  const [shape, setShape] = useState(SHAPES.KNOCKOUT);
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the selection every time the sheet opens. This component stays
  // mounted while closed, so a useState initialiser would capture the roster as
  // it was on first render — anyone added afterwards would silently be left out
  // of the default selection.
  useEffect(() => {
    if (open) setPicked(new Set(splitRoster(members).active.map((m) => m.id)));
  }, [open, members]);

  // Forget the "show everyone" toggle between openings, so the sheet always
  // starts from the people who are actually playing.
  useEffect(() => {
    if (open) setShowStepped(false);
  }, [open]);

  // Forget a typed name when the sheet reopens: last week's "grudge match"
  // should not silently become this week's session name.
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  /**
   * What the session is called if nobody types anything.
   *
   * Follows the date and format as you change them — the whole point is that
   * you never have to think about it — but a name you have typed yourself wins
   * and is never overwritten.
   */
  const autoName = useMemo(
    () => defaultSessionName({
      date,
      format,
      startTime,
      taken: sessions.map((s) => s.name),
    }),
    [date, format, startTime, sessions]
  );

  const roster = useMemo(() => splitRoster(members), [members]);
  // Somebody stepped back stays on screen once they have been ticked, so an
  // added visitor cannot vanish behind a toggle they are already part of.
  const offered = useMemo(
    () => (showStepped
      ? members
      : members.filter((m) => m.active !== false || picked.has(m.id))),
    [members, showStepped, picked]
  );

  const playerIds = useMemo(
    () => members.filter((m) => picked.has(m.id)).map((m) => m.id),
    [members, picked]
  );

  // The picker sits next to the "who's playing" chips, so the field moves under
  // it constantly. Dropping a player has to take their team with them, or the
  // draft would fail validation with nothing on screen explaining why.
  useEffect(() => {
    setTeams((prev) => {
      const pruned = pruneToField({ playerIds, teams: prev });
      return pruned.length === prev.length ? prev : pruned;
    });
    setSelected((sel) => (sel && playerIds.includes(sel) ? sel : null));
  }, [playerIds]);

  // Open on a random draw: the social case is then zero taps, and the
  // competition case is "break the ones that are wrong and re-pair them", which
  // is less work than entering eight names from scratch.
  //
  // Deliberately keyed on open/format only. Re-drawing whenever the field
  // changed would throw away hand-entered pairs the moment somebody arrives.
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setTeams(
      format === FORMATS.PAIRS && playerIds.length >= 4 && playerIds.length % 2 === 0
        ? drawAll({ playerIds, seed: randomSeed() })
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, format]);

  const option = FORMAT_OPTIONS.find((o) => o.value === format) ?? FORMAT_OPTIONS[0];
  // Fixed pairs needs an even field — a leftover player would have nobody to
  // partner, and quietly dropping them from their own session is worse than
  // saying so before the schedule is built.
  const oddField = Boolean(option.evenOnly) && playerIds.length % 2 === 1;
  const teamsReady = format !== FORMATS.PAIRS || isComplete(playerIds, teams);
  const enough = playerIds.length >= option.min && !oddField && teamsReady;
  const singlesLike = format === FORMATS.SINGLES || format === FORMATS.POOLS;
  const maxCourts = Math.max(1, Math.floor(playerIds.length / (singlesLike ? 2 : 4)));
  const teamCount = Math.floor(playerIds.length / 2);

  const perPlayer = enough
    ? gamesPerPlayer({ format, playerCount: playerIds.length, numGames })
    : 0;

  const playoffsAvailable = canRunPlayoffs({ format, playerCount: playerIds.length });
  const wantsPlayoffs = playoffs && playoffsAvailable;
  const shapeChoices = playoffShapesFor(format);
  // Counted from the shape's own slot table rather than hardcoded: the Page
  // system is five fixtures, the bracket four, the Americano finish one.
  const playoffGames = slotsForShape(resolvePlayoffShape(format, shape) ?? undefined).length;

  // Two round robins, one per pool. Counted rather than approximated, because
  // an odd field splits 5/4 and "n(n-1)/2 of half the field" would be wrong.
  const poolGameCount = (() => {
    const big = Math.ceil(playerIds.length / POOL_COUNT);
    const small = Math.floor(playerIds.length / POOL_COUNT);
    return (big * (big - 1)) / 2 + (small * (small - 1)) / 2;
  })();

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!enough || busy) return;
    setBusy(true);
    try {
      settings.set({
        lastFormat: format,
        lastNumGames: numGames,
        lastCourts: Math.min(courts, maxCourts),
        lastPointsTo: pointsTo,
      });
      await onCreate({
        name: name.trim() || autoName,
        date,
        startTime,
        format,
        playerIds,
        numGames,
        courts: Math.min(courts, maxCourts),
        pointsTo,
        // The shape, not just a boolean: generateSchedule falls back to the
        // format's default if this one does not apply to it.
        playoffs: wantsPlayoffs && (resolvePlayoffShape(format, shape) ?? true),
        teams: format === FORMATS.PAIRS ? teams : undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New session"
      footer={
        <Button variant="primary" size="lg" full disabled={!enough || busy} onClick={submit}>
          {enough
            ? `Generate ${
                format === FORMATS.AMERICANO ? `${numGames} games` : 'round robin'
              }`
            : oddField
              ? 'Pick an even number of players'
              : playerIds.length < option.min
                ? `Pick at least ${option.min} players`
                : 'Finish pairing the teams'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <label
            className="mb-1.5 block font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Name
          </label>
          <input
            value={name || autoName}
            onChange={(e) => setName(e.target.value)}
            placeholder={autoName}
            className="w-full font-sans text-base outline-none"
            style={{
              padding: '11px 13px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-raised)',
              border: '1px solid var(--line)',
              color: 'var(--text-hi)',
            }}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label
              htmlFor="session-date"
              className="mb-1.5 block font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Date
            </label>
            <input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full font-sans text-base outline-none"
              style={{
                padding: '11px 13px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--line)',
                color: 'var(--text-hi)',
              }}
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="session-time"
              className="mb-1.5 block font-sans text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-lo)' }}
            >
              Start time
            </label>
            <input
              id="session-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full font-sans text-base outline-none"
              style={{
                padding: '11px 13px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--line)',
                color: 'var(--text-hi)',
              }}
            />
          </div>
        </div>

        <div>
          <span
            className="mb-1.5 block font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Format
          </span>
          <div className="flex flex-col gap-2">
            {FORMAT_OPTIONS.map((o) => {
              const active = format === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => setFormat(o.value)}
                  className="flex flex-col items-start gap-0.5 text-left"
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    background: active ? 'color-mix(in srgb, var(--optic) 12%, transparent)' : 'var(--bg-raised)',
                    border: `1.5px solid ${active ? 'var(--optic)' : 'transparent'}`,
                  }}
                >
                  <span className="font-sans text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
                    {o.title}
                  </span>
                  <span className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                    {o.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span
            className="mb-1.5 block font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            Who's playing ({playerIds.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {offered.map((m) => {
              const active = picked.has(m.id);
              const stepped = m.active === false;
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: '5px 11px 5px 5px',
                    borderRadius: 'var(--radius-full)',
                    background: active ? 'var(--bg-raised)' : 'transparent',
                    border: `1.5px solid ${active ? 'var(--optic)' : 'var(--line)'}`,
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  <Avatar member={m} size={22} />
                  <span className="font-sans text-[13px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                    {m.name}
                  </span>
                  {stepped && (
                    <span
                      className="font-sans text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-lo)' }}
                    >
                      back
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* The visitor case. Somebody who moved away and is in town for one
              weekend can be added here without an admin having to reactivate
              them and remember to step them back afterwards. */}
          {roster.inactive.length > 0 && !showStepped && (
            <button
              onClick={() => setShowStepped(true)}
              className="mt-2 font-sans text-xs font-semibold"
              style={{ color: 'var(--optic-ink)' }}
            >
              + {roster.inactive.length} not playing at the moment
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {format === FORMATS.AMERICANO && (
            <Stepper
              label="Games"
              value={numGames}
              onChange={setNumGames}
              min={1}
              max={50}
              hint={enough ? `About ${perPlayer.toFixed(1)} each` : undefined}
            />
          )}
          <Stepper
            label="Courts"
            value={Math.min(courts, maxCourts)}
            onChange={setCourts}
            min={1}
            max={maxCourts}
            hint={maxCourts === 1 ? 'One game at a time with this many players' : 'Games run at the same time'}
          />
          <Stepper label="Points to" value={pointsTo} onChange={setPointsTo} min={1} max={31} />
        </div>

        {format === FORMATS.PAIRS && playerIds.length >= 4 && !oddField && (
          <TeamPicker
            playerIds={playerIds}
            members={members}
            teams={teams}
            selected={selected}
            onChange={({ teams: next, selected: sel }) => {
              setTeams(next);
              setSelected(sel);
            }}
          />
        )}

        {/* How the session ends. Singles and fixed pairs seed a four-entrant
            bracket; Americano ranks individuals, so its top four pair up for one
            deciding game instead. See utils/schedule.js playoffShape(). */}
        {playoffShape(format) && (
          <button
            onClick={() => playoffsAvailable && setPlayoffs((p) => !p)}
            disabled={!playoffsAvailable}
            aria-pressed={wantsPlayoffs}
            className="flex items-center gap-3 text-left disabled:opacity-50"
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              background: wantsPlayoffs
                ? 'color-mix(in srgb, var(--gold) 14%, transparent)'
                : 'var(--bg-raised)',
              border: `1.5px solid ${wantsPlayoffs ? 'var(--gold)' : 'transparent'}`,
            }}
          >
            <span
              className="flex h-6 w-11 shrink-0 items-center p-0.5"
              style={{
                borderRadius: 'var(--radius-full)',
                background: wantsPlayoffs ? 'var(--gold)' : 'var(--line)',
                justifyContent: wantsPlayoffs ? 'flex-end' : 'flex-start',
                transition: 'background var(--dur-standard)',
              }}
            >
              <span
                className="h-5 w-5 rounded-full"
                style={{ background: 'var(--bg-surface)' }}
              />
            </span>
            <span className="min-w-0">
              <span className="block font-sans text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
                {format === FORMATS.AMERICANO ? 'Finish with a final' : 'Finish with playoffs'}
              </span>
              <span className="block font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                {!playoffsAvailable
                  ? format === FORMATS.PAIRS
                    ? `Needs at least ${BRACKET_SIZE * 2} players — four teams.`
                    : format === FORMATS.POOLS
                      ? `Needs at least ${MIN_POOL_FIELD} players — four a side.`
                      : `Needs at least ${BRACKET_SIZE} players.`
                  : format === FORMATS.AMERICANO
                    ? 'Top four pair up for one deciding game — seeds 1 & 4 against 2 & 3.'
                    : format === FORMATS.POOLS
                      ? `The top ${QUALIFY_PER_POOL} from each pool cross over into the semifinals — ${poolName(0)}1 v ${poolName(1)}2 and ${poolName(1)}1 v ${poolName(0)}2.`
                      : `The top four ${format === FORMATS.PAIRS ? 'teams' : 'seeds'} play it out — pick how below.`}
              </span>
            </span>
          </button>
        )}

        {/* Which finish. Only when there is a choice to make: Americano has one
            shape, so offering it a picker of one would be noise. */}
        {wantsPlayoffs && shapeChoices.length > 1 && (
          <div className="flex flex-col gap-1.5">
            {shapeChoices.map((s) => (
              <ShapeChoice
                key={s}
                title={SHAPE_COPY[s].title}
                blurb={`${SHAPE_COPY[s].blurb(format)} · ${slotsForShape(s).length} games`}
                active={shape === s}
                onClick={() => setShape(s)}
              />
            ))}
          </div>
        )}

        {format === FORMATS.SINGLES && enough && (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            A full round robin is{' '}
            <strong style={{ color: 'var(--text-hi)' }}>
              {(playerIds.length * (playerIds.length - 1)) / 2} games
            </strong>{' '}
            — {playerIds.length - 1} each
            {wantsPlayoffs ? `, plus ${playoffGames} playoff games` : ''}.
          </p>
        )}

        {format === FORMATS.POOLS && enough && (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            Two pools of{' '}
            <strong style={{ color: 'var(--text-hi)' }}>
              {Math.ceil(playerIds.length / POOL_COUNT)}
              {playerIds.length % POOL_COUNT === 0
                ? ''
                : ` and ${Math.floor(playerIds.length / POOL_COUNT)}`}
            </strong>{' '}
            playing{' '}
            <strong style={{ color: 'var(--text-hi)' }}>{poolGameCount} games</strong>
            {wantsPlayoffs ? ` plus ${playoffGames} playoff games` : ''} — against{' '}
            {(playerIds.length * (playerIds.length - 1)) / 2} for one big round robin. The pools
            are drawn at random when you generate, and you can redraw them from the Club tab
            until someone scores.
          </p>
        )}

        {format === FORMATS.PAIRS && (
          <p className="font-sans text-xs" style={{ color: oddField ? 'var(--clay)' : 'var(--text-lo)' }}>
            {oddField ? (
              <>
                {playerIds.length} players can't be paired evenly — add or drop one.
              </>
            ) : enough ? (
              <>
                <strong style={{ color: 'var(--text-hi)' }}>{teamCount} teams</strong> playing{' '}
                {(teamCount * (teamCount - 1)) / 2} games
                {wantsPlayoffs ? ` plus ${playoffGames} playoff games` : ''}. Partners are fixed all session —
                you can change the teams from the Club tab until someone scores.
              </>
            ) : (
              <>Pick at least four players.</>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
