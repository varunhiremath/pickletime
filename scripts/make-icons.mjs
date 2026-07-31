// Renders the PWA icon set from public/icon.svg by driving headless Chromium.
// Avoids adding an image-processing dependency for something that only runs when
// the mark changes.
//
// Playwright is deliberately NOT a devDependency: its postinstall downloads
// browsers, which would add a minute to every CI run for a script nobody runs in
// CI. Install it on demand:
//
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/make-icons.mjs
//
// CHROMIUM_PATH overrides the browser location if one is already on the machine.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const publicDir = new URL('public/', root);
const svg = readFileSync(fileURLToPath(new URL('icon.svg', publicDir)), 'utf8');

// name, size, maskable. Maskable icons need the mark inside the safe zone
// (the inner 80%), so the artwork is scaled down and the background bleeds out.
const TARGETS = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
  ['favicon-32.png', 32, false],
];

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

for (const [name, size, maskable] of TARGETS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = maskable ? 0.78 : 1;
  await page.setContent(
    `<html><body style="margin:0;background:#0B1220;width:${size}px;height:${size}px;
       display:flex;align-items:center;justify-content:center;overflow:hidden">
       <div style="width:${size * inner}px;height:${size * inner}px">${svg}</div>
     </body></html>`
  );
  const buffer = await page.screenshot({ omitBackground: false });
  writeFileSync(fileURLToPath(new URL(name, publicDir)), buffer);
  console.log(`${name} (${size}x${size}${maskable ? ', maskable' : ''})`);
  await page.close();
}

await browser.close();
