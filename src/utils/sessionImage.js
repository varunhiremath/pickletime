// The picture you post to tell everyone a session is on.
//
// The app has no push notifications — a static site cannot send them — so the
// group chat is how people actually find out. A block of text scrolls past; a
// card with the teams on it does not, which is the whole reason this exists.
//
// What it says comes from announcement() in utils/sessionShare.js, the same
// derivation the text message uses. This file only decides where to put it.

import {
  C, W, PAD, font, newCanvas, toPng, clip, roundRect, card, header, footer, FOOTER_H,
} from './shareCanvas.js';
import { announcement } from './sessionShare.js';

const CHIP_H = 38;
const TEAM_H = 52;
const FIXTURE_H = 58;

/**
 * Render the session announcement to a PNG.
 *
 * @returns {Promise<Blob|null>}  null when there is no session to announce.
 */
export async function renderSessionPng({
  session, games = [], members = [], clubName, url, scale = 2,
} = {}) {
  const a = announcement({ session, games });
  if (!a) return null;

  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '—';
  const namesOf = (ids) => (ids ?? []).map(nameOf).join(' & ');

  const plan = layout(a, url);

  const made = newCanvas(plan.height, scale);
  if (!made) return null;
  paint(made.ctx, plan, { a, namesOf, nameOf, clubName, url });

  return toPng(made.canvas);
}

function layout(a, url) {
  let y = 132; // header always has a subtitle here — the date, or the club

  const chips = { y, h: CHIP_H };
  y += CHIP_H + 28;

  const teams = a.teams.length > 0
    ? { x: PAD, y, w: W - PAD * 2, h: 46 + a.teams.length * TEAM_H + 14 }
    : null;
  if (teams) y += teams.h + 26;

  const round1 = a.round1.length > 0
    ? {
        x: PAD, y, w: W - PAD * 2,
        h: 46 + a.round1.length * FIXTURE_H + (a.byes.length > 0 ? 44 : 0) + 14,
      }
    : null;
  if (round1) y += round1.h + 26;

  return { chips, teams, round1, height: Math.round(y + FOOTER_H(url)) };
}

function paint(ctx, plan, { a, namesOf, nameOf, clubName, url }) {
  header(ctx, {
    title: a.name,
    subtitle: [a.when, clubName].filter(Boolean).join(' · '),
  });

  drawChips(ctx, plan.chips.y, a.details);
  if (plan.teams) drawTeams(ctx, plan.teams, { teams: a.teams, namesOf });
  if (plan.round1) drawRound1(ctx, plan.round1, { a, namesOf, nameOf });

  footer(ctx, {
    height: plan.height,
    note: a.playing > 0 ? `${a.playing} playing` : null,
    url,
  });
}

/** Format, game count, target score — a row of pills rather than a sentence. */
function drawChips(ctx, y, details) {
  let x = PAD;
  ctx.font = font(700, 20);
  for (const text of details) {
    const w = ctx.measureText(text).width + 32;
    if (x + w > W - PAD) break; // rather than run off the edge
    roundRect(ctx, x, y, w, CHIP_H, CHIP_H / 2);
    ctx.fillStyle = C.raised;
    ctx.fill();
    ctx.fillStyle = C.textLo;
    ctx.font = font(700, 20);
    ctx.fillText(text, x + 16, y + 25);
    x += w + 10;
  }
}

function drawTeams(ctx, { x, y, w, h }, { teams, namesOf }) {
  card(ctx, { x, y, w, h, label: 'Teams' });

  teams.forEach((side, i) => {
    const ry = y + 46 + i * TEAM_H;
    const midY = ry + TEAM_H / 2 + 8;

    // Numbered disc, the same one the team picker uses in the app.
    roundRect(ctx, x + 22, midY - 21, 28, 28, 14);
    ctx.fillStyle = C.optic;
    ctx.fill();
    ctx.fillStyle = C.onAccent;
    ctx.font = font(800, 17);
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 36, midY - 1);
    ctx.textAlign = 'left';

    ctx.fillStyle = C.textHi;
    ctx.font = font(700, 26);
    ctx.fillText(clip(ctx, namesOf(side), w - 100), x + 64, midY);
  });
}

function drawRound1(ctx, { x, y, w, h }, { a, namesOf, nameOf }) {
  card(ctx, { x, y, w, h, label: 'Round 1' });

  const midX = x + w / 2;

  a.round1.forEach((g, i) => {
    const ry = y + 46 + i * FIXTURE_H;
    const midY = ry + FIXTURE_H / 2 + 8;

    if (i > 0) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 20, ry);
      ctx.lineTo(x + w - 20, ry);
      ctx.stroke();
    }

    // "vs" anchors the middle, and each side is measured against it, so two
    // long doubles names cannot collide.
    ctx.font = font(700, 19);
    ctx.fillStyle = C.textLo;
    ctx.textAlign = 'center';
    ctx.fillText('vs', midX, midY - 2);
    ctx.textAlign = 'left';

    let left = x + 24;
    if (a.multiCourt) {
      const label = `C${g.court}`;
      ctx.font = font(800, 16);
      const cw = ctx.measureText(label).width + 18;
      roundRect(ctx, left, midY - 19, cw, 26, 13);
      ctx.fillStyle = C.raised;
      ctx.fill();
      ctx.fillStyle = C.textLo;
      ctx.fillText(label, left + 9, midY - 1);
      left += cw + 12;
    }

    const room = midX - 26 - left;
    ctx.font = font(700, 24);
    ctx.fillStyle = C.textHi;
    ctx.fillText(clip(ctx, namesOf(g.teamA), room), left, midY);

    ctx.textAlign = 'right';
    ctx.fillText(clip(ctx, namesOf(g.teamB), w / 2 - 50), x + w - 24, midY);
    ctx.textAlign = 'left';
  });

  if (a.byes.length > 0) {
    const by = y + 46 + a.round1.length * FIXTURE_H + 26;
    ctx.font = font(600, 20);
    ctx.fillStyle = C.textLo;
    ctx.fillText(
      clip(ctx, `Sitting out: ${a.byes.map(nameOf).join(', ')}`, w - 48),
      x + 24,
      by
    );
  }
}
