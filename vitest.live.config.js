import { defineConfig } from 'vitest/config';

// Live tests: these hit the real Supabase project, so they are NOT part of
// `npm test` and never run in CI.
//
//   npm run test:live
//
// Vitest is used rather than plain node because src/sync/supabaseClient.js reads
// import.meta.env, which only exists under Vite — and because Dexie needs an
// IndexedDB, supplied by fake-indexeddb in the setup file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/**/*.live.test.js'],
    setupFiles: ['./supabase/live.setup.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    // The live tests share one Supabase project; running files in parallel
    // would interleave their scratch clubs.
    fileParallelism: false,
  },
});
