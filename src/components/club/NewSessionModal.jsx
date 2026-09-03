import { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';
import { FORMATS, gamesPerPlayer } from '../../utils/schedule.js';
import useSettingsStore from '../../store/settingsStore.js';

const FORMAT_OPTIONS = [
  {
    value: FORMATS.SINGLES,
    title: 'Singles',
    desc: 'Round robin — everyone plays everyone once.',
    min: 2,
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
  const [selected, setSelected] = useState(() => new Set(members.map((m) => m.id)));
  const [numGames, setNumGames] = useState(settings.lastNumGames);
  const [courts, setCourts] = useState(settings.lastCourts);
  const [pointsTo, setPointsTo] = useState(settings.lastPointsTo);
  const [busy, setBusy] = useState(false);

  // Re-seed the selection every time the sheet opens. This component stays
  // mounted while closed, so a useState initialiser would capture the roster as
  // it was on first render — anyone added afterwards would silently be left out
  // of the default selection.
  useEffect(() => {
    if (open) setSelected(new Set(members.map((m) => m.id)));
  }, [open, members]);

  const playerIds = useMemo(
    () => members.filter((m) => selected.has(m.id)).map((m) => m.id),
    [members, selected]
  );

  const option = FORMAT_OPTIONS.find((o) => o.value === format);
  const enough = playerIds.length >= option.min;
  const maxCourts = Math.max(1, Math.floor(playerIds.length / (format === FORMATS.SINGLES ? 2 : 4)));

  const perPlayer = enough
    ? gamesPerPlayer({ format, playerCount: playerIds.length, numGames })
    : 0;

  const toggle = (id) => {
    setSelected((prev) => {
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
            ? `Generate ${format === FORMATS.SINGLES ? 'round robin' : `${numGames} games`}`
            : `Pick at least ${option.min} players`}
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
              const active = selected.has(m.id);
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

        {format === FORMATS.SINGLES && enough && (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            A full round robin is{' '}
            <strong style={{ color: 'var(--text-hi)' }}>
              {(playerIds.length * (playerIds.length - 1)) / 2} games
            </strong>{' '}
            — {playerIds.length - 1} each.
          </p>
        )}
      </div>
    </Modal>
  );
}
