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
| `schedule.js` | `FORMATS`, `isTeamFormat`, `circleMethod`, `generateSingles`, `generatePairs`, `generateAmericano`, `generateSchedule`, `rebuildPlayoffs`, `assignCourts`, `gamesPerPlayer`, `playoffShape`, `playoffShapesFor`, `resolvePlayoffShape`, `canRunPlayoffs`. |
| `entrants.js` | `teamKey`, `teamsFromGames`, `sessionEntrants`, `gamesByEntrant`, `entrantSize` — who is being ranked. |
| `teamDraft.js` | `unpaired`, `isComplete`, `tapPlayer`, `breakTeam`, `fillRemaining`, `drawAll`, `pruneToField`, `draftStatus` — the state machine behind picking teams by hand. |
| `bracket.js` | `STAGE`, `SLOT`, `SHAPES`, `BRACKET_SLOTS`, `PAGE_SLOTS`, `FINAL_ONLY_SLOTS`, `slotsForShape`, `shapeOf`, `isRoundRobin`/`isKnockout`, `roundRobinGames`/`knockoutGames`, `outcome`, `buildBracketGames`, `resolveBracket`, `slotLabel`/`slotShortLabel`. |
| `bracketTree.js` | `seedsOf`, `seedLabel`, `bracketTree`, `bracketTreeLines` — the bracket as a tree of nodes, and as the text that goes in the group chat. |
| `sessionShare.js` | `formatSessionDate`, `formatSessionTime`, `formatLabel`, `sessionWhen`, `announcement`, `buildSessionShare`, `buildResultsShare` — what the announcement and the results say, as data and as text. |
| `sessionName.js` | `parseIsoDate`, `playLabel`, `formatClockTime`, `defaultSessionName`, `nameCarriesDate`, `nameCarriesTime` — what a session is called when nobody types a name. |
| `sessionState.js` | `unplayedCount`, `isSessionOver`, `endedEarly`, `sessionOutcome` — whether a session is still going. |
| `sets.js` | `BEST_OF`, `isMultiSet`, `setPairs`, `setsWon`, `aggregate`, `winnerOf`, `isDecided`, `displayScore`, `setsLine`, `normaliseSets`, `setsStatus` — matches played as sets. `normaliseSets` returns `{ ok, decided }`: **`ok` means worth saving, `decided` means somebody has won two sets**, and only `decided` makes a match played. |
| `standings.js` | `computeStandings`, `currentStreak`, `rankHistory`, `headToHead`, `partnerRecords`, `sessionProgress`. |
| `inviteCode.js` | `generateInviteCode`, `normalizeInviteCode`, `hashInviteCode` — Crockford base32, ambiguous glyphs excluded. |
| `outboxMerge.js` | `collapseOutbox`, `detectConflict`, `planFlush`, `applyPending`, `mergeRemote`, `describeConflict`. |
| `legacyImport.js` | `readLegacyState`, `hasImportableData`, `convertLegacyState` — one-shot v1 → v2 migration. |
| `contrast.js` | `luminance`, `contrastRatio`, `meetsAA`, `readableTextOn`. |
| `theme.js` | `resolveTheme`, `applyTheme`, `watchSystemTheme`. |
| `uuid.js` | `uuid` — v4, with a `getRandomValues` fallback for Safari before 15.4. |
| `platform.js` | `isIos`, `isStandalone`, `shouldOfferIosInstall`, `readEnv`. |
| `sound.js` | `playTick`, `playChime`, `playFanfare`, `playError` — WebAudio, no asset files. |

Four files sit next to these but are **not** node-tested, because they need a
browser rather than because they are exempt: `shareCanvas.js` (the palette, type
scale and canvas primitives), `resultsImage.js` (`renderResultsPng`) and
`sessionImage.js` (`renderSessionPng`), which paint the two shareable cards, and
`share.js` (`shareText`, `shareFile`), which drives the OS share sheet. All are
verified by driving the real app. What they *say* is derived by tested pure code —
`bracketTree.js` and `sessionShare.js` `announcement()` — so only the layout is
unproven by unit tests.

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

