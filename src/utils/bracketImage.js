// The bracket, drawn as a picture you can post in the group chat.
//
// WhatsApp's native currency is the image, not the paragraph. The results
// message (utils/sessionShare.js) carries a text tree that survives anywhere,
// and this is the version people actually look at.
//
// Drawn straight onto a canvas rather than rasterised from SVG or HTML. Both of
// those routes have historically tainted the canvas on WebKit, which would make
// toBlob() throw on exactly the phones half this club uses. A 2D context has no
// such problem and needs no dependency.
//
// The structure comes from utils/bracketTree.js — this file decides nothing
// about who beat whom, only where to put it. It is presentation, so it is
// verified in a browser rather than in node.

import { SLOT } from './bracket.js';
import { bracketTree, seedLabel } from './bracketTree.js';

// The dark palette from styles/tokens.css, hard-coded on purpose: a shared
// image is not theme-aware, and it must not change depending on what the person
// who happened to press share had their phone set to.
const C = {
  bg: '#0b1220',
  surface: '#151e2e',
  raised: '#1e2a3c',
  line: '#2a3850',
  textHi: '#f1f5f9',
  textLo: '#8a9ab0',
  gold: '#e7b94f',
  optic: '#d7f205',
  onAccent: '#0b1220',
};

const W = 900;
const PAD = 40;
const BOX_W = 372;
const WIDE_W = 560;
const ROW_H = 52;
const BOX_H = 34 + ROW_H * 2 + 14; // label + two rows + breathing room

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const font = (weight, size) => `${weight} ${size}px ${SANS}`;

/**
 * Render the bracket to a PNG.
 *
 * @returns {Promise<Blob|null>}  null when there is no bracket, or none of it
 *   has been played — there is nothing to draw and a blank card is worse than
 *   no card.
 */
