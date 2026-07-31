// WCAG contrast maths.
//
// Two jobs: let the token test assert the palette is legible in both themes, and
// let the UI pick readable text for a player's avatar colour at runtime.

export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Relative luminance, per WCAG 2.1. */
export function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio between two hex colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

export function meetsAA(fg, bg, { large = false } = {}) {
  const ratio = contrastRatio(fg, bg);
  return ratio != null && ratio >= (large ? AA_LARGE : AA_NORMAL);
}

/**
 * Readable text colour for an arbitrary background — used for player avatars,
 * where the colour comes from a palette rather than from the token file.
 */
export function readableTextOn(bg, dark = '#0B1220', light = '#F1F5F9') {
  const withDark = contrastRatio(dark, bg) ?? 0;
  const withLight = contrastRatio(light, bg) ?? 0;
  return withDark >= withLight ? dark : light;
}
