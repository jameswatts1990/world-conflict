// Development aid: starts the Vite dev server, opens a campaign in headless
// Chromium and saves screenshots of the main screens for visual review.
//   node scripts/dev/screens.mjs <outDir> [nation] [step...]
// Steps: menu, map, province, recruit, army, research, diplomacy, play:<seconds>, zoom:<k>, select:<pid>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'e2e-output/screens';
const nation = process.argv[3] ?? 'fr';
const steps = process.argv.slice(4);
mkdirSync(out, { recursive: true });
const PORT = 5199;
const URL = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 150; i++) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {
    // starting
  }
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
await page.goto(URL);
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
if (steps.includes('menu')) await shot('menu');
await page.click(`[data-nation-card="${nation}"]`);
await page.click('[data-testid="start-campaign"]');
await page.waitForSelector('[data-testid="tutorial"]');
await page.click('.tutorial button.ghost');
await page.waitForTimeout(300);
for (const s of steps) {
  const i = s.indexOf(':');
  const cmd = i < 0 ? s : s.slice(0, i);
  const arg = i < 0 ? undefined : s.slice(i + 1);
  if (cmd === 'map') await shot('map');
  if (cmd === 'play') {
    await page.evaluate((secs) => {
      const c = window.__game;
      for (let i = 0; i < Number(secs); i++) c.sim.step();
      c.notify();
    }, arg ?? '60');
    await page.waitForTimeout(200);
    await shot(`play-${arg}`);
  }
  if (cmd === 'eval') {
    await page.evaluate(arg);
    await page.waitForTimeout(200);
  }
  if (cmd === 'select') {
    await page.evaluate((pid) => {
      const el = document.querySelector(`path[data-province="${pid}"]`);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, arg);
    await page.waitForTimeout(250);
    await shot(`select-${arg}`);
  }
  if (cmd === 'click') {
    await page.click(arg);
    await page.waitForTimeout(250);
    await shot(`click`);
  }
  if (cmd === 'key') {
    await page.keyboard.press(arg);
    await page.waitForTimeout(350);
    await shot(`key-${arg}`);
  }
  if (cmd === 'zoom') {
    await page.mouse.move(800, 450);
    for (let i = 0; i < Number(arg); i++) await page.mouse.wheel(0, -300);
    await page.waitForTimeout(400);
    await shot(`zoom-${arg}`);
  }
  if (cmd === 'shot') await shot(arg ?? 'shot');
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.kill('SIGTERM');
process.exit(0);
