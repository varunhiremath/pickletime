import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BallIcon from '../components/icons/BallIcon.jsx';
import useSessionStore from '../store/sessionStore.js';

/**
 * Splash. RootBoot does the actual work (legacy import + first load); this waits
 * for the store to be populated and then decides where to send you:
 *
 *   - single-device mode  → Today (there is nothing to join)
 *   - server, in a club   → Today
 *   - server, no club yet → Join, unless this device has a local club it could
 *     publish instead, in which case Club is the more useful landing spot.
 */
export default function LoadingPage() {
  const navigate = useNavigate();
  const { loaded, remote, identity, canPublish } = useSessionStore();

  useEffect(() => {
    if (!loaded) return;
    if (remote && !identity?.clubId) {
      navigate(canPublish ? '/club' : '/join', { replace: true });
      return;
    }
    navigate('/today', { replace: true });
  }, [loaded, remote, identity?.clubId, canPublish, navigate]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4"
      style={{ background: 'var(--bg-deep)' }}
    >
      <span className="a-pulse" style={{ color: 'var(--optic)' }}>
        <BallIcon size={44} strokeWidth={1.8} />
      </span>
      <span
        className="font-display text-lg font-extrabold"
        style={{ letterSpacing: '-0.02em', color: 'var(--text-hi)' }}
      >
        PickleTime
      </span>
    </div>
  );
}
