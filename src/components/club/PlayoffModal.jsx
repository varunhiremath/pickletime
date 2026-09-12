import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import ShapeChoice, { SHAPE_COPY } from './ShapeChoice.jsx';
import { knockoutGames, shapeOf, slotsForShape } from '../../utils/bracket.js';
import { playoffShapesFor, canRunPlayoffs } from '../../utils/schedule.js';

/**
 * Change how a session finishes, after it has started.
 *
 * People decide this on the court, not in the setup screen: the round robin
 * runs long, or somebody points out that finishing top of the table should be
 * worth a second chance. The round robin is untouched either way — only the
 * playoff fixtures are torn down and rebuilt — so this is a cheap change right
 * up until the first playoff score is entered.
 */
export default function PlayoffModal({ open, onClose, session, games, onSave }) {
  // shapeOf() is null when there are no playoff fixtures at all, which is
  // exactly the "No finish" option below.
  const current = useMemo(() => shapeOf(games), [games]);
  const [shape, setShape] = useState(current);
  const [saving, setSaving] = useState(false);

  // Re-seed from the session each time it opens: leaving a stale pick in state
  // would show the wrong option as chosen after somebody else changed it.
  useEffect(() => {
    if (open) setShape(current);
  }, [open, current]);

  const choices = playoffShapesFor(session?.format);
  const available = canRunPlayoffs({
    format: session?.format,
    playerCount: session?.playerIds?.length ?? 0,
  });
  // Once a playoff game has a score, swapping the shape would throw that score
  // away. Say so here rather than letting the backend refuse after the tap.
  const scored = knockoutGames(games).some((g) => g.played);
  const changed = shape !== current;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(shape);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const gamesFor = (s) => slotsForShape(s).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How it finishes"
      footer={
        <Button variant="primary" full disabled={!changed || saving || scored} onClick={save}>
          {saving ? 'Rebuilding…' : changed ? 'Change the finish' : 'Nothing to change'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {!available ? (
          <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
            This session doesn't have enough players for a playoff.
          </p>
        ) : (
          <>
            {scored && (
              <p
                className="flex items-start gap-1.5 font-sans text-xs"
                style={{ color: 'var(--clay)' }}
              >
                <AlertTriangle size={13} className="mt-px shrink-0" />
                <span>
                  A playoff game already has a score. Clear it and the finish can be changed
                  again.
                </span>
              </p>
            )}

            <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
              The round robin and every score in it stay exactly as they are — only the playoff
              fixtures are rebuilt.
            </p>

            <div className="flex flex-col gap-1.5">
              {choices.map((s) => (
                <ShapeChoice
                  key={s}
                  title={SHAPE_COPY[s].title}
                  blurb={`${SHAPE_COPY[s].blurb(session?.format)} · ${gamesFor(s)} ${
                    gamesFor(s) === 1 ? 'game' : 'games'
                  }`}
                  active={shape === s}
                  onClick={() => !scored && setShape(s)}
                />
              ))}
              <ShapeChoice
                title="No finish"
                blurb="Stop at the round robin — the table decides it."
                active={shape === null}
                onClick={() => !scored && setShape(null)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
