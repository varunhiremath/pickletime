import { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';
import { FORMATS, gamesPerPlayer, canRunPlayoffs } from '../../utils/schedule.js';
import { BRACKET_SIZE } from '../../utils/bracket.js';
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
];

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

export default function NewSessionModal({ open, onClose, members, onCreate }) {
  const settings = useSettingsStore();
  const [name, setName] = useState('');
  // Defaults to today, but a session is usually scheduled ahead — you set up
  // Sunday's tournament on Thursday — so both are editable.
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [format, setFormat] = useState(settings.lastFormat);
  const [picked, setPicked] = useState(() => new Set(members.map((m) => m.id)));
  const [numGames, setNumGames] = useState(settings.lastNumGames);
  const [courts, setCourts] = useState(settings.lastCourts);
  const [pointsTo, setPointsTo] = useState(settings.lastPointsTo);
  const [playoffs, setPlayoffs] = useState(true);
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the selection every time the sheet opens. This component stays
  // mounted while closed, so a useState initialiser would capture the roster as
  // it was on first render — anyone added afterwards would silently be left out
  // of the default selection.
  useEffect(() => {
    if (open) setPicked(new Set(members.map((m) => m.id)));
  }, [open, members]);

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
  const maxCourts = Math.max(1, Math.floor(playerIds.length / (format === FORMATS.SINGLES ? 2 : 4)));
  const teamCount = Math.floor(playerIds.length / 2);

  const perPlayer = enough
    ? gamesPerPlayer({ format, playerCount: playerIds.length, numGames })
    : 0;

  const playoffsAvailable = canRunPlayoffs({ format, playerCount: playerIds.length });
  const wantsPlayoffs = playoffs && playoffsAvailable;

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
        name: name.trim() || 'Session',
        date,
        startTime,
        format,
        playerIds,
        numGames,
        courts: Math.min(courts, maxCourts),
        pointsTo,
        playoffs: wantsPlayoffs,
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Saturday morning"
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
            {members.map((m) => {
              const active = picked.has(m.id);
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
                </button>
              );
            })}
          </div>
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

        {/* Playoffs. Singles only: the four seeds are individuals, so a
            semifinal between them is a singles match, and there is no fair way
            to pair them up in a doubles session. */}
        {(format === FORMATS.SINGLES || format === FORMATS.PAIRS) && (
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
                Finish with playoffs
              </span>
              <span className="block font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
                {playoffsAvailable
                  ? `Top four ${format === FORMATS.PAIRS ? 'teams' : 'seeds'} into semifinals, then a third-place game and a final.`
                  : format === FORMATS.PAIRS
                    ? `Needs at least ${BRACKET_SIZE * 2} players — four teams.`
                    : `Needs at least ${BRACKET_SIZE} players.`}
              </span>
            </span>
          </button>
        )}

        {format === FORMATS.SINGLES && enough && (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            A full round robin is{' '}
            <strong style={{ color: 'var(--text-hi)' }}>
              {(playerIds.length * (playerIds.length - 1)) / 2} games
            </strong>{' '}
            — {playerIds.length - 1} each
            {wantsPlayoffs ? ', plus four playoff games' : ''}.
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
                {wantsPlayoffs ? ' plus four playoff games' : ''}. Partners are fixed all session —
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
