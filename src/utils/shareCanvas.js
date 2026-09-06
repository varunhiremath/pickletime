// The drawing kit behind the shareable images.
//
// WhatsApp's native currency is the picture, not the paragraph, so the session
// announcement and the final results are both painted rather than written.
// This module is the part they have in common: the palette, the type scale, and
// the handful of canvas primitives that older WebKit does not give us.
//
// Drawn on a 2D canvas rather than rasterised from SVG or HTML. Both of those
// routes have historically tainted the canvas on WebKit, which would make
// toBlob() throw on exactly the phones half this club uses.
//
// Presentation, so it is verified by driving the real app rather than in node.

/**
 * The dark palette from styles/tokens.css, hard-coded on purpose.
 *
 * A shared image is not theme-aware: it must not come out different depending
 * on what the person who happened to press share had their phone set to.
 */
export const C = {
  bg: '#0b1220',
  surface: '#151e2e',
  raised: '#1e2a3c',
  line: '#2a3850',
  textHi: '#f1f5f9',
  textLo: '#8a9ab0',
  gold: '#e7b94f',
  goldLight: '#efd292',
  optic: '#d7f205',
  onAccent: '#0b1220',
};

/** Card width. Everything is laid out against this. */
export const W = 900;
export const PAD = 40;

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const font = (weight, size) => `${weight} ${size}px ${SANS}`;

/**
 * A canvas of the given height, already scaled for a retina screen.
 * @returns {{ canvas, ctx } | null}
 */
export function newCanvas(height, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = Math.round(height) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);
  return { canvas, ctx };
}

/** toBlob is callback-style, and can hand back null if the browser refuses. */
export function toPng(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? null), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Truncate to fit, with an ellipsis — a clipped name is worse than a short one. */
export function clip(ctx, text, maxWidth) {
  const value = text ?? '';
  if (maxWidth <= 0) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trim()}…`;
}

/** roundRect() is not on older WebKit, so the path is built by hand. */
export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A surface panel with an uppercase label along its top. */
export function card(ctx, { x, y, w, h, label, accent = false }) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = accent ? C.gold : C.line;
  ctx.lineWidth = accent ? 2.5 : 1.5;
  ctx.stroke();

  if (label) {
    ctx.fillStyle = C.textLo;
    ctx.font = font(700, 18);
    ctx.fillText(label.toUpperCase(), x + 20, y + 30);
  }
}

/** The title and subtitle every card opens with. Returns the y it ends at. */
export function header(ctx, { title, subtitle }) {
  ctx.fillStyle = C.textHi;
  ctx.font = font(800, 44);
  ctx.fillText(clip(ctx, title ?? '', W - PAD * 2), PAD, 74);

  if (!subtitle) return 104;
  ctx.fillStyle = C.textLo;
  ctx.font = font(500, 24);
  ctx.fillText(clip(ctx, subtitle, W - PAD * 2), PAD, 108);
  return 132;
}

/**
 * The footer line.
 *
 * The link is text in a picture, so nobody can tap it — but a shared image with
 * no address on it is a dead end, and this is the only place an address can go.
 */
export function footer(ctx, { height, note, url }) {
  ctx.fillStyle = C.textLo;
  ctx.font = font(600, 20);
  const left = ['PickleTime', note].filter(Boolean).join(' · ');
  ctx.fillText(clip(ctx, left, W - PAD * 2), PAD, height - 46);

  if (!url) return;
  ctx.fillStyle = C.textLo;
  ctx.font = font(500, 19);
  ctx.fillText(clip(ctx, stripScheme(url), W - PAD * 2), PAD, height - 20);
}

/** Height the footer needs, with and without a link. */
export const FOOTER_H = (url) => (url ? 70 : 46);

const stripScheme = (url) => String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