**`set_member_role` is an RPC for a reason too.** `members_update` already lets an
admin write any row in their club, so promoting somebody could have been a plain
update. It isn't, because no policy can express *"there must always be at least one
admin left"* — and the last admin demoting themselves would lock the club out of
ever starting another session, with no route back. Admin is what gates creating a
session, so that rule has to live where the client cannot skip it.

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
  `identity`, `connection`, `pending`, `recentlyChanged`, `openedSessionId`. One store
  rather than a hook per table, because every screen needs an overlapping slice and one
  refresh keeps them mutually consistent. `openSession(id)` pins a past session from
  History across refreshes; `followActive()` unpins it and jumps back to the live one —
  which is what creating a session does, so a new schedule is what you land on.
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

| Format | Sides | Ranked unit | Finish |
| --- | --- | --- | --- |
| `singles` | one player | the player | knockout bracket |
| `doubles_americano` | pairs that rotate every game | the player | one deciding game |
| `doubles_pairs` | pairs fixed for the session | **the team** | knockout bracket |

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

`resolveBracket` collapses each side to **the entrants it credits** before
ranking, which is what lets one `computeStandings` serve all three shapes: a pair
reduced to its team key looks exactly like a player to it.

> Matching only whole sides against team keys was a real bug. An Americano side
> is two players and its entrants are individuals, so no team key ever matched
> and **every Americano round-robin game was silently dropped** — the table read
> 0-0-0 for everybody and the final was seeded by name order. A side now maps to
> one entrant when it *is* one (fixed pairs) and to each of its players when it
> is not (Americano, singles). Guarded by "credits both players on an Americano
> side" in `bracket.test.js`.

**Teams can be drawn or entered.** A social morning wants a random draw; a real
doubles competition is the other way round, because pairs register together. Both
go through the same picker (`components/club/TeamPicker.jsx`, logic in
`utils/teamDraft.js`), which opens on a random draw and lets any pairing be
broken and re-made — in practice a session is usually both, with a few pairs who
came together and the rest made up on the day.

`generateSchedule({ teams })` uses given partnerships verbatim and ignores the
seed; omitting `teams` draws them from the seed as before. Hand-entered teams are
validated rather than repaired — a duplicated or missing player rejects the whole
set, because a partial fix would silently produce a tournament nobody agreed to.

**Edit teams** on the Club tab re-enters the same picker for a live session,
seeded from `teamsFromGames`, and applies the result through
`regenerateSchedule(id, { teams })`. It refuses once anything has been scored, and
says so *before* the work rather than after it.

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

There are three shapes. `playoffShapesFor(format)` says which a format may run,
`resolvePlayoffShape()` turns a request into one, and `shapeOf(games)` reads it back off
the fixtures — derived, not stored, for the same reason the pairs draw is.

- `SHAPES.KNOCKOUT` — singles and `doubles_pairs`. Semifinals 1v4 and 2v3, a third-place
  game and a final. Lose once and you are out.