export async function renderBracketPng({ bracket, nameOf, title, subtitle, scale = 2 } = {}) {
  const nodes = bracketTree({ bracket, nameOf });
  if (nodes.length === 0 || !nodes.some((n) => n.played)) return null;

  const plan = layout(nodes, Boolean(bracket.complete));

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = plan.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  paint(ctx, plan, { nodes, bracket, title, subtitle });

  return new Promise((resolve) => {
    // toBlob is callback-style and can hand back null if the browser refuses.
    try {
      canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/**
 * Where everything goes.
 *
 * Two shapes. A full knockout is the familiar left-to-right bracket: the two
 * semifinals on the left feeding one final on the right, with the third-place
 * game as a strip underneath. The Americano finish is a single game, so it gets
 * a single wide box and no connectors — drawing an empty left-hand column to
 * keep the two shapes symmetrical would only imply rounds that never happened.
 */
function layout(nodes, complete) {
  const bySlot = Object.fromEntries(nodes.map((n) => [n.slot, n]));
  const semis = [bySlot[SLOT.SF1], bySlot[SLOT.SF2]].filter(Boolean);
  const headerH = 132;

  const boxes = [];
  const links = [];
  let y = headerH;

  if (semis.length === 2) {
    const leftX = PAD;
    const rightX = W - PAD - BOX_W;
    const gap = 54;

    boxes.push({ node: semis[0], x: leftX, y, w: BOX_W, h: BOX_H });
    boxes.push({ node: semis[1], x: leftX, y: y + BOX_H + gap, w: BOX_W, h: BOX_H });

    const finalY = y + (BOX_H + gap) / 2;
    if (bySlot[SLOT.FINAL]) {
      boxes.push({ node: bySlot[SLOT.FINAL], x: rightX, y: finalY, w: BOX_W, h: BOX_H, crown: true });
      // Elbows from each semifinal's midline into the final's.
      const midX = (leftX + BOX_W + rightX) / 2;
      for (const b of boxes.slice(0, 2)) {
        links.push({
          from: { x: b.x + b.w, y: b.y + b.h / 2 },
          to: { x: rightX, y: finalY + BOX_H / 2 },
          midX,
          lit: Boolean(b.node.advances),
        });
      }
    }
    y += BOX_H * 2 + gap + 40;
  } else if (bySlot[SLOT.FINAL]) {
    boxes.push({ node: bySlot[SLOT.FINAL], x: (W - WIDE_W) / 2, y, w: WIDE_W, h: BOX_H, crown: true });
    y += BOX_H + 40;
  }

  if (bySlot[SLOT.BRONZE]) {
    // Centred and only half again as wide as a semifinal, rather than spanning
    // the whole card: at full width the score ends up stranded a long way from
    // the name it belongs to, and the pair stop reading as one row.
    boxes.push({ node: bySlot[SLOT.BRONZE], x: (W - WIDE_W) / 2, y, w: WIDE_W, h: BOX_H });
    y += BOX_H + 40;
  }

  const banner = complete ? { x: PAD, y, w: W - PAD * 2, h: 116 } : null;
  if (banner) y += banner.h + 32;

  return { boxes, links, banner, height: Math.round(y + 46) };
}

function paint(ctx, plan, { nodes, bracket, title, subtitle }) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, plan.height);

  // --- header -------------------------------------------------------
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.textHi;
  ctx.font = font(800, 44);
  ctx.fillText(clip(ctx, title ?? 'Playoffs', W - PAD * 2), PAD, 74);

  if (subtitle) {
    ctx.fillStyle = C.textLo;
    ctx.font = font(500, 24);
    ctx.fillText(clip(ctx, subtitle, W - PAD * 2), PAD, 108);
  }

  // --- connectors, before the boxes so they tuck underneath ----------
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

  for (const box of plan.boxes) drawBox(ctx, box);

  if (plan.banner) drawBanner(ctx, plan.banner, bracket);

  // --- footer -------------------------------------------------------
  ctx.fillStyle = C.textLo;
  ctx.font = font(600, 20);
  const played = nodes.filter((n) => n.played).length;
  ctx.fillText(
    `PickleTime · ${played} of ${nodes.length} playoff ${nodes.length === 1 ? 'game' : 'games'} played`,
    PAD,
    plan.height - 20
  );
}

function drawBox(ctx, { node, x, y, w, h, crown }) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = node.played && crown ? C.gold : C.line;
  ctx.lineWidth = node.played && crown ? 2.5 : 1.5;
  ctx.stroke();

  ctx.fillStyle = C.textLo;
  ctx.font = font(700, 18);
  ctx.fillText(node.label.toUpperCase(), x + 20, y + 30);

  node.sides.forEach((side, i) => {
    drawSide(ctx, side, { x, y: y + 34 + i * ROW_H, w, h: ROW_H, played: node.played });
  });
}

function drawSide(ctx, side, { x, y, w, played }) {
  const midY = y + ROW_H / 2 + 7;

  // The winner's rail. Same gesture as the match card in the app.
  if (side.won) {
    roundRect(ctx, x + 8, y + 8, 5, ROW_H - 16, 3);
    ctx.fillStyle = C.optic;
    ctx.fill();
  }

  let cursor = x + 26;

  // Seed pill.
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

  // Score, right-aligned, so the name gets whatever is left.
  const scoreText = side.score == null ? '—' : String(side.score);
  ctx.font = font(800, 30);
  const scoreW = ctx.measureText(scoreText).width;
  ctx.fillStyle = !played ? C.textLo : side.won ? C.textHi : C.textLo;
  ctx.fillText(scoreText, x + w - 22 - scoreW, midY);

  ctx.font = font(side.won ? 800 : 600, 26);
  ctx.fillStyle = side.won ? C.textHi : C.textLo;
  const room = x + w - 22 - scoreW - 16 - cursor;
  ctx.fillText(clip(ctx, side.name ?? 'To be decided', room), cursor, midY);
}

function drawBanner(ctx, { x, y, w, h }, bracket) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#e7b94f');
  grad.addColorStop(1, '#efd292');
  roundRect(ctx, x, y, w, h, 20);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = 'rgba(11,18,32,0.62)';
  ctx.font = font(800, 18);
  ctx.fillText('CHAMPION', x + 28, y + 40);

  ctx.fillStyle = C.onAccent;
  ctx.font = font(800, 40);
  ctx.fillText(clip(ctx, bracket.champion?.name ?? '', w - 300), x + 28, y + 84);

  if (bracket.runnerUp) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(11,18,32,0.62)';
    ctx.font = font(700, 18);
    ctx.fillText('RUNNER-UP', x + w - 28, y + 40);
    ctx.fillStyle = C.onAccent;
    ctx.font = font(700, 24);
    ctx.fillText(clip(ctx, bracket.runnerUp.name, 260), x + w - 28, y + 78);
    ctx.textAlign = 'left';
  }
}

/** Truncate to fit, with an ellipsis — a clipped name is worse than a short one. */
function clip(ctx, text, maxWidth) {
  const value = text ?? '';
  if (maxWidth <= 0) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trim()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  // roundRect() is not on older WebKit, so this is drawn by hand.
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
