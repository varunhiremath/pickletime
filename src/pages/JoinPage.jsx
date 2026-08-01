import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import BallIcon from '../components/icons/BallIcon.jsx';
import Button from '../components/ui/Button.jsx';
import useSessionStore from '../store/sessionStore.js';
import { getBackend } from '../sync/backend.js';
import { isValidInviteCode } from '../utils/inviteCode.js';
import { useHaptics } from '../hooks/useHaptics.js';
import { playChime, playError } from '../utils/sound.js';

/**
 * Entering the personal code the admin sent you.
 *
 * The field is deliberately the only thing on screen: this is the first thing a
 * friend sees after installing, and it should be obvious what to do.
 */
export default function JoinPage() {
  const navigate = useNavigate();
  const refresh = useSessionStore((s) => s.refresh);
  const haptic = useHaptics();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const looksValid = isValidInviteCode(code);

  const submit = async (e) => {
    e?.preventDefault();
    if (!looksValid || busy) return;

    setBusy(true);
    setError(null);
    try {
      const { club } = await getBackend().claimInvite(code);
      await refresh();
      haptic('win');
      playChime();
      navigate('/today', { replace: true });
      return club;
    } catch (err) {
      // The server decides whether a code is good, so its message is the honest
      // one — revoked, already used, expired, throttled.
      playError();
      haptic('error');
      setError(err.message ?? 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-7"
      style={{
        background: 'var(--bg-deep)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span style={{ color: 'var(--optic)' }}>
          <BallIcon size={40} strokeWidth={1.8} />
        </span>
        <h1
          className="font-display text-2xl font-extrabold"
          style={{ letterSpacing: '-0.02em', color: 'var(--text-hi)' }}
        >
          Join your club
        </h1>
        <p className="max-w-xs font-sans text-sm leading-relaxed" style={{ color: 'var(--text-lo)' }}>
          Enter the code your club admin sent you. You only have to do this once on
          this phone.
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="PT-7Q2K-9XR4"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Invite code"
          aria-invalid={Boolean(error)}
          className="font-display num w-full text-center outline-none"
          style={{
            padding: '18px 14px',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.06em',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-surface)',
            border: `1.5px solid ${error ? 'var(--clay)' : 'var(--line)'}`,
            color: 'var(--text-hi)',
          }}
        />

        {error && (
          <p className="text-center font-sans text-sm" style={{ color: 'var(--clay)' }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" full disabled={!looksValid || busy}>
          {busy ? 'Joining…' : 'Join'} <ArrowRight size={18} />
        </Button>
      </form>

      <button
        onClick={() => navigate('/club')}
        className="font-sans text-sm"
        style={{ color: 'var(--text-lo)' }}
      >
        Setting up a new club instead?
      </button>
    </div>
  );
}
