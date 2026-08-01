import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { setBackend } from './sync/backend.js';
import { createLocalBackend } from './sync/localBackend.js';
import { createSupabaseBackend } from './sync/supabaseBackend.js';
import { isSupabaseConfigured } from './sync/supabaseClient.js';
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

// With a project configured the app shares data across everyone's phones; with
// no env vars it falls back to single-device mode, which is fully working rather
// than broken. Every page talks to the Backend interface, so neither one knows
// or cares which is in use. See docs/SETUP_SUPABASE.md.
setBackend(isSupabaseConfigured() ? createSupabaseBackend() : createLocalBackend());

// Apply the saved theme before first paint so there's no light-mode flash.
applyTheme(useSettingsStore.getState().theme);
watchSystemTheme(() => useSettingsStore.getState().theme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
