/* PickleTime — a tiny client-side pickleball scheduler & scorekeeper.
   All state lives in localStorage; no backend required. */

const STORAGE_KEY = "pickletime.v1";

/* ---------- State ---------- */
let state = load() || {
  players: [],        // [{ id, name }]
  format: "singles",  // "singles" | "doubles"
  games: [],          // [{ id, round, teamA:[ids], teamB:[ids], byes:[ids], scoreA, scoreB, played }]
};

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const nameOf = (id) => (state.players.find((p) => p.id === id) || {}).name || "?";
const namesOf = (ids) => ids.map(nameOf).join(" & ");

/* ---------- Schedule generators ---------- */

// Singles round robin via the circle method (fair rotating byes for odd counts).
function generateSinglesSchedule(players) {
  let ids = players.map((p) => p.id);
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids = ids.concat(null); // phantom player = bye
  const n = ids.length;
  const arr = ids.slice();
  const games = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) {
        games.push(makeGame(r + 1, [a], [b], []));
      }
    }
    // rotate everyone except the first element
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return games;
}

// Doubles "Americano": rotate partners & opponents, balance games played & byes.
function generateDoublesSchedule(players, numGames) {
  const ids = players.map((p) => p.id);
  const played = {};
  const partner = {};
  const opponent = {};
  ids.forEach((a) => {
    played[a] = 0;
    partner[a] = {};
    opponent[a] = {};
    ids.forEach((b) => { partner[a][b] = 0; opponent[a][b] = 0; });
  });

  const games = [];
  for (let g = 0; g < numGames; g++) {
    // pick the 4 least-played players (random tie-break keeps it varied)
    const sorted = ids.slice().sort((a, b) => played[a] - played[b] || Math.random() - 0.5);
    const four = sorted.slice(0, 4);

    // choose the team split that best avoids repeat partners/opponents
    const splits = [
      [[four[0], four[1]], [four[2], four[3]]],
      [[four[0], four[2]], [four[1], four[3]]],
      [[four[0], four[3]], [four[1], four[2]]],
    ];
    let best = splits[0];
    let bestCost = Infinity;
    for (const [t1, t2] of splits) {
      let cost = partner[t1[0]][t1[1]] * 3 + partner[t2[0]][t2[1]] * 3;
      for (const x of t1) for (const y of t2) cost += opponent[x][y];
      if (cost < bestCost) { bestCost = cost; best = [t1, t2]; }
    }
    const [t1, t2] = best;
    const inGame = new Set(four);
    const byes = ids.filter((id) => !inGame.has(id));

    games.push(makeGame(g + 1, t1, t2, byes));

    four.forEach((id) => played[id]++);
    partner[t1[0]][t1[1]]++; partner[t1[1]][t1[0]]++;
    partner[t2[0]][t2[1]]++; partner[t2[1]][t2[0]]++;
    for (const x of t1) for (const y of t2) { opponent[x][y]++; opponent[y][x]++; }
  }
  return games;
}

function makeGame(round, teamA, teamB, byes) {
  return { id: uid(), round, teamA, teamB, byes, scoreA: null, scoreB: null, played: false };
}

/* ---------- Standings ---------- */
function computeStandings() {
  const stats = {};
  state.players.forEach((p) => {
    stats[p.id] = { id: p.id, name: p.name, gp: 0, w: 0, l: 0, pf: 0, pa: 0 };
  });
  for (const g of state.games) {
    if (!g.played || g.scoreA == null || g.scoreB == null) continue;
    const aWon = g.scoreA > g.scoreB;
    const tie = g.scoreA === g.scoreB;
    for (const id of g.teamA) {
      const s = stats[id]; if (!s) continue;
      s.gp++; s.pf += g.scoreA; s.pa += g.scoreB;
      if (!tie) (aWon ? s.w++ : s.l++);
    }
    for (const id of g.teamB) {
      const s = stats[id]; if (!s) continue;
      s.gp++; s.pf += g.scoreB; s.pa += g.scoreA;
      if (!tie) (aWon ? s.l++ : s.w++);
    }
  }
  return Object.values(stats).sort(
    (a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf || a.name.localeCompare(b.name)
  );
}

/* ---------- Rendering ---------- */

function renderPlayers() {
  const list = document.getElementById("playerList");
  list.innerHTML = "";
  if (state.players.length === 0) addPlayer(); // ensure at least one row exists
  state.players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "player-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Player name";
    input.value = p.name;
    input.addEventListener("input", () => { p.name = input.value; save(); });
    const rm = document.createElement("button");
    rm.className = "remove-btn";
    rm.textContent = "×";
    rm.title = "Remove";
    rm.addEventListener("click", () => {
      state.players = state.players.filter((x) => x.id !== p.id);
      save(); renderPlayers();
    });
    row.append(input, rm);
    list.append(row);
  });
}

function addPlayer() {
  state.players.push({ id: uid(), name: "" });
  save();
  renderPlayers();
}

