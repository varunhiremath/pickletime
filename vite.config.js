import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Capacitor's WebView serves assets at the file:// root, so it needs base: '/'.
// GitHub Pages serves under /pickletime/ (the repo name), so the normal build
// keeps that. Toggle via CAPACITOR_BUILD=true npm run build.
const isCapacitor = process.env.CAPACITOR_BUILD === 'true';
const base = isCapacitor ? '/' : '/pickletime/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // src/pwa.js does the registration, via virtual:pwa-register. The injected
      // script only registers the worker and never reloads the page, so an
      // installed app would keep running old JavaScript indefinitely — leaving
      // both in place would also register the worker twice.
      injectRegister: null,
      includeAssets: ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'PickleTime',
        short_name: 'PickleTime',
        description: 'Schedule pickleball games, enter scores together, and watch the standings move live.',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Purge old precached assets and take control immediately, so a new
        // deploy never leaves a client with a stale index.html pointing at
        // asset hashes that no longer exist.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Supabase is the source of truth for live scores — never serve it
        // from cache, or a phone would show a stale scoreboard while online.
        navigateFallbackDenylist: [/^\/rest\//, /^\/realtime\//],
      },
    }),
  ],
});