- `SHAPES.PAGE` — the [Page playoff system](https://en.wikipedia.org/wiki/Page_playoff_system),
  singles and `doubles_pairs`. Five fixtures over three rounds:

  | | | |
  | --- | --- | --- |
  | Qualifying final | 1 v 2 | winner → grand final |
  | Elimination final | 3 v 4 | loser is done |
  | Preliminary final | QF loser v EF winner | winner → grand final |
  | 3rd place | EF loser v PF loser | |
  | Grand final | QF winner v PF winner | |

  The point of it is that topping the table is worth something: seeds 1 and 2 get **two**
  chances at the grand final, 3 and 4 get one. The third-place game is an addition — in
  the system as described the preliminary final's loser simply finishes third — so that
  the two knocked-out sides play it off and everyone gets the same number of games.
- `SHAPES.FINAL_ONLY` — Americano. Partners rotate all session, so there is no standing
  team to seed; the convention is one deciding game pairing seeds 1 & 4 against 2 & 3.
  Four players make only two teams, and two teams cannot fill a bracket. The winners are
  a partnership that exists for that one game and has no row in the table, so
  `resolveBracket` builds a synthetic row for the podium. Americano cannot run the Page
  system for the same reason: nothing survives three rounds.

**A shape is a table, not a branch.** Each entry in `BRACKET_SLOTS` / `PAGE_SLOTS` /
`FINAL_ONLY_SLOTS` carries not just where its players come from (`seeds`, `feeds`,
`pairs`) but how it is presented — its `label`, `short` name, `group` heading, what
winning it is `advance`-worth, and any `medal`. `resolveBracket` copies those onto each
match, so the bracket screen, the text tree and the picture all read them rather than
each deciding for itself. Adding the Page system needed no new branch in any of the three.

> `slotLabel(game, shape)` takes the shape for a reason: `'final'` is the **Final** of a
> knockout and the **Grand final** of a Page playoff, and a lookup across a concatenated
> list would name half of them wrong.

The Page rounds reuse `stage = 'sf'`, so **adding the shape needed no database change** —
`stage` is a coarse round-robin/knockout marker and `slot` is what identifies a fixture.

**The finish can be changed after the round robin has started.** `setPlayoffShape()`
(both backends) tears down the playoff fixtures and rebuilds them from
`schedule.rebuildPlayoffs()`, which re-derives the bracket off the existing round-robin
games and re-runs court assignment — the round robin and every score in it are never
touched. It refuses once a playoff game has a score. `regenerateSchedule()` cannot do
this job: it refuses to run at all once anything is scored, and by the time anybody
wants a different finish, half the round robin has been played. The UI is
`club/PlayoffModal.jsx`, reachable from ClubPage ("Change the finish") and from the
Playoffs heading on Matches, which is where people look for it.

## When a session is over

`sessions.status` existed in the schema from the start and both backends could
write it — but **no screen ever did**, so every session stayed `live` forever and
the app looked, on a Wednesday, exactly as it had on Sunday with a game on court.

`isSessionOver({ session, games })` answers it, and is **derived first, stored
second** — the same rule the bracket line-ups follow:

- **every fixture has a score** → over. Derived, so it needs no write, no
  permission, and is the same answer on every phone the instant the last score
  lands. This is the normal case and nothing is stored for it.
- **an admin said so** → over. The only thing the games cannot express: the
  evening that ran out of daylight with four games unplayed. This is the *only*
  reason `status` is written, from "Finish the session" on the club screen, and
  `endedEarly()` is what offers "Reopen the session" back.

Being over changes three things. The club card's chip reads **finished** instead
of **live**; every mid-session control (reshuffle, edit teams, change the finish,
announce) disappears, because offering them under a finished session is a trap;
and Today swaps the running layout for a recap — result, your line, share, final
table, and *"Ready for the next one?"*. Today is a **different render**, not the
running one greyed out: "on court" and "you play next" are lies once there is
nothing to play, and leaving them up was the whole bug.

> `getActiveSession()` is now simply **the newest session**. It used to be "the
> newest one not marked final", which hid a trap: finishing today's session
> would hand the app back an abandoned one from three weeks ago, because that
> older row was still marked live.

## What a session is called

A session names itself: **`Sept 13 · Sunday Doubles`** — the date, then the day and
what was played. "Session", "Session (2)" and "Saturday morning" told you nothing in a
History list six weeks later. Both kinds of doubles are just "Doubles" in a name; the
exact format is on the line underneath and in the pictures, and spelling it out
truncates on a phone.

It is a **default, not a rule**. The field opens pre-filled and follows the date and
format as you change them, but the moment you type something it is yours and is never
overwritten. Two sessions on one day are common, so the second carries its start time
(`… · 6:00 pm`), falling back to a counter when there is no time to tell them apart.

**A name that says the date means nothing else should.** `sessionWhen(session)` is the
one place that decides what goes on the line under the name — and it drops the date, or
the time, when `nameCarriesDate`/`nameCarriesTime` find it in the name already. It asks
the name rather than assuming it was generated, so a hand-typed "Sept 13 grudge match"
de-duplicates too and a session called "Doubles" still gets its date. Every caption,
share, picture subtitle, the club card and the History row read from it, so there is no
second place to keep in step.

> The new-session sheet defaults its date from **local** parts, not `toISOString()` —
> that is UTC, so anybody west of Greenwich setting up an evening session was handed
> tomorrow's date. Invisible while the field said "Saturday morning"; obvious the moment
> the name says the day.

## Sharing

There is no push notification — a static site cannot send one — so the group chat is
how a session gets announced and how results reach people who weren't there. **Both are
pictures by default.** A paragraph scrolls past in a group chat; a card does not.

Two cards, both painted on a canvas via `utils/shareCanvas.js`:

- `sessionImage.js` — the announcement: format, teams, round 1, who is sitting out.
- `resultsImage.js` — the whole result: podium, bracket, round-robin table. Carrying
  the table is what lets it *replace* the text rather than decorate it, and it is what
  makes it work for a session played without playoffs.

Drawn straight onto a 2D canvas rather than rasterised from SVG or HTML. Both of those
routes have historically tainted the canvas on WebKit, which would make `toBlob()` throw
on exactly the phones half this club uses. The palette is hard-coded dark rather than
read from the tokens: a shared image is not theme-aware and must not come out different
depending on what the sharer had their phone set to.

**What they say is derived by tested pure code, not by the painters.**
`utils/bracketTree.js` turns the flat list of matches into a tree — who came in on which
seed, who beat whom, what the win was worth — and `announcement()` in `sessionShare.js`
does the same for a session. Each has a text renderer as well, so the message and the
picture cannot drift apart.

**The picture goes with a caption, in one share call.** A picture cannot carry a
tappable link, so `buildResultsCaption` / `buildSessionCaption` add two lines — what it
is, and the URL. `shareFile()` offers payloads to `canShare()` widest-first
(`{files, text, title}`, then `{files, title}`), because some platforms accept files,
accept text, and reject the two together — and calling `share()` with a payload
`canShare()` rejects throws. Android sends both. **iOS is known to drop `text` when
files are attached**, which is survivable rather than silent here: the link is also drawn
into the image's footer. On desktop, where files cannot be shared at all, the image
downloads and the caption goes to the clipboard.

The full text is still reachable behind a quiet "instead" link. Those renderers pad
nothing for alignment — chat apps use proportional fonts, so columns arrive ragged;
leading indentation on a `↳` line survives, inter-column spacing does not.

## Matches played as sets

A playoff is often best of three to 11 rather than one game to 11, and which
matches those are is decided on the day — so it is a property of the **game**, not
of the session. Any fixture can be switched, on the match card or the Score page.

`games.sets_a` / `games.sets_b` hold the set scores; empty means a single game,
which is what every row written before this existed is. `score_a` / `score_b`
stay alongside them holding the **total points across the sets**, so points for,
against and difference keep counting what they always counted.

> **The winner of a best-of-three is not always the side that scored more
> points.** 11–9, 5–11, 11–9 is won two sets to one by a side that scored 27 to
> 29. Every place that decided a winner by comparing the two totals was therefore
> wrong for a set match — `standings.js` and `bracket.js` `outcome()` both call
> `winnerOf()` from `utils/sets.js` instead, and so do the match card, the Today
> page and the shares. **Never reintroduce `scoreA > scoreB`.**

A best-of-three needs **two** sets, not a lead: one set played is 1–0 and decides
nothing, and neither does 1–1. Both are matches in progress, and calling either a
win would put the wrong side into a final.

That is a statement about `played`, not about saving. **Each set saves on its own**
— people enter a set between games, not the whole match at the end — and the match
stays unplayed, out of the standings and unable to feed a bracket until somebody has
two. `normaliseSets` splits the two questions (`ok` = worth saving, `decided` =
somebody won it) and both backends store sets whenever there is a score, clearing
them only when the score itself is cleared. The match card says "In progress" over a
1–0 rather than "Not played".

The totals are derived from the sets by `submit_score()` and by the local
backend, never taken from the caller, so the two can never disagree.

In the table, a set match counts as **one win** and contributes **all its points**
to the difference. A round robin mixing single games with three-setters therefore
has a bigger point swing on the longer matches — which is a true statement about
what was played. Playoff games never feed the table at all (seeding reads
round-robin games only), which is where sets are usually used.

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

## iPhone

The app is a PWA, so iPhone friends get the same thing Android does — but Safari
differs in ways that are not all feature-detectable.

**Install is invisible.** Safari has no install prompt; "Add to Home Screen" is
partway down the Share sheet and nobody finds it unaided. `IosInstallHint` says
so once, dismissibly, and only when `shouldOfferIosInstall()` — iOS and not
already standalone. Android and desktop are left alone, because they prompt for
themselves.

**`index.html` carries the Apple meta tags.** Without
`apple-mobile-web-app-capable` an installed app can open inside Safari chrome
rather than standalone. The status bar is `black` rather than
`black-translucent`: translucent would let the app's own background run under it
(the safe-area padding already handles that) but it forces light status-bar
text, and the light theme would then be white on near-white.

**`crypto.randomUUID` is Safari 15.4+.** It generates every club, member,
session and game id, so its absence would not degrade — creating a club would
throw. `utils/uuid.js` falls back to `getRandomValues`, which Safari has had
since 6.

**`color-mix` is Safari 16.2+,** and an unparseable colour inside a gradient
invalidates the whole gradient — the champion podium would have lost its gold
field entirely. The two load-bearing uses moved to `.gold-field` / `.clay-tint`
in `index.css`, where a plain first declaration acts as the fallback. That trick
only works for ordinary properties: a custom property holds the unparsed token
stream and fails later, at computed-value time, so it cannot be used there.
The remaining `color-mix` uses are tints whose meaning is carried by a border or
text colour, so they degrade to untinted rather than to invisible.

**What simply does not work on iOS, by design:** `navigator.vibrate` (no haptics
— guarded with `?.`), and Wake Lock before iOS 16.4, so Courtside mode may let
an older iPhone sleep. Both are already optional-chained and degrade silently.

**Testing.** No WebKit is available in this environment, so browser checks run
Chromium at iPhone metrics. That proves layout, tap targets and our own platform
logic — including a simulated pre-15.4 iPhone with `crypto.randomUUID` deleted —
but it does **not** prove WebKit engine behaviour. Real-device checks stay
manual.

## Components worth knowing

| Component | Why it exists |
| --- | --- |
| `fx/FlipList.jsx` | FLIP reordering for the standings table. Children need stable `key`s. |
| `fx/CountUp.jsx` | rAF odometer; falls back to the plain number when effects are off. |
| `fx/Particles.jsx` | One-shot burst on a saved score. |
| `scoreboard/Numeral.jsx` | The big tabular score, with a digit roll when it changes underneath you. |
| `scoreboard/LiveBadge.jsx` | **Connection** state — "Synced" / "Connecting" / "Offline" / "This device". The pulse stops when realtime drops, so it's a real indicator. It said "Live" until that got read as the session: the club card labels a running session "live" too, and a header pulsing "Live" over a finished session looks like a bug. This badge has never had anything to do with the session. |
| `score/ScoreInput.jsx` | Typed score entry — numeric keypad, select-on-focus, empty means unscored (distinct from 0). |
| `bracket/BracketSection.jsx` | Seeds, semifinals, third-place game, final; locked with a countdown until the round robin ends. |
| `bracket/Podium.jsx` | Champion / runner-up / third. The one deliberately loud surface in the app. |
| `club/PlayoffModal.jsx` | Change the finish mid-session. Refuses once a playoff game is scored. |
| `club/ShapeChoice.jsx` | `SHAPE_COPY` plus the selectable card. Shared by the new-session sheet and the change-the-finish sheet so the two describe a shape identically. |
| `club/InviteRow.jsx` | The three invite states. **Joined is not the end of it** — somebody who never installed the app loses it when the chat scrolls, so a joined row still offers "Send the link" (the app address plus how to keep it on the home screen). |
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
