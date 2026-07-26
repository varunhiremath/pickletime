# 🥒 PickleTime

A tiny web app to help a small group of friends **schedule pickleball games, record scores, and run a tournament-style format** over the weekend.

Built as a single-page app with plain HTML/CSS/JavaScript — no backend, no build step, no accounts. All data is saved locally in your browser.

## Features

- **Add players** — enter everyone playing today.
- **Pick a format:**
  - **Singles** → a round-robin where everyone plays everyone once (byes rotate fairly for odd numbers of players).
  - **Doubles (Americano)** → the popular social format where **partners and opponents rotate every game**, and sit-outs rotate evenly. Perfect for 5–6 players on a single court.
- **Record scores** for each game as you play.
- **Live standings** — an auto-updating leaderboard ranked by wins, then point differential.

## Usage

Open `index.html` in any browser (desktop or phone), or host it for free (see below) and share the link with your group.

1. **Setup** tab — add player names, choose Singles or Doubles (and, for doubles, how many games to schedule).
2. Tap **Generate schedule**.
3. **Schedule** tab — enter each game's score as you finish; the winner is highlighted automatically.
4. **Standings** tab — watch the leaderboard update in real time.

Your players, schedule, and scores persist in the browser's `localStorage`, so you can close the tab and come back later.

## Hosting on GitHub Pages (free)

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick the `main` branch and `/ (root)` folder, and save.
4. After a minute your app will be live at `https://<username>.github.io/pickletime/`.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | App layout and tabs |
| `styles.css` | Styling (pickleball-court theme, mobile-first) |
| `app.js` | Scheduling logic, score tracking, standings, and persistence |

## Ideas for later

- Fixed-partner doubles round robin (teams stay together).
- Knockout/bracket playoff after the round-robin stage.
- Export results to CSV or share a summary image.
- Track history across multiple weekends.

---

Made for weekend pickleball. 🥒
