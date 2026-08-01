# Architecture

The codebase map. Check here before grepping.

## Stack

React 18 · Vite 5 · Tailwind v3 + CSS custom properties · react-router-dom v6 ·
Zustand · Dexie/IndexedDB · lucide-react · vite-plugin-pwa · Vitest.

`base` is `/pickletime/` for GitHub Pages, `/` when `CAPACITOR_BUILD=true` (the APK's
WebView serves from the filesystem root). `router.jsx` derives its `basename` from
`import.meta.env.BASE_URL`, so one codebase serves both.

## Routes

| Path | Page | Notes |
| --- | --- | --- |
| `/` | `LoadingPage` | Splash; waits for the store, then redirects to `/today`. |
| `/today` | `TodayPage` | Live session dashboard. |
| `/matches` | `MatchesPage` | Fixtures grouped by round; filters all/mine/to-play. |
| `/score` | `ScorePage` | Two-sided scoreboard, one game at a time. |
| `/score/courtside` | `CourtsidePage` | Full-bleed scoreboard. **Outside `AppLayout`** — no tab bar. |
| `/standings` | `StandingsPage` | League table with FLIP reordering. |
| `/club` | `ClubPage` | Roster, session setup, session history. |
| `/players/:id` | `PlayerPage` | Per-player stats, head-to-head, partners. |
| `/settings` | `SettingsPage` | Theme, effects, danger zone. |

### Route tree

`RootBoot` is a **pathless parent route** that owns the legacy import, the first store
load, the change subscription, and `UiHost`. `AppLayout` (tab chrome) nests inside it.
Courtside is a sibling of `AppLayout`, not a child — that's why bootstrapping lives in
`RootBoot` and not in `AppLayout`. Putting it in `AppLayout` renders an empty screen
when someone deep-links to Courtside.

## Pure logic (`src/utils/`) — all Vitest-covered

| File | Exports |
| --- | --- |
| `rng.js` | `mulberry32`, `seedFromString`, `randomSeed`, `shuffle` — seeded RNG so schedules are reproducible. |
| `schedule.js` | `FORMATS`, `generateSingles`, `generateAmericano`, `generateSchedule`, `assignCourts`, `gamesPerPlayer`. |
| `standings.js` | `computeStandings`, `currentStreak`, `rankHistory`, `headToHead`, `partnerRecords`, `sessionProgress`. |
| `inviteCode.js` | `generateInviteCode`, `normalizeInviteCode`, `hashInviteCode` — Crockford base32, ambiguous glyphs excluded. |
| `outboxMerge.js` | `collapseOutbox`, `detectConflict`, `planFlush`, `applyPending`, `mergeRemote`, `describeConflict`. |
| `legacyImport.js` | `readLegacyState`, `hasImportableData`, `convertLegacyState` — one-shot v1 → v2 migration. |
| `contrast.js` | `luminance`, `contrastRatio`, `meetsAA`, `readableTextOn`. |
| `theme.js` | `resolveTheme`, `applyTheme`, `watchSystemTheme`. |
| `sound.js` | `playTick`, `playChime`, `playFanfare`, `playError` — WebAudio, no asset files. |

## Data layer

### `src/sync/backend.js` — the seam

Pages and stores talk to a **Backend**, never to Dexie or Supabase directly.
`setBackend()` is called once in `main.jsx`, choosing on `isSupabaseConfigured()`.
The interface (identity, reads, writes, realtime) is documented in full at the top of
that file.

- `localBackend.js` — everything in the local Dexie mirror. The fallback whenever no
  project is configured, and a complete working app in its own right.
- `supabaseBackend.js` — the shared backend. Same interface, so no page differs
  between modes. Reads are write-through cached into Dexie and fall back to it when
  the network fails; `subscribe()` opens a `postgres_changes` channel.
- `rowMap.js` — snake_case ↔ camelCase translation, so nothing above the sync layer
  knows what the columns are called. Pure and tested.
- `supabaseClient.js` — client construction and anonymous sign-in.

### Server (`supabase/`)

`schema.sql` → `policies.sql` → `functions.sql`, applied in that order via the SQL
editor. `docs/SETUP_SUPABASE.md` is the walkthrough.

**Live tests** — these hit a real project, so they are deliberately outside `npm test`
and never run in CI:

| File | Run with | Covers |
| --- | --- | --- |
| `rls.test.mjs` | `node supabase/rls.test.mjs` | the security rules, via raw SQL |
| `realtime.test.mjs` | `node supabase/realtime.test.mjs` | delivery latency, and that non-members receive nothing |
| `backend.live.test.js` | `npm run test:live` | `supabaseBackend` end to end |

