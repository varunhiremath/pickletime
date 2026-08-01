# Guidelines

Standing rules for work on PickleTime.

## Product

- **A group app, not a solo app.** Everyone can enter scores; the admin runs the roster
  and the schedule. Any feature that only works for one person is the wrong feature.
- **Honest about the network.** No pretending. If a write is queued, say so; if realtime
  is down, the LIVE badge stops pulsing. Never show a synced-looking UI over stale data.
- **Fast to score.** Entering a score is the most frequent action during a session and
  is the thing competing apps are judged on. Every tap on that path is worth arguing over.

## Engineering

- **Pure logic → `src/utils/*.js` with a co-located `*.test.js`.** If a feature has real
  logic (scheduling, ranking, merging, formatting), extract the pure core and test it.
  UI and Dexie code is verified by review plus the on-device checklist.
- **No `Math.random()` in anything that must be reproducible.** Take a seeded RNG
  (`utils/rng.js`). And never randomise inside a sort comparator — that isn't a
  consistent comparator, which is a real bug, not a style point.
- **The backend seam is load-bearing.** Pages talk to `getBackend()`, never to Dexie or
  Supabase directly. A new screen that imports `db` is a mistake.
- **DB migrations are append-only** `db.version(n)` blocks in `src/db/db.js`. Never edit
  a shipped version. Index only what you query.
- **One write path for scores.** Everything goes through `submitScore`, which appends to
  the audit log in the same transaction.

## Data integrity

- Anything addable must be **editable and deletable**.
- **Deletes revert derived data.** Removing a player removes their fixtures and score
  events and renumbers the session. Deleting a session removes its games and history.
  A half-deleted entity that leaves standings referencing a ghost is a bug.
- Refuse destructive operations that would silently lose results — `regenerateSchedule`
  errors if anything has been scored rather than discarding the scores.

## UX

- Android-first, one hand, big tap targets. Content over chrome.
- Modals **portal to `document.body`** and cap at 90vh (`ui/Modal.jsx`). Any ancestor
  with a `transform` becomes the containing block for `position: fixed` children and
  will silently trap a full-screen overlay.
- Use the themed dialogs (`uiStore` `confirm`/`prompt`/`toast` via `UiHost`) — never
  `window.confirm`/`prompt`/`alert`.
- Destructive actions confirm, and say what else gets deleted.

## Design

- **`src/styles/tokens.css` is the source of truth.** Components reference `var(--token)`.
  Don't hardcode hex in a component.
- **Text on `--optic` or `--gold` is `--text-on-accent`, never white.** These are very
  light fills; white on them fails contrast. Use `--optic-ink`/`--gold-ink` when the
  accent needs to be *text* on a light surface. `styles/tokens.test.js` enforces this.
- **Every number that can change gets tabular figures.** Use `.num` or `.font-display`.
- Both themes are first class. Dark is the default because scoreboards read as sport;
  light exists because phones win in direct sunlight. Check any new screen in both.
- Motion is transform/opacity only, and gated on `settingsStore.effects` **and**
  `prefers-reduced-motion`.

## Verification

The sandbox can build and run the app, so use that rather than guessing:

1. `npm test` — the pure logic.
2. `npm run build` — catches broken imports and assets that tests miss.
3. Drive the built app with Playwright against `/opt/pw-browsers/chromium-1194/...`
   and **look at the screenshots**. A green build is not evidence that a screen renders.
4. Check both themes and, for Courtside, both orientations.

## Workflow

- Develop on `claude/pickleball-app-conversion-h6bjic`. One PR per sprint.
- Wait for CI green before merging.
- Never commit a model identifier in any artifact.
