import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contrastRatio, meetsAA } from '../utils/contrast.js';

// Reads the real tokens.css so the palette is verified as shipped, not as
// duplicated into a test fixture that can drift.
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

/** Pull `--name: #hex;` declarations out of the block for a given selector. */
function blockFor(selector) {
  // Matches the selector (possibly in a comma-separated list) up to the closing brace.
  const pattern = new RegExp(`(^|,|\\})[^{}]*${selector.replace(/[[\]]/g, '\\$&')}[^{}]*\\{([^}]*)\\}`, 'gm');
  let vars = {};
  let match;
  while ((match = pattern.exec(css)) !== null) {
    for (const [, name, value] of match[2].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      vars[name] = value;
    }
  }
  return vars;
}

const dark = { ...blockFor(':root'), ...blockFor("\\[data-theme='dark'\\]") };
const light = { ...blockFor(':root'), ...blockFor("\\[data-theme='light'\\]") };

const THEMES = [
  ['dark', dark],
  ['light', light],
];

describe('token file', () => {
  it('defines the surface and text tokens in both themes', () => {
    for (const [name, vars] of THEMES) {
      for (const token of ['bg-deep', 'bg-surface', 'bg-raised', 'line', 'text-hi', 'text-lo']) {
        expect(vars[token], `${token} missing in ${name}`).toBeDefined();
      }
    }
  });

  it('defines the accent palette', () => {
    for (const token of ['optic', 'court', 'clay', 'gold']) {
      expect(dark[token], `${token} missing`).toBeDefined();
    }
  });
});

describe('contrast — primary text', () => {
  it('clears AA on every surface in both themes', () => {
    for (const [themeName, vars] of THEMES) {
      for (const surface of ['bg-deep', 'bg-surface', 'bg-raised']) {
        const ratio = contrastRatio(vars['text-hi'], vars[surface]);
        expect(
          ratio,
          `${themeName}: --text-hi on --${surface} is ${ratio?.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('contrast — secondary text', () => {
  it('clears AA on the main surfaces in both themes', () => {
    for (const [themeName, vars] of THEMES) {
      for (const surface of ['bg-deep', 'bg-surface']) {
        const ratio = contrastRatio(vars['text-lo'], vars[surface]);
        expect(
          ratio,
          `${themeName}: --text-lo on --${surface} is ${ratio?.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('THE COLOUR RULE — text on optic/gold is near-black, never white', () => {
  it('near-black on optic clears AA', () => {
    expect(meetsAA(dark['text-on-accent'], dark.optic)).toBe(true);
  });

  it('white on optic fails — which is exactly why the rule exists', () => {
    expect(meetsAA('#FFFFFF', dark.optic)).toBe(false);
  });

  it('near-black on gold clears AA', () => {
    expect(meetsAA(dark['text-on-accent'], dark.gold)).toBe(true);
  });

  it('white on gold fails', () => {
    expect(meetsAA('#FFFFFF', dark.gold)).toBe(false);
  });
});

describe('contrast — accents as text', () => {
  // --optic and --gold are fills, not text colours, on light surfaces. The -ink
  // variants are the darkened forms the UI must use for text and thin strokes.
  it('court reads as text on the app background in both themes', () => {
    for (const [themeName, vars] of THEMES) {
      const ratio = contrastRatio(vars.court, vars['bg-deep']);
      expect(ratio, `${themeName}: --court on --bg-deep is ${ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it('clay reads as text on the app background in both themes', () => {
    for (const [themeName, vars] of THEMES) {
      const ratio = contrastRatio(vars.clay, vars['bg-deep']);
      expect(ratio, `${themeName}: --clay on --bg-deep is ${ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it('optic-ink reads as text on the light background', () => {
    const ratio = contrastRatio(light['optic-ink'], light['bg-deep']);
    expect(ratio, `light: --optic-ink on --bg-deep is ${ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('gold-ink reads as text on the light background', () => {
    const ratio = contrastRatio(light['gold-ink'], light['bg-deep']);
    expect(ratio, `light: --gold-ink on --bg-deep is ${ratio?.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('surfaces are distinguishable', () => {
  it('separates each surface layer from the next', () => {
    for (const [themeName, vars] of THEMES) {
      for (const [a, b] of [['bg-deep', 'bg-surface'], ['bg-surface', 'bg-raised']]) {
        const ratio = contrastRatio(vars[a], vars[b]);
        expect(ratio, `${themeName}: --${a} vs --${b}`).toBeGreaterThan(1.05);
      }
    }
  });
});
