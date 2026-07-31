// Small metadata pill — court number, round, format, status.

export default function Chip({ children, tone = 'neutral', className = '', style = {} }) {
  const tones = {
    neutral: { background: 'var(--bg-raised)', color: 'var(--text-lo)' },
    optic: { background: 'var(--optic)', color: 'var(--text-on-accent)' },
    court: { background: 'color-mix(in srgb, var(--court) 18%, transparent)', color: 'var(--court)' },
    clay: { background: 'color-mix(in srgb, var(--clay) 18%, transparent)', color: 'var(--clay)' },
    gold: { background: 'var(--gold)', color: 'var(--text-on-accent)' },
  };

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap font-sans text-[11px] font-semibold uppercase tracking-wide ${className}`}
      style={{
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
