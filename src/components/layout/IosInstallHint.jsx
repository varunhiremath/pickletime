import { useState } from 'react';
import { Share, X } from 'lucide-react';
import { shouldOfferIosInstall, readEnv } from '../../utils/platform.js';

const DISMISSED = 'pt.iosInstallHint.dismissed';

/**
 * How to install, on the one platform that will not tell you itself.
 *
 * Android and desktop browsers surface their own install prompt. iOS Safari has
 * none — "Add to Home Screen" is an item partway down the Share sheet, and
 * nobody finds it unless told. Without it an iPhone friend uses PickleTime as a
 * browser tab: no home-screen icon, no standalone window, and Safari is free to
 * evict the local cache between visits.
 *
 * Shown once, dismissible, and never again on that phone. It also disappears by
 * itself the moment the app is opened from the home screen, because then the
 * check that puts it here stops being true.
 */
export default function IosInstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === '1';
    } catch {
      // Private browsing can throw on access. A hint is not worth a crash.
      return false;
    }
  });

  if (dismissed || !shouldOfferIosInstall(readEnv())) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Nothing to do; it will simply appear again next time.
    }
  };

  return (
    <div
      className="mx-4 mb-3 flex items-start gap-2.5"
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: 'var(--court)' }}>
        <Share size={15} />
      </span>
      <p className="flex-1 font-sans text-xs leading-relaxed" style={{ color: 'var(--text-hi)' }}>
        <strong>Add PickleTime to your home screen</strong> — tap the Share button in Safari, then
        “Add to Home Screen”. It then opens full screen and works without signal.
      </p>
      <button
        onClick={close}
        aria-label="Dismiss the install hint"
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ color: 'var(--text-lo)' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
