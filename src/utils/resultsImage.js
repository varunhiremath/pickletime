// The picture you post when the session is over.
//
// This is the whole result, not just the bracket: the podium, how the playoffs
// were won, and the round-robin table underneath. That completeness is what
// lets it be the default share rather than an extra — an image carrying only
// the bracket would drop the table, and would have nothing at all to show for a
// session played without playoffs.
//
// The structure comes from utils/bracketTree.js; this file decides nothing
// about who beat whom, only where to put it.

import { SLOT, SHAPES } from './bracket.js';
import { bracketTree, seedLabel, setsText } from './bracketTree.js';
import {
  C, W, PAD, font, newCanvas, toPng, clip, roundRect, card, header, footer, FOOTER_H,
} from './shareCanvas.js';

const BOX_W = 372;
const WIDE_W = 560;
const ROW_H = 52;
const BOX_H = 34 + ROW_H * 2 + 14;
// A set match needs one more line under the two sides for its set scores.
const SETS_H = 26;
// The "→ X into the grand final" line under a Page fixture.
const NOTE_H = 30;
const boxHeight = (node) => BOX_H + (node?.sets ? SETS_H : 0);
const TABLE_ROW_H = 54;

/**
 * Render the session's results to a PNG.
 *
 * @returns {Promise<Blob|null>}  null when there is nothing to show — no
 *   entrant has played a game — because a blank card is worse than no card.
 */
export async function renderResultsPng({
  bracket, nameOf, title, subtitle, url, scale = 2,
} = {}) {
  if (!bracket) return null;

  const nodes = bracketTree({ bracket, nameOf }).filter((n) => n.played);
  const rows = (bracket.standings ?? []).filter((r) => r.gp > 0);
  if (nodes.length === 0 && rows.length === 0) return null;

  const plan = layout({ bracket, nodes, rows, url, subtitle });

  const made = newCanvas(plan.height, scale);
  if (!made) return null;
  paint(made.ctx, plan, { bracket, nodes, rows, title, subtitle, url });

  return toPng(made.canvas);
}

/**
 * Where everything goes.
 *
 * Three stacked blocks — podium, bracket, table — any of which can be absent.
 * A session with no playoffs is just a header and a table, and that is a
 * perfectly good thing to post.
 */
function layout({ bracket, nodes, rows, url, subtitle }) {
  const bySlot = Object.fromEntries(nodes.map((n) => [n.slot, n]));
  const semis = [bySlot[SLOT.SF1], bySlot[SLOT.SF2]].filter(Boolean);

  let y = subtitle ? 132 : 104;

  // --- podium ---------------------------------------------------------
  // First, not last: the champion is the thing people open the picture for.
  const banner = bracket.complete ? { x: PAD, y, w: W - PAD * 2, h: 132 } : null;
  if (banner) y += banner.h + 34;

  // --- bracket --------------------------------------------------------
  const boxes = [];
  const links = [];

  if (bracket.shape === SHAPES.PAGE) {
    // A ladder, not a bracket: five fixtures over three rounds, where losing the
    // first one does not end your tournament. Drawing it as two columns feeding
    // a final would misrepresent that, so it is stacked in play order and each
    // box says what its winner earned.
    for (const node of nodes) {
      const h = boxHeight(node);
      boxes.push({
        node,
        x: (W - WIDE_W) / 2,
        y,
        w: WIDE_W,
        h,
        crown: node.slot === SLOT.FINAL,
        note: node.advances ? `${node.advances} ${node.advanceNote}` : null,
      });
      y += h + (node.advances ? NOTE_H : 0) + 26;
    }
    y += 8;
  } else if (semis.length === 2) {
    const leftX = PAD;
    const rightX = W - PAD - BOX_W;
    const gap = 54;

    boxes.push({ node: semis[0], x: leftX, y, w: BOX_W, h: boxHeight(semis[0]) });
    boxes.push({ node: semis[1], x: leftX, y: y + boxHeight(semis[0]) + gap, w: BOX_W, h: boxHeight(semis[1]) });

    const stack = boxHeight(semis[0]) + gap + boxHeight(semis[1]);
    const finalH = boxHeight(bySlot[SLOT.FINAL]);
    const finalY = y + (stack - finalH) / 2;
    if (bySlot[SLOT.FINAL]) {
      boxes.push({ node: bySlot[SLOT.FINAL], x: rightX, y: finalY, w: BOX_W, h: finalH, crown: true });
      const midX = (leftX + BOX_W + rightX) / 2;
      for (const b of boxes.slice(0, 2)) {
        links.push({
          from: { x: b.x + b.w, y: b.y + b.h / 2 },
          to: { x: rightX, y: finalY + finalH / 2 },
          midX,
          lit: Boolean(b.node.advances),
        });
      }
    }
    y += stack + 34;
  } else if (bySlot[SLOT.FINAL]) {
    const h = boxHeight(bySlot[SLOT.FINAL]);
    boxes.push({ node: bySlot[SLOT.FINAL], x: (W - WIDE_W) / 2, y, w: WIDE_W, h, crown: true });
    y += h + 34;
  }

  // Not for the Page ladder, which drew every one of its fixtures above — this
  // block used to run for it too and put the third-place game on the card twice.
  if (bracket.shape !== SHAPES.PAGE && bySlot[SLOT.BRONZE]) {
    // Centred and only half again as wide as a semifinal. At full width the
    // score ends up stranded a long way from the name it belongs to.
    const h = boxHeight(bySlot[SLOT.BRONZE]);
    boxes.push({ node: bySlot[SLOT.BRONZE], x: (W - WIDE_W) / 2, y, w: WIDE_W, h });
    y += h + 34;
  }

  // --- table ----------------------------------------------------------
  const table = rows.length > 0
    ? { x: PAD, y, w: W - PAD * 2, h: 46 + rows.length * TABLE_ROW_H + 14 }
    : null;
  if (table) y += table.h + 24;

  return { banner, boxes, links, table, height: Math.round(y + FOOTER_H(url)) };
}

