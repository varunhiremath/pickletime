// Buttons. `primary` uses --optic, and its text is --text-on-accent because the
// optic yellow is far too light for white text — the colour rule from
// styles/tokens.css, enforced here so no call site has to remember it.

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100';

const SIZES = {
  sm: { padding: '8px 14px', fontSize: 13, borderRadius: 'var(--radius-full)', minHeight: 36 },
  md: { padding: '12px 18px', fontSize: 15, borderRadius: 'var(--radius-full)', minHeight: 46 },
  lg: { padding: '16px 22px', fontSize: 17, borderRadius: 'var(--radius-lg)', minHeight: 56 },
};

const VARIANTS = {
  primary: { background: 'var(--optic)', color: 'var(--text-on-accent)', boxShadow: 'var(--optic-glow)' },
  secondary: { background: 'var(--bg-raised)', color: 'var(--text-hi)' },
  ghost: { background: 'transparent', color: 'var(--text-lo)' },
  danger: { background: 'var(--clay)', color: '#fff' },
  outline: { background: 'transparent', color: 'var(--text-hi)', border: '1px solid var(--line)' },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  style = {},
  children,
  ...props
}) {
  return (
    <button
      className={`${BASE} ${full ? 'w-full' : ''} ${className}`}
      style={{ ...SIZES[size], ...VARIANTS[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
