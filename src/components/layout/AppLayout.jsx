import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';
import ServerNotice from './ServerNotice.jsx';
import IosInstallHint from './IosInstallHint.jsx';

/**
 * The tabbed shell. Data loading lives in RootBoot (the parent route) so that
 * Courtside mode, which renders outside this shell, is bootstrapped too.
 */
export default function AppLayout() {
  return (
    <div
      className="min-h-full"
      style={{
        background: 'var(--bg-deep)',
        // Clear the notch / status bar on edge-to-edge devices. Zero elsewhere.
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <main className="mx-auto w-full max-w-md pb-28">
        <ServerNotice />
        <IosInstallHint />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
