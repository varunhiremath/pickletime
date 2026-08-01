import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import UiHost from '../ui/UiHost.jsx';
import useSessionStore from '../../store/sessionStore.js';
import { getBackend } from '../../sync/backend.js';
import { toast } from '../../store/uiStore.js';

/**
 * Pathless parent route that boots the app: runs the one-time import of the
 * original app's localStorage, loads the store, and subscribes to backend
 * changes.
 *
 * This lives above AppLayout rather than inside it because Courtside mode is
 * deliberately rendered outside the tab chrome — if bootstrapping happened in
 * AppLayout, deep-linking straight to /score/courtside would render an empty
 * screen. Every route that needs data hangs off this one.
 */
export default function RootBoot() {
  const refresh = useSessionStore((s) => s.refresh);
  const listen = useSessionStore((s) => s.listen);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const imported = await getBackend().importLegacyIfPresent?.();
        if (cancelled) return;
        if (imported) {
          toast(
            `Imported ${imported.members.length} players and ${imported.games.length} games from your old schedule.`,
            { type: 'success', duration: 5000 }
          );
        }
      } catch {
        // A failed import must never block the app — the worst case is that the
        // old data stays in localStorage and the user starts fresh.
      }

      // Likewise the first load. If the server is unreachable or misconfigured,
      // the store falls back to the local mirror and marks itself loaded anyway;
      // an unhandled rejection here would leave the user on the splash screen
      // indefinitely, which is exactly how a paused project used to fail.
      if (!cancelled) {
        try {
          await refresh();
        } catch (err) {
          useSessionStore.setState({ loaded: true, bootError: err?.message ?? String(err) });
        }
      }
    })();

    const unsubscribe = listen();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh, listen]);

  return (
    <>
      <Outlet />
      <UiHost />
    </>
  );
}
