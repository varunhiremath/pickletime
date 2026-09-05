import { useState, useEffect } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import TeamPicker from './TeamPicker.jsx';
import { teamsFromGames } from '../../utils/entrants.js';
import { isComplete, pruneToField } from '../../utils/teamDraft.js';

/**
 * Changing the teams of a session that already exists.
 *
 * People drop out and turn up on the morning, so the draw made on Thursday is
 * rarely the one that plays on Sunday. This re-enters the same picker used when
 * the session was created, seeded with whatever the teams currently are.
 *
 * Saving regenerates the schedule, which the backend refuses once anything has
 * been scored. That refusal is surfaced here *before* the work rather than after
 * it — being told the pairing you just spent a minute on cannot be saved is a
 * worse experience than being told up front that it is too late.
 */
export default function EditTeamsModal({ open, onClose, session, games, members, onSave }) {
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const playerIds = (session?.playerIds ?? []).filter((id) => members.some((m) => m.id === id));
  const anyPlayed = games.some((g) => g.played);

  // Seed from the current draw each time it opens. The component stays mounted
  // while closed, so a useState initialiser would freeze the teams as they were
  // the first time the Club tab rendered.
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setTeams(pruneToField({ playerIds, teams: teamsFromGames(games) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = isComplete(playerIds, teams);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSave(teams);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Teams"
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!ready || busy || anyPlayed}
          onClick={save}
        >
          {anyPlayed ? 'Scores already entered' : ready ? 'Save teams' : 'Finish pairing the teams'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {anyPlayed ? (
          <p className="font-sans text-sm" style={{ color: 'var(--clay)' }}>
            This session already has scores. Changing the teams now would throw those results
            away, so clear them first if you really need to re-pair.
          </p>
        ) : (
          <p className="font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
            Saving builds a fresh round robin between the new teams. Nothing has been scored yet,
            so nothing is lost.
          </p>
        )}

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
      </div>
    </Modal>
  );
}