function paint(ctx, plan, { bracket, nodes, rows, title, subtitle, url }) {
  header(ctx, { title, subtitle });

  if (plan.banner) drawPodium(ctx, plan.banner, bracket);

  // Connectors before the boxes, so they tuck underneath.
  for (const link of plan.links) {
    ctx.strokeStyle = link.lit ? C.gold : C.line;
    ctx.lineWidth = link.lit ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(link.from.x, link.from.y);
    ctx.lineTo(link.midX, link.from.y);
    ctx.lineTo(link.midX, link.to.y);
    ctx.lineTo(link.to.x, link.to.y);
    ctx.stroke();
  }

  for (const box of plan.boxes) drawFixture(ctx, box);
  if (plan.table) drawTable(ctx, plan.table, { rows, teamPlay: bracket.enabled });

  const note = nodes.length > 0
    ? `${bracket.rr.played} of ${bracket.rr.total} played · ${nodes.length} playoff ${nodes.length === 1 ? 'game' : 'games'}`
    : `${bracket.rr.played} of ${bracket.rr.total} played`;
  footer(ctx, { height: plan.height, note, url });
}

function drawPodium(ctx, { x, y, w, h }, bracket) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, C.gold);
  grad.addColorStop(1, C.goldLight);
  roundRect(ctx, x, y, w, h, 20);
  ctx.fillStyle = grad;
  ctx.fill();

  const muted = 'rgba(11,18,32,0.62)';
  ctx.fillStyle = muted;
  ctx.font = font(800, 18);
  ctx.fillText('CHAMPION', x + 28, y + 40);

  // The runner-up and third sit in a narrower right-hand column, so the
  // champion's name gets the width it deserves.
  const rightW = 300;
  ctx.fillStyle = C.onAccent;
  ctx.font = font(800, 42);
  ctx.fillText(clip(ctx, bracket.champion?.name ?? '', w - rightW - 56), x + 28, y + 88);

  ctx.textAlign = 'right';
  const runners = [
    bracket.runnerUp && ['2nd', bracket.runnerUp.name],
    bracket.third && ['3rd', bracket.third.name],
  ].filter(Boolean);

  runners.forEach(([place, name], i) => {
    const ry = y + 52 + i * 40;
    ctx.fillStyle = muted;
    ctx.font = font(800, 17);
    ctx.fillText(place, x + w - 28, ry);
    ctx.fillStyle = C.onAccent;
    ctx.font = font(700, 23);
    ctx.fillText(clip(ctx, name, rightW - 60), x + w - 62, ry);
  });
  ctx.textAlign = 'left';
}

