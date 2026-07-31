import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { setBackend } from './sync/backend.js';
import { createLocalBackend } from './sync/localBackend.js';
import useSettingsStore from './store/settingsStore.js';
import { applyTheme, watchSystemTheme } from './utils/theme.js';
import './index.css';

// GitHub Pages has no SPA rewrite, so public/404.html bounces deep links back to
// the root with the intended path in ?redirect=. Restore it into history before
// React mounts, so the router sees the URL the user actually asked for.
(function restoreDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (!redirect) return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.history.replaceState(null, '', `${base}/${redirect.replace(/^\//, '')}`);
})();

// Sprint 1 ships the local backend only — the app is a complete single-device
// PWA. Sprint 2 swaps in the Supabase backend here; nothing above this line
// changes, because every page talks to the Backend interface rather than to a
// specific implementation.
setBackend(createLocalBackend());

// Apply the saved theme before first paint so there's no light-mode flash.
applyTheme(useSettingsStore.getState().theme);
watchSystemTheme(() => useSettingsStore.getState().theme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
