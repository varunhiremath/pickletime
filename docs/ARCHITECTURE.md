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
| `schedule.js` | `FORMATS`, `isTeamFormat`, `circleMethod`, `generateSingles`, `generatePairs`, `generateAmericano`, `generateSchedule`, `assignCourts`, `gamesPerPlayer`, `canRunPlayoffs`. |
| `entrants.js` | `teamKey`, `teamsFromGames`, `sessionEntrants`, `gamesByEntrant`, `entrantSize` — who is being ranked. |
| `bracket.js` | `STAGE`, `SLOT`, `BRACKET_SLOTS`, `isRoundRobin`/`isKnockout`, `roundRobinGames`/`knockoutGames`, `outcome`, `buildBracketGames`, `resolveBracket`, `slotLabel`/`slotShortLabel`. |
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

`submit_score` also takes the knockout line-up (`p_team_a` / `p_team_b`). Playoff rows
are created empty, so entering their score is also what records who played — see
"The knockout stage" below. It ignores those arguments for round-robin rows, whose
line-ups belong to the generated schedule.

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
| `games` | `id, sessionId, [sessionId+ordinal], round, played, updatedAt` (rows also carry `stage`/`slot`; not indexed — filtering happens in memory) |
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

## Formats, and who gets ranked

| Format | Sides | Ranked unit |
| --- | --- | --- |
| `singles` | one player | the player |
| `doubles_americano` | pairs that rotate every game | the player |
| `doubles_pairs` | pairs fixed for the session, drawn at random | **the team** |

`doubles_pairs` broke an assumption that held everywhere else: that the thing
which wins a game is a person. With fixed partners it is the team — the team is
what tops the table and what gets seeded into a semifinal.

`utils/entrants.js` is that abstraction. An **entrant** is `{ id, name, playerIds }`:
one player in singles and americano, a pair in `doubles_pairs`. Standings, the
bracket, the podium and the shared results all work on entrants, so none of them
needs to know the format. `sessionStore.sessionEntrants()` builds them; the one
deliberate exception is the player page, which ranks individuals whatever the
format because it is about a person's own record.

**Teams are derived from the games, not stored.** In a fixed-pairs round robin
every game's side *is* a team by construction, so the schedule already carries
the draw. A `teams` column would be a second source of truth that could disagree
with the fixtures — most obviously after a redraw. `teamsFromGames()` recovers
them in first-appearance order.

`resolveBracket` collapses each side to its entrant id before ranking, which is
what lets one `computeStandings` serve both shapes: a pair reduced to its team
key looks exactly like a player to it.

The draw is seeded like every other schedule, so the same seed reproduces the
same teams. **Redraw teams** on the Club tab is `regenerateSchedule` with a fresh
seed; it refuses once anything has been scored.

## The knockout stage

A session can end with a playoff: the top four seeds into semifinals, then a third-place
game and a final. `sessions.playoffs` records that the session was set up with one.

The bracket is **derived, not scheduled**. `generateSchedule({ playoffs: true })` appends
four `games` rows — `sf1`, `sf2`, `bronze`, `final` — with **empty** `team_a`/`team_b`,
because nobody knows who plays a semifinal until the round robin finishes.
`resolveBracket(players, games)` works the line-ups out at render time from the
round-robin standings (seed 1 v 4, seed 2 v 3) and from the earlier knockout results.

Two rules make that safe:

- **Seeding reads round-robin games only.** Counting playoff results towards the table
  that decides the playoffs would be circular. `computeStandings` is therefore always
  called with `roundRobinGames(games)` — on Standings, Today and inside `resolveBracket`.
- **Stored beats derived.** Once a knockout game has a score, `submit_score` has written
  its participants onto the row, and `resolveBracket` uses those. Correcting a
  round-robin score months later reshuffles the seeds but must not rewrite a final that
  has already been played. Clearing a knockout score empties the line-up again, so the
  slot goes back to being derived.

Singles only: the four seeds are individuals, so a semifinal between them is a singles
match. There is no principled way to pair four individuals into two doubles teams, so
Americano sessions are offered no bracket (`canRunPlayoffs`).

## Scoring

Scores are **typed, not tapped up**. Games do not finish in the order they were
scheduled and are usually entered several at a time afterwards, so counting to eleven one
tap at a time was the wrong gesture. `score/ScoreInput.jsx` is the numeric input;
`MatchCard` in `editable` mode saves in place, so any fixture can be scored at any time
from the Matches list. `/score?game=<id>` opens one specific game on the full scoreboard.
Courtside mode keeps tap-to-increment — that screen is for live rally scoring.

> **A component declared inside a render body is a new type every render, so React
> remounts its subtree.** With an `<input>` in that subtree this is a real bug: the field
> loses focus mid-keystroke and a half-typed score is wiped by any unrelated re-render
> (a live score from another phone, a highlight timer). `MatchCard`'s `Side` and
> `BracketSection`'s heading/fixture renderers are at module scope for exactly this
> reason. Both were caught in a browser, not by the unit tests.

## Components worth knowing

| Component | Why it exists |
| --- | --- |
| `fx/FlipList.jsx` | FLIP reordering for the standings table. Children need stable `key`s. |
| `fx/CountUp.jsx` | rAF odometer; falls back to the plain number when effects are off. |
| `fx/Particles.jsx` | One-shot burst on a saved score. |
| `scoreboard/Numeral.jsx` | The big tabular score, with a digit roll when it changes underneath you. |
| `scoreboard/LiveBadge.jsx` | Connection state. The pulse stops when realtime drops, so it's a real indicator. |
| `score/ScoreInput.jsx` | Typed score entry — numeric keypad, select-on-focus, empty means unscored (distinct from 0). |
| `bracket/BracketSection.jsx` | Seeds, semifinals, third-place game, final; locked with a countdown until the round robin ends. |
| `bracket/Podium.jsx` | Champion / runner-up / third. The one deliberately loud surface in the app. |
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
