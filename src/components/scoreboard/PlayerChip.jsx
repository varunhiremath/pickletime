import { readableTextOn } from '../../utils/contrast.js';

const PALETTE = [
  '#1B9AAA', '#FF5C39', '#A78BFA', '#34D399',
  '#F472B6', '#FBBF24', '#60A5FA', '#FB923C',
];

export function playerColor(colorIndex = 0) {
  return PALETTE[colorIndex % PALETTE.length];
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Circular avatar. Text colour is chosen for contrast, not assumed. */
export function Avatar({ member, size = 28 }) {
  const bg = playerColor(member?.colorIndex);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-display font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: readableTextOn(bg),
        fontSize: size * 0.4,
      }}
      title={member?.name}
    >
      {initials(member?.name)}
    </span>
  );
}

/** Avatar + name, used in match cards and roster lists. */
export default function PlayerChip({ member, size = 26, className = '', bold = false }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Avatar member={member} size={size} />
      <span
        className="truncate font-sans"
        style={{ fontWeight: bold ? 700 : 500, color: 'var(--text-hi)' }}
      >
        {member?.name ?? '—'}
      </span>
    </span>
  );
}
