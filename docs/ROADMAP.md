# Roadmap

Five sprints, one PR each. Sprint 1 is done.

---

## ✅ Sprint 1 — Scaffold, parity, design system

Shipped. The app is a complete single-device PWA at feature parity with the original,
plus a lot more.

- Vite + React + Tailwind + PWA scaffold; the old static `app.js`/`styles.css` removed.
- Design system: dark + light token sets, self-hosted Archivo/Inter, contrast test.
- Ported and extended the scheduling and standings logic, with **188 tests**.
- Seeded RNG, so schedules are reproducible and "reshuffle" is possible.
- Multi-court support in both formats.
- Dexie local mirror, `localBackend`, the `Backend` seam.
- One-shot import of the original app's `localStorage`.
- Five tabs, player pages, Courtside mode, settings.
- CI: tests + build gate every PR; `main` deploys to Pages.

## Sprint 2 — Supabase

Shared data. This is the sprint that makes it a group app.

- `supabase/schema.sql`, `policies.sql`, `functions.sql`.
- Anonymous sign-in; `claim_invite(code)` RPC; the `/join` flow.
- `submit_score` RPC as the only write path, so the audit log can't be bypassed.
- RLS via `security definer` helpers (`is_member`, `is_admin`). These **must** be
  `security definer` — a policy on `members` that queries `members` recurses.
- Admin roster + invite minting UI; per-friend codes, individually revocable.
- `supabaseBackend.js` behind the existing interface.
- `docs/SETUP_SUPABASE.md`, plus a weekly keep-alive Action (free projects pause after
  7 days idle).
- `supabase/rls.test.mjs` — two anonymous sessions asserting cross-club reads return
  zero rows and a direct `games` UPDATE is rejected.

## Sprint 3 — Realtime and offline

- `postgres_changes` subscription on `games`; presence for "who's here".
- Outbox flush on reconnect, wired to the already-tested `outboxMerge` logic.
- Conflict toasts, connection status, audit-log viewer.

## Sprint 4 — Depth

- Admin panel: reshuffle, finalise/reopen, revoke invites, override scores.
- Seasons and cross-session history; rank-over-time chart (Recharts).
- Share card for the group chat (html2canvas).

## Sprint 5 — APK

- Capacitor Android, `appId: com.varunhiremath.pickletime`.
- `android-release.yml`: JDK 21, Node 22, `CAPACITOR_BUILD=true`, debug-signed
  `assembleDebug` so it sideloads, published to Releases.

---

## Deferred by design

- **Mexicano** (pairings recomputed from live standings each round), fixed-partner
  doubles, knockout brackets. `utils/schedule.js` takes new generators without
  restructuring, and standings are already a pure function of the games.
- iPhone friends get the PWA only — no APK.
- No background push: a static PWA can't deliver it. Any nudges fire in-app on open.
