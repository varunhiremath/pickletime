import { AlertTriangle } from 'lucide-react';
import useSessionStore from '../../store/sessionStore.js';
import { CONNECTION } from '../../sync/backend.js';

/**
 * Shown only when the server is configured but something is wrong with it.
 *
 * The app deliberately keeps working on cached data in this state, which is the
 * right behaviour on a court with no signal — but it must not *look* fine, or a
 * misconfigured project reads as "my club vanished". Reminders are best-effort
 * and honest; so is this.
 */
export default function ServerNotice() {
  const { remote, connection, bootError, identity } = useSessionStore();

  if (!remote) return null;
  const authError = identity?.authError ?? null;
  const problem = bootError || authError;
  if (!problem && connection !== CONNECTION.OFFLINE) return null;

  const message = problem
    ? problem
    : "Can't reach the server — showing the last data this phone downloaded. Scores you enter now may not reach everyone else.";

  return (
    <div
      role="status"
      className="mx-4 mb-3 flex items-start gap-2.5"
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--clay) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--clay) 40%, transparent)',
      }}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--clay)' }} />
      <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--text-hi)' }}>
        {message}
      </p>
    </div>
  );
}
