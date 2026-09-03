import { registerSW } from 'virtual:pwa-register';

// Keeping an installed app up to date.
//
// This was broken and worth spelling out. vite.config sets
// registerType: 'autoUpdate', but that alone does nothing on the client — the
// plugin's injected registerSW.js only calls navigator.serviceWorker.register().
// A new service worker would install, skipWaiting, claim the page… and the
// already-loaded tab would carry on running the old JavaScript forever. An
// installed PWA showed a months-old build no matter how often it was reopened.
//
// The virtual module is the missing half: with autoUpdate it reloads the page
// once the new worker is in control, so the new assets are actually served.
//
// vite.config sets injectRegister: null so this is the ONLY registration —
// having both would register the worker twice.

export function setupAutoUpdate() {
  if (typeof window === 'undefined') return;

  registerSW({
    immediate: true,

    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // A phone left on the Club tab all weekend never navigates, so it would
      // otherwise never look for a new build. Check hourly, and on return to
      // the foreground — which is when someone picks the phone up to score.
      const check = () => registration.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },

    onRegisterError(error) {
      // Never fatal: without a service worker the app still works, it just
      // loses offline support.
      console.warn('[PickleTime] Service worker registration failed', error);
    },
  });
}
