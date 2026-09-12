import { SHAPES } from '../../utils/bracket.js';

/**
 * How each finish is described when there is a choice between them.
 *
 * The Page system's whole point is that topping the table is worth something —
 * seeds 1 and 2 get two chances at the grand final — so that is what the blurb
 * says, rather than listing five fixtures nobody will match to a diagram.
 *
 * Shared, because the finish is picked in two places now: when the session is
 * set up, and again from the playoffs section once the round robin has run and
 * somebody says "let's make it best of the Page instead".
 */
export const SHAPE_COPY = {
  [SHAPES.KNOCKOUT]: {
    title: 'Straight knockout',
    blurb: () =>
      '1 v 4 and 2 v 3 in the semifinals, then a third-place game and a final. Lose once and you are out.',
  },
  [SHAPES.PAGE]: {
    title: 'Page playoff',
    blurb: () =>
      '1 v 2 and 3 v 4 first. The 1 v 2 winner goes straight to the grand final; its loser gets a second chance against the 3 v 4 winner.',
  },
  [SHAPES.FINAL_ONLY]: {
    title: 'One deciding game',
    blurb: () => 'Seeds 1 & 4 against seeds 2 & 3.',
  },
};

/** One selectable finish: a title, a blurb, and a gold border when it's on. */
export default function ShapeChoice({ title, blurb, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="text-left"
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: active
          ? 'color-mix(in srgb, var(--gold) 14%, transparent)'
          : 'var(--bg-raised)',
        border: `1.5px solid ${active ? 'var(--gold)' : 'transparent'}`,
      }}
    >
      <span className="block font-sans text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
        {title}
      </span>
      <span className="block font-sans text-xs" style={{ color: 'var(--text-lo)' }}>
        {blurb}
      </span>
    </button>
  );
}