function renderSchedule() {
  const listEl = document.getElementById("gameList");
  const emptyEl = document.getElementById("noSchedule");
  const metaEl = document.getElementById("scheduleMeta");
  listEl.innerHTML = "";

  if (state.games.length === 0) {
    emptyEl.style.display = "block";
    metaEl.textContent = "";
    return;
  }
  emptyEl.style.display = "none";
  metaEl.textContent =
    `${state.format === "singles" ? "Singles round robin" : "Doubles (Americano)"} · ` +
    `${state.games.length} games · ${state.games.filter((g) => g.played).length} played`;

  state.games.forEach((g, idx) => {
    const card = document.createElement("div");
    card.className = "game-card" + (g.played ? " played" : "");

    const aWon = g.played && g.scoreA > g.scoreB;
    const bWon = g.played && g.scoreB > g.scoreA;

    card.innerHTML = `
      <div class="game-round">Game ${idx + 1}${state.format === "singles" ? " · Round " + g.round : ""}</div>
      <div class="matchup">
        <div class="team team-left ${aWon ? "winner" : ""}">
          <div class="team-names">${namesOf(g.teamA)}</div>
          <div class="score-row">
            <input class="score-input" type="number" min="0" inputmode="numeric"
                   value="${g.scoreA ?? ""}" data-game="${g.id}" data-side="A" />
          </div>
        </div>
        <div class="vs">vs</div>
        <div class="team team-right ${bWon ? "winner" : ""}">
          <div class="team-names">${namesOf(g.teamB)}</div>
          <div class="score-row">
            <input class="score-input" type="number" min="0" inputmode="numeric"
                   value="${g.scoreB ?? ""}" data-game="${g.id}" data-side="B" />
          </div>
        </div>
      </div>
      ${g.byes.length ? `<div class="byes">Sitting out: ${namesOf(g.byes)}</div>` : ""}
    `;
    listEl.append(card);
  });

  listEl.querySelectorAll(".score-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const g = state.games.find((x) => x.id === inp.dataset.game);
      if (!g) return;
      const val = inp.value === "" ? null : parseInt(inp.value, 10);
      if (inp.dataset.side === "A") g.scoreA = val; else g.scoreB = val;
      g.played = g.scoreA != null && g.scoreB != null;
      save();
      renderSchedule();
      renderStandings();
    });
  });
}

function renderStandings() {
  const wrap = document.getElementById("standingsTable");
  const emptyEl = document.getElementById("noStandings");
  const hintEl = document.getElementById("standingsHint");
  const rows = computeStandings();
  const anyPlayed = state.games.some((g) => g.played);

  if (!anyPlayed || rows.length === 0) {
    wrap.innerHTML = "";
    emptyEl.style.display = "block";
    hintEl.textContent = "";
    return;
  }
  emptyEl.style.display = "none";
  hintEl.textContent = "Ranked by wins, then point differential.";

  wrap.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr><th>Player</th><th>GP</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th></tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="rank-${i + 1}">
            <td><span class="rank-badge">${i + 1}.</span> ${r.name || "—"}</td>
            <td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td>
            <td>${r.pf}</td><td>${r.pa}</td>
            <td>${r.pf - r.pa > 0 ? "+" : ""}${r.pf - r.pa}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

/* ---------- Setup actions ---------- */
function updatePerPlayerHint() {
  const named = state.players.filter((p) => p.name.trim()).length;
  const n = document.getElementById("numGames").value || 0;
  const hint = document.getElementById("perPlayerHint");
  if (named >= 4 && n > 0) {
    const perPlayer = ((n * 4) / named).toFixed(1);
    hint.textContent = `≈ ${perPlayer} games per player across ${named} players.`;
  } else {
    hint.textContent = "";
  }
}

function generate() {
  const err = document.getElementById("setupError");
  err.textContent = "";
  const named = state.players.filter((p) => p.name.trim());
  // drop unnamed players so they don't appear in the schedule
  state.players = named;

  if (state.format === "singles" && named.length < 2) {
    err.textContent = "Add at least 2 players for singles.";
    return;
  }
  if (state.format === "doubles" && named.length < 4) {
    err.textContent = "Add at least 4 players for doubles.";
    return;
  }

  if (state.format === "singles") {
    state.games = generateSinglesSchedule(named);
  } else {
    const numGames = Math.max(1, parseInt(document.getElementById("numGames").value, 10) || 8);
    state.games = generateDoublesSchedule(named, numGames);
  }
  save();
  renderPlayers();
  renderSchedule();
  renderStandings();
  switchTab("schedule");
}

/* ---------- Tabs ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("active", p.id === name));
}

/* ---------- Init ---------- */
function init() {
  renderPlayers();
  renderSchedule();
  renderStandings();

  // restore saved format selection
  document.querySelector(`input[name="format"][value="${state.format}"]`).checked = true;
  document.getElementById("doublesOptions").classList.toggle("hidden", state.format !== "doubles");

  document.getElementById("addPlayerBtn").addEventListener("click", addPlayer);
  document.getElementById("generateBtn").addEventListener("click", generate);
  document.getElementById("numGames").addEventListener("input", updatePerPlayerHint);

  document.querySelectorAll('input[name="format"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.format = radio.value;
      save();
      document.getElementById("doublesOptions").classList.toggle("hidden", state.format !== "doubles");
      updatePerPlayerHint();
    });
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("Clear the schedule and all scores? Players are kept.")) {
      state.games = [];
      save();
      renderSchedule();
      renderStandings();
    }
  });

  updatePerPlayerHint();
}

document.addEventListener("DOMContentLoaded", init);
