import BallIcon from '../icons/BallIcon.jsx';

/** Centred empty/zero state. `children` is where an action button goes. */
export default function EmptyState({ title, message, icon: Icon = BallIcon, children }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: 'var(--bg-raised)', color: 'var(--text-lo)' }}
      >
        <Icon size={26} />
      </span>
      <h2 className="font-display text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
        {title}
      </h2>
      {message && (
        <p className="max-w-xs font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          {message}
        </p>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
