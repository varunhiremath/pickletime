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

## 🟡 Sprint 2 — Supabase (code complete, awaiting live verification)

Shared data. Everything below is written and building; the RLS policies and the
cross-device realtime path still need to be run against a real project before this
can be called done. See `docs/SETUP_SUPABASE.md`.

- `supabase/schema.sql`, `policies.sql`, `functions.sql` — tables, row-level
  security, and three RPCs (`create_club`, `claim_invite`, `submit_score`).
- **`games` has no UPDATE policy and `score_events` has no write policies.** The
  only way to write a score is `submit_score`, which appends to the audit log in
  the same transaction — so the log cannot be bypassed, by anyone, including the
  admin.
- Anonymous sign-in, per-friend invite codes (admin-readable so a lost code can be
  re-sent), revocation that cuts a device off on its next request.
- `supabaseBackend.js` behind the existing `Backend` interface — no page changed.
- Realtime `postgres_changes` (pulled forward from Sprint 3).
- Reads are write-through cached to the Dexie mirror and fall back to it offline,
  so connecting a server doesn't regress Sprint 1's offline behaviour.
- Publish-a-local-club, with pure tested id remapping (`utils/publishPlan.js`).
- Boot is now failure-proof: an unreachable or paused project falls back to cached
  data with an honest banner instead of hanging on the splash screen.
- `supabase/rls.test.mjs` — 25+ assertions to run against the live project.
- Weekly keep-alive workflow (free projects pause after 7 days idle).

### Superseded from the original plan

`hashInviteCode()` is removed. Hashing the code in the browser and sending the
digest is *worse* than sending the code: if the client sends the hash, the hash
becomes the credential, so a leaked database hands an attacker something directly
replayable. Codes now travel over TLS and are compared server-side.

## Sprint 2 — original outline

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
