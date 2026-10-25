// Development aid: starts the Vite dev server, opens a campaign in headless
// Chromium and saves screenshots of the main screens for visual review.
//   node scripts/dev/screens.mjs <outDir> [nation] [step...] [--phone | --phone-landscape]
// Steps: menu, map, province, recruit, army, research, diplomacy, play:<seconds>, zoom:<k>, select:<pid>,
// eval:<js>, click:<selector>, key:<key>, shot:<name>, crop:<x>,<y>,<w>,<h> (a close-up of part of the screen);
// zoom:<steps> zooms on the middle of the screen, zoom:<steps>@<x>,<y> on a point; mouse:<x>,<y> moves the pointer.
// --phone and --phone-landscape use a 390 × 844 touch screen, upright or on its side; --hidpi renders at 2×.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { chromium } from 'playwright';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [out = 'e2e-output/screens', nation = 'fr', ...steps] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const phone = flags.includes('--phone') ? { width: 390, height: 844 } : flags.includes('--phone-landscape') ? { width: 844, height: 390 } : null;
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.SCREEN_PORT ?? 5199);
const URL = `http://localhost:${PORT}/`;
// Launch Vite directly: works on Windows without a .cmd wrapper and leaves no child server behind.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const stopServer = () => server.exitCode === null && server.kill('SIGTERM');
process.on('exit', stopServer);
// Wait for this process to bind its port; an HTTP response alone might belong to another session.
let startupOutput = '';
let startupTimer;
const serverFailure = () => new Error(`Vite exited before screenshot capture (code ${server.exitCode}, signal ${server.signalCode}). Port ${PORT} may already be in use; choose another SCREEN_PORT.\n${startupOutput.trim()}`);
const ensureServer = () => {
  if (server.exitCode !== null || server.signalCode !== null) throw serverFailure();
};
await new Promise((resolve, reject) => {
  startupTimer = setTimeout(() => reject(new Error(`Vite did not start on port ${PORT} within 30 seconds.\n${startupOutput.trim()}`)), 30000);
  server.stdout.on('data', (chunk) => {
    startupOutput = (startupOutput + chunk).slice(-4000);
    if (stripVTControlCharacters(startupOutput).includes('Local:')) resolve();
  });
  server.stderr.on('data', (chunk) => { startupOutput = (startupOutput + chunk).slice(-4000); });
  server.once('error', (error) => reject(new Error(`Could not start Vite: ${error.message}`)));
  server.once('exit', () => reject(serverFailure()));
}).finally(() => clearTimeout(startupTimer));
let ready = false;
for (let i = 0; i < 150; i++) {
  ensureServer();
  try {
    ready = (await fetch(URL, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    // starting
  }
  ensureServer();
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}
if (!ready) throw new Error(`Vite started but did not respond on port ${PORT}.`);
ensureServer();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext(
  phone
    ? { viewport: phone, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1600, height: 950 }, deviceScaleFactor: flags.includes('--hidpi') ? 2 : 1 },
);
const page = await context.newPage();
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
    // zoom:<steps> zooms on the middle of the screen, zoom:<steps>@<x>,<y> on that point.
    const [steps, at = '800,450'] = arg.split('@');
    const [zx, zy] = at.split(',').map(Number);
    await page.mouse.move(zx, zy);
    for (let i = 0; i < Number(steps); i++) await page.mouse.wheel(0, -300);
    await page.waitForTimeout(400);
    await shot(`zoom-${steps}`);
  }
  if (cmd === 'shot') await shot(arg ?? 'shot');
  if (cmd === 'mouse') {
    const [mx, my] = arg.split(',').map(Number);
    await page.mouse.move(mx, my);
    await page.waitForTimeout(150);
  }
  if (cmd === 'crop') {
    const [x, y, width, height] = arg.split(',').map(Number);
    await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-crop.png`, clip: { x, y, width, height } });
  }
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
stopServer();
process.exit(0);
