import { defineConfig } from 'vitest/config';

// Pure logic only (utils/*.test.js) — node env, no DOM. UI and Dexie code is
// verified by code review + the on-device checklist, per docs/GUIDELINES.md.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
