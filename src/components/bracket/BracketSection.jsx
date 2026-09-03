import { Trophy, Lock, AlertTriangle } from 'lucide-react';
import MatchCard from '../scoreboard/MatchCard.jsx';
import Podium from './Podium.jsx';
import { Avatar } from '../scoreboard/PlayerChip.jsx';
import { SLOT, BRACKET_SIZE } from '../../utils/bracket.js';

function Heading({ children }) {
  return (
    <div className="flex items-center gap-3">
      <h3
        className="font-sans text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-lo)' }}
      >
        {children}
      </h3>
      <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
    </div>
  );
}

/**
 * The knockout stage: seeds, semifinals, third-place game, final, champion.
 *
 * Everything here is a view of what resolveBracket() worked out — this component
 * decides nothing about who plays whom. Its one job is to make the state
 * obvious: locked until the round robin finishes, then who qualified and why,
 * then the fixtures, then the result.
 */
export default function BracketSection({ bracket, members, session, onSubmit }) {
  if (!bracket.enabled) return null;

  const { rr, matches, qualifiers, standings, tiedForLastSpot } = bracket;
  const semis = matches.filter((m) => m.slot === SLOT.SF1 || m.slot === SLOT.SF2);
  const finals = matches.filter((m) => m.slot === SLOT.FINAL || m.slot === SLOT.BRONZE);

  // Written inline rather than as a local <Fixture> component, deliberately: a
  // component declared in a render body is a new type every render, so React
  // remounts its subtree — and a remounted card loses whatever half-typed score
  // is in it. That is not hypothetical here, because this section re-renders
  // whenever a score lands from another phone.
  const fixture = (m) => (
    <MatchCard
      key={m.slot}
      game={m.game}
      members={members}
      courts={session.courts}
      teamA={m.teamA}
      teamB={m.teamB}
      label={m.label}
      editable
      locked={!m.ready}
      lockedNote={
        rr.complete
          ? `Waiting on the ${m.source.toLowerCase()}.`
          : 'Set once the round robin is finished.'
      }
      onSubmit={(a, b, teams) => onSubmit(m.game, a, b, teams)}
      to={`/score?game=${m.game.id}`}
    />
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--gold-ink)' }}>
          <Trophy size={16} />
        </span>
        <h2 className="font-display text-base font-extrabold" style={{ color: 'var(--text-hi)' }}>
          Playoffs
        </h2>
      </div>

      {bracket.complete && (
        <Podium
          champion={bracket.champion}
          runnerUp={bracket.runnerUp}
          third={bracket.third}
          members={members}
          compact
        />
      )}

      {!rr.complete ? (
        <LockedNotice rr={rr} standings={standings} members={members} />
      ) : (
        <SeedRow qualifiers={qualifiers} standings={standings} members={members} />
      )}

      {tiedForLastSpot && (
        <p
          className="flex items-start gap-1.5 font-sans text-xs"
          style={{ color: 'var(--clay)' }}
        >
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            4th and 5th finished exactly level on wins, point difference and points scored — the
            last playoff spot came down to name order. Worth a play-off game if you'd rather settle
            it on court.
          </span>
        </p>
      )}

      <Heading>Semifinals</Heading>
      {semis.map(fixture)}

      <Heading>Finals</Heading>
      {finals.map(fixture)}
    </section>
  );
}

/** Before the round robin is finished: how far off it is, and who is in line. */
function LockedNotice({ rr, standings, members }) {
  const pct = rr.total === 0 ? 0 : Math.round((rr.played / rr.total) * 100);
  const contenders = standings.slice(0, BRACKET_SIZE);
  const anyPlayed = rr.played > 0;

  return (
    <div
      className="flex flex-col gap-3"
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--text-lo)' }}>
          <Lock size={14} />
        </span>
        <span className="font-sans text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
          {rr.remaining} round-robin {rr.remaining === 1 ? 'game' : 'games'} to go
        </span>
        <span className="num ml-auto font-display text-sm font-bold" style={{ color: 'var(--text-lo)' }}>
          {rr.played}/{rr.total}
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden"
        style={{ borderRadius: 'var(--radius-full)', background: 'var(--bg-raised)' }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: 'var(--optic)',
            borderRadius: 'var(--radius-full)',
            transition: 'width var(--dur-standard) var(--ease-out)',
          }}
        />
      </div>

      {anyPlayed && (
        <>
          <span
            className="font-sans text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-lo)' }}
          >
            In the top four as it stands
          </span>
          <div className="flex flex-wrap gap-1.5">
            {contenders.map((row, i) => (
              <SeedChip key={row.id} row={row} seed={i + 1} members={members} provisional />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Once the round robin is done: the final seeding, and who missed out. */
function SeedRow({ qualifiers, standings, members }) {
  const missed = standings.slice(BRACKET_SIZE);
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-sans text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--text-lo)' }}
      >
        Seeded from the round robin
      </span>
      <div className="flex flex-wrap gap-1.5">
        {qualifiers.map((row, i) => (
          <SeedChip key={row.id} row={row} seed={i + 1} members={members} />
        ))}
        {missed.map((row, i) => (
          <SeedChip key={row.id} row={row} seed={BRACKET_SIZE + i + 1} members={members} out />
        ))}
      </div>
    </div>
  );
}

function SeedChip({ row, seed, members, out = false, provisional = false }) {
  const member = members.find((m) => m.id === row.id);
  return (
    <span
      className="flex items-center gap-1.5"
      style={{
        padding: '4px 10px 4px 4px',
        borderRadius: 'var(--radius-full)',
        background: out ? 'transparent' : 'var(--bg-raised)',
        border: `1.5px solid ${out ? 'var(--line)' : provisional ? 'var(--line)' : 'var(--gold)'}`,
        opacity: out ? 0.5 : 1,
      }}
      title={`${row.w}W ${row.l}L · ${row.diff > 0 ? '+' : ''}${row.diff}`}
    >
      <span
        className="num flex h-5 w-5 items-center justify-center font-display text-[11px] font-extrabold"
        style={{
          borderRadius: 'var(--radius-full)',
          background: out ? 'var(--bg-raised)' : 'var(--gold)',
          color: out ? 'var(--text-lo)' : 'var(--text-on-accent)',
        }}
      >
        {seed}
      </span>
      <Avatar member={member} size={18} />
      <span className="font-sans text-[13px] font-semibold" style={{ color: 'var(--text-hi)' }}>
        {row.name}
      </span>
    </span>
  );
}
