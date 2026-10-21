// Full-page screenshot of a local HTML file (e.g. the unit-art contact sheet).
//
//   node scripts/art/screenshot.mjs <in.html> <out.png> [--scale 2] [--split]
//
// --split also writes one PNG per `[data-shot]` section, named <out>-<id>.png,
// so individual sections can be inspected at full resolution.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
const [input, output] = positional;
if (!input || !output) {
  console.error('usage: node scripts/art/screenshot.mjs <in.html> <out.png> [--scale 2] [--split]');
  process.exit(1);
}
const scaleIdx = args.indexOf('--scale');
const scale = scaleIdx >= 0 ? Number(args[scaleIdx + 1]) : 1;
const split = args.includes('--split');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: 'load' });
  await page.screenshot({ path: output, fullPage: true });
  console.log(`wrote ${output}`);
  if (split) {
    const base = output.replace(/\.png$/i, '');
    for (const el of await page.$$('[data-shot]')) {
      const id = await el.getAttribute('data-shot');
      const file = `${base}-${id}.png`;
      await el.screenshot({ path: file });
      console.log(`wrote ${file}`);
    }
  }
} finally {
  await browser.close();
}
