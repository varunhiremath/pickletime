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

// Deep-link restoration for GitHub Pages lives in router.jsx, deliberately — it
// has to run before createBrowserRouter reads window.location, and a module's
// body runs after its imports. See utils/deepLink.js.

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
