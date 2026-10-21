// Full-page (or single-element) screenshot of a local HTML file with Playwright's Chromium.
//
//   node scripts/art/screenshot-city.mjs <in.html> <out.png> [css-selector] [device-scale]
//
// e.g. node scripts/art/screenshot-city.mjs /tmp/city-art/city-sheet.html /tmp/city-art/growth.png '#growth' 2
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [input, output, selector, scaleArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/art/screenshot-city.mjs <in.html> <out.png> [css-selector] [device-scale]');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 800 },
    deviceScaleFactor: Number(scaleArg ?? 1) || 1,
  });
  await page.goto(pathToFileURL(resolve(input)).href);
  if (selector) {
    await page.locator(selector).first().screenshot({ path: output });
  } else {
    await page.screenshot({ path: output, fullPage: true });
  }
  console.log(`wrote ${output}`);
} finally {
  await browser.close();
}
