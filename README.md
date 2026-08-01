# 🥒 PickleTime

Schedule pickleball games, enter scores together, and watch the standings move.

An installable app (PWA today, Android APK to follow) for a group of friends who play
regularly. One person is the admin and sets up sessions; everyone can enter scores.

---

## What it does

- **Schedules** — singles round robin (everyone plays everyone once, byes rotate fairly)
  or doubles **Americano** (partners and opponents rotate every game). Multiple courts
  supported, so eight players on two nets play two games at once.
- **Scoring** — a big two-sided scoreboard built for tapping while holding a paddle,
  plus a full-screen **Courtside mode** you can prop against a bag and read from the
  other side of the net.
- **Standings** — a real league table: wins, losses, point differential, streaks, with
  rows that animate into their new positions as results land.
- **Player pages** — head-to-head record against everyone, and your record with each
  partner.
- **Works offline** — everything is stored on the device and the app opens instantly
  with no signal, which is what courts usually have.

## Status

**Sprint 1 of 5.** The app is complete and usable as a single-device PWA. Shared,
multi-device data (Supabase) is Sprint 2 — see [`docs/ROADMAP.md`](docs/ROADMAP.md).

If you used the original PickleTime, your players, schedule and scores are **imported
automatically** the first time you open this version.

## Install

Open the app in a browser and use **Add to Home Screen** — it installs like a native
app and works offline. An Android APK will be published to Releases in Sprint 5;
iPhone stays on the PWA.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/pickletime/
npm test         # vitest — pure logic
npm run build    # production bundle
```

Regenerate the app icons after changing `public/icon.svg`:

```bash
node scripts/make-icons.mjs
```

## Deploying

CI (`.github/workflows/deploy.yml`) runs the tests and the build on every PR, and
publishes `main` to GitHub Pages.

> **One-time setup:** GitHub → Settings → Pages → **Source: GitHub Actions**.
> The old deploy-from-a-branch setting will not serve this build.

## How it's put together

| Path | What's in it |
| --- | --- |
| `src/utils/` | Pure logic — scheduling, standings, invite codes, contrast. Every file has a co-located `*.test.js`. |
| `src/sync/` | The backend seam. `localBackend.js` today; `supabaseBackend.js` slots in behind the same interface. |
| `src/db/` | Dexie/IndexedDB local mirror and offline outbox. |
| `src/pages/` | One file per route. |
| `src/styles/tokens.css` | The palette. Single source of truth for both themes. |
| `docs/` | Architecture, guidelines, roadmap. |

Full map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

Made for weekend pickleball. 🥒
