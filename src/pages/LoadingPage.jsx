import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BallIcon from '../components/icons/BallIcon.jsx';
import useSessionStore from '../store/sessionStore.js';

/**
 * Splash. RootBoot does the actual work (legacy import + first load); this waits
 * for the store to be populated and hands off to Today, so no screen ever has to
 * render against an empty store.
 */
export default function LoadingPage() {
  const navigate = useNavigate();
  const loaded = useSessionStore((s) => s.loaded);

  useEffect(() => {
    if (loaded) navigate('/today', { replace: true });
  }, [loaded, navigate]);

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
