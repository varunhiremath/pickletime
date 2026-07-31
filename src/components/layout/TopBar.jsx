import { Link } from 'react-router-dom';
import LiveBadge from '../scoreboard/LiveBadge.jsx';
import useSessionStore from '../../store/sessionStore.js';

/** Page header: title, optional subtitle, connection state, optional action. */
export default function TopBar({ title, subtitle, action, showLive = true }) {
  const connection = useSessionStore((s) => s.connection);
  const pending = useSessionStore((s) => s.pending);

  return (
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <h1
          className="truncate font-display text-2xl font-extrabold"
          style={{ letterSpacing: '-0.02em', color: 'var(--text-hi)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate font-sans text-sm" style={{ color: 'var(--text-lo)' }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        {showLive && <LiveBadge connection={connection} pending={pending} />}
        {action}
      </div>
    </header>
  );
}

/** Brand lockup for the empty/onboarding states. */
export function Wordmark({ size = 'lg' }) {
  const fontSize = size === 'lg' ? 30 : 20;
  return (
    <Link to="/today" className="inline-flex items-baseline gap-1">
      <span
        className="font-display font-extrabold"
        style={{ fontSize, letterSpacing: '-0.03em', color: 'var(--text-hi)' }}
      >
        Pickle
      </span>
      <span
        className="font-display font-extrabold"
        style={{ fontSize, letterSpacing: '-0.03em', color: 'var(--optic-ink)' }}
      >
        Time
      </span>
    </Link>
  );
}