The first two need `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the environment;
`npm run test:live` reads `.env` through Vite and skips itself when unset.

`backend.live.test.js` runs under `vitest.live.config.js` rather than plain node for two
reasons: `supabaseClient.js` reads `import.meta.env`, which only exists under Vite, and
Dexie needs an IndexedDB, supplied by `fake-indexeddb` in `supabase/live.setup.js`.

**`claim_invite` returns `{ok:false, error}` instead of raising.** Not a style choice:
raising rolls back the transaction, which silently discarded the brute-force attempt
counter and left guessing unlimited. Any rejection that must persist a side effect has
to return, not raise.

**Two absences in `policies.sql` are load-bearing, not oversights:**

- `games` has **no UPDATE policy** (plus a `restrictive` tripwire that always fails),
  so no client can write a score directly.
- `score_events` has **no write policies at all**.

The only writer is the `submit_score` RPC, which is `SECURITY DEFINER` and appends to
`score_events` in the same transaction as the update. That is what makes the audit log
impossible to bypass — including for the admin — and what makes "anyone can edit any
score" safe rather than reckless.

The RLS helpers `is_member()` / `is_admin()` **must** stay `SECURITY DEFINER` with
`SET search_path = public`: a policy on `members` that queries `members` recurses
forever, and a definer function with a mutable search path is a privilege-escalation
vector. They also must keep `EXECUTE` granted to `authenticated`, because policy
expressions are evaluated as the querying role.

### `src/db/db.js` — Dexie `PickleTimeDB`

A **cache plus an outbox**, not the source of truth (Supabase becomes that).

| Table | Indexes |
| --- | --- |
| `clubs` | `id, name` |
| `members` | `id, clubId, name, role, userId` |
| `sessions` | `id, clubId, date, status, createdAt` |
| `games` | `id, sessionId, [sessionId+ordinal], round, played, updatedAt` |
| `scoreEvents` | `id, gameId, memberId, createdAt` |
| `outbox` | `++id, gameId, queuedAt` |
| `meta` | `key` |

Migrations are append-only `db.version(n)` blocks. Never edit a shipped version.

`meta` keys: `deviceId`, `memberId`, `legacyImported`.

### Stores (`src/store/`)

- `sessionStore.js` — the live view: `club`, `members`, `sessions`, `session`, `games`,
  `identity`, `connection`, `pending`, `recentlyChanged`. One store rather than a hook
  per table, because every screen needs an overlapping slice and one refresh keeps them
  mutually consistent.
- `settingsStore.js` — persisted to `localStorage` under `pickletime_prefs`.
- `uiStore.js` — toasts and promise-based `confirm`/`prompt`. The app never calls
  `window.confirm`/`prompt`/`alert`.

## Design system

`src/styles/tokens.css` is the **single source of truth** for the palette;
`tailwind.config.js` mirrors the values so utilities can reach them. Prefer
`var(--token)` in components — that's what flips between themes.

Dark is the default; light is a genuine high-contrast design, not an inversion (a phone
in direct sunlight reads better in light mode).

**The colour rule:** text on `--optic` or `--gold` is always `--text-on-accent`
(near-black), never white. `--optic-ink` / `--gold-ink` are the darkened variants for
text and thin strokes on light surfaces. `src/styles/tokens.test.js` parses the real CSS
and fails CI if any pairing drops below WCAG AA — a contrast regression is a test
failure, not a review opinion.

Every changing number carries `tabular-nums` (`.num`, `.font-display`). Proportional
figures make live-updating columns jitter.

## Components worth knowing

| Component | Why it exists |
| --- | --- |
| `fx/FlipList.jsx` | FLIP reordering for the standings table. Children need stable `key`s. |
| `fx/CountUp.jsx` | rAF odometer; falls back to the plain number when effects are off. |
| `fx/Particles.jsx` | One-shot burst on a saved score. |
| `scoreboard/Numeral.jsx` | The big tabular score, with a digit roll when it changes underneath you. |
| `scoreboard/LiveBadge.jsx` | Connection state. The pulse stops when realtime drops, so it's a real indicator. |
| `ui/Modal.jsx` | Portals to `document.body` — an ancestor `transform` would otherwise trap a fixed overlay. |
| `ui/UiHost.jsx` | Renders `uiStore` toasts/dialogs. Mounted once in `RootBoot`. |

## Conventions

- Anything addable is editable and deletable, and **deletes revert derived data**:
  removing a player deletes their fixtures and score events and renumbers the session;
  deleting a session takes its games and audit trail with it.
- Scores are written through **one path only** (`submitScore`), which appends to
  `scoreEvents` in the same transaction. On the server this becomes an RPC with no
  direct UPDATE policy on `games`, so the audit log cannot be bypassed.
- New pure logic goes in `src/utils/*.js` with a co-located `*.test.js`.
- Motion is gated on `settingsStore.effects` **and** `prefers-reduced-motion`.
