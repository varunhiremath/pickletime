import { Shuffle, X, Users } from 'lucide-react';
import { Avatar, Faces } from '../scoreboard/PlayerChip.jsx';
import {
  unpaired, tapPlayer, breakTeam, fillRemaining, drawAll, draftStatus,
} from '../../utils/teamDraft.js';
import { randomSeed } from '../../utils/rng.js';

/**
 * Entering the teams for a fixed-pairs session.
 *
 * A social morning wants a random draw; a real doubles competition is the other
 * way round — pairs register together and want to be entered as they are. Both
 * live here rather than as two modes, because in practice a session is usually
 * both: three pairs turned up together and the rest get made up on the day.
 *
 * The interaction is one gesture. Tap a player to select them, tap another to
 * pair them; tap anybody already on a team to break it apart. There is no
 * separate delete control to find, and no drag targets to miss on a phone.
 *
 * State lives with the caller, so the same component serves both creating a
 * session and editing one that already exists.
 */
export default function TeamPicker({ playerIds, members, teams, selected, onChange }) {
  const memberById = (id) => members.find((m) => m.id === id);
  const nameOf = (id) => memberById(id)?.name ?? '—';
  const pool = unpaired(playerIds, teams);
  const status = draftStatus({ playerIds, teams });

  const tap = (playerId) => onChange(tapPlayer({ teams, selected, playerId }));
  const set = (next) => onChange({ teams: next, selected: null });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-1.5 font-sans text-[11px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-lo)' }}
        >
          <Users size={13} /> Teams
        </span>
        <div className="flex gap-2">
          {pool.length > 0 && teams.length > 0 && (
            <button
              onClick={() => set(fillRemaining({ playerIds, teams, seed: randomSeed() }))}
              className="font-sans text-[13px] font-semibold"
              style={{ color: 'var(--optic-ink)' }}
            >
              Fill the rest
            </button>
          )}
          <button
            onClick={() => set(drawAll({ playerIds, seed: randomSeed() }))}
            className="flex items-center gap-1 font-sans text-[13px] font-semibold"
            style={{ color: 'var(--optic-ink)' }}
          >
            <Shuffle size={13} /> Draw all
          </button>
        </div>
      </div>

      {/* The teams so far */}
      {teams.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {teams.map((team, i) => (
            <div
              key={team.join('+')}
              className="flex items-center gap-2.5"
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--line)',
              }}
            >
              <span
                className="num flex h-5 w-5 shrink-0 items-center justify-center font-display text-[11px] font-extrabold"
                style={{
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--optic)',
                  color: 'var(--text-on-accent)',
                }}
              >
                {i + 1}
              </span>
              <Faces ids={team} members={members} size={22} />
              <span
                className="min-w-0 flex-1 truncate font-sans text-sm font-semibold"
                style={{ color: 'var(--text-hi)' }}
              >
                {team.map(nameOf).join(' & ')}
              </span>
              <button
                onClick={() => set(breakTeam({ teams, index: i }))}
                aria-label={`Break up ${team.map(nameOf).join(' and ')}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--bg-surface)', color: 'var(--clay)' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Whoever is left */}
      {pool.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pool.map((id) => {
            const m = memberById(id);
            const active = selected === id;
            return (
              <button
                key={id}
                onClick={() => tap(id)}
                aria-pressed={active}
                aria-label={`${active ? 'Deselect' : 'Select'} ${m?.name ?? 'player'}`}
                className="flex items-center gap-1.5"
                style={{
                  padding: '5px 11px 5px 5px',
                  borderRadius: 'var(--radius-full)',
                  background: active ? 'color-mix(in srgb, var(--optic) 18%, transparent)' : 'var(--bg-raised)',
                  border: `1.5px solid ${active ? 'var(--optic)' : 'transparent'}`,
                }}
              >
                <Avatar member={m} size={22} />
                <span className="font-sans text-[13px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                  {m?.name ?? '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p
        className="font-sans text-xs"
        style={{ color: status.ok ? 'var(--text-lo)' : 'var(--clay)' }}
      >
        {status.ok
          ? status.message
          : selected
            ? `${status.message} Now tap ${nameOf(selected)}'s partner.`
            : `${status.message}${pool.length > 0 ? ' Tap two players to pair them.' : ''}`}
      </p>
    </div>
  );
}