function drawFixture(ctx, { node, x, y, w, h, crown, note }) {
  card(ctx, { x, y, w, h, label: node.label, accent: Boolean(crown) });

  // What this fixture was worth, spelled out. In the Page system the two
  // qualifying games send their winners to different places, and a stacked
  // ladder has no arrows to say so.
  if (note) {
    ctx.font = font(700, 20);
    ctx.fillStyle = node.medal ? C.gold : C.optic;
    ctx.fillText(clip(ctx, `↳ ${node.medal ? `${node.medal} ` : ''}${note}`, w - 20), x + 8, y + h + 22);
  }
  node.sides.forEach((side, i) => {
    drawSide(ctx, side, { x, y: y + 34 + i * ROW_H, w, played: node.played });
  });

  // "2–1" on its own says nothing about how. The sets go underneath, and are
  // NOT flipped: unlike the text line, which is written winner-first, this box
  // always draws side A on top, so the sets already read in the same order.
  if (node.sets) {
    ctx.font = font(600, 19);
    ctx.fillStyle = C.textLo;
    ctx.fillText(
      clip(ctx, setsText(node.setPairs), w - 48),
      x + 26,
      y + 34 + ROW_H * 2 + 16
    );
  }
}

function drawSide(ctx, side, { x, y, w, played }) {
  const midY = y + ROW_H / 2 + 7;

  // The winner's rail — the same gesture as the match card in the app.
  if (side.won) {
    roundRect(ctx, x + 8, y + 8, 5, ROW_H - 16, 3);
    ctx.fillStyle = C.optic;
    ctx.fill();
  }

  let cursor = x + 26;

  const seed = seedLabel(side.seeds);
  if (seed) {
    ctx.font = font(800, 17);
    const pw = ctx.measureText(seed).width + 18;
    roundRect(ctx, cursor, midY - 21, pw, 28, 14);
    ctx.fillStyle = C.raised;
    ctx.fill();
    ctx.fillStyle = C.textLo;
    ctx.fillText(seed, cursor + 9, midY - 2);
    cursor += pw + 12;
  }

  // Score right-aligned, so the name gets whatever is left.
  const scoreText = side.score == null ? '—' : String(side.score);
  ctx.font = font(800, 30);
  const scoreW = ctx.measureText(scoreText).width;
  ctx.fillStyle = !played ? C.textLo : side.won ? C.textHi : C.textLo;
  ctx.fillText(scoreText, x + w - 22 - scoreW, midY);

  ctx.font = font(side.won ? 800 : 600, 26);
  ctx.fillStyle = side.won ? C.textHi : C.textLo;
  ctx.fillText(clip(ctx, side.name ?? 'To be decided', x + w - 22 - scoreW - 16 - cursor), cursor, midY);
}

/** The round-robin table: rank, name, W-L, point difference. */
function drawTable(ctx, { x, y, w, h }, { rows, teamPlay }) {
  card(ctx, { x, y, w, h, label: teamPlay ? 'Round robin' : 'Final table' });

  const diffX = x + w - 24;
  const recX = diffX - 110;

  rows.forEach((row, i) => {
    const ry = y + 46 + i * TABLE_ROW_H;
    const midY = ry + TABLE_ROW_H / 2 + 8;
    const leader = row.rank === 1;

    if (i > 0) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 20, ry);
      ctx.lineTo(x + w - 20, ry);
      ctx.stroke();
    }

    ctx.font = font(800, 24);
    ctx.fillStyle = leader ? C.gold : C.textLo;
    ctx.fillText(String(row.rank), x + 24, midY);

    ctx.font = font(leader ? 800 : 600, 26);
    ctx.fillStyle = leader ? C.textHi : C.textHi;
    ctx.fillText(clip(ctx, row.name, recX - (x + 66) - 16), x + 66, midY);

    ctx.font = font(700, 23);
    ctx.fillStyle = C.textLo;
    ctx.fillText(`${row.w}W ${row.l}L`, recX, midY);

    const diff = `${row.diff > 0 ? '+' : ''}${row.diff}`;
    ctx.textAlign = 'right';
    ctx.font = font(800, 23);
    ctx.fillStyle = row.diff > 0 ? C.optic : row.diff < 0 ? C.textLo : C.textLo;
    ctx.fillText(diff, diffX, midY);
    ctx.textAlign = 'left';
  });
}
