// How smoothly the map pans on a phone: an emulated touch screen with a slowed-down CPU drags the
// map back and forth while the page records how long each frame takes.
//
//   npm run build:e2e && node scripts/dev/pan-perf.mjs [dist-e2e] [cpu slowdown, default 4] [paused]
//
// Prints frames per second and the share of slow frames while dragging, at the zoom a phone opens on.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const dir = process.argv[2] ?? 'dist-e2e';
const slowdown = Number(process.argv[3] ?? 4);
// `paused` pans with the game paused, to tell the cost of panning from the cost of the running game.
const paused = process.argv[4] === 'paused';
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
if (!existsSync(`${dir}/index.html`)) throw new Error(`no build in ${dir}: run \`npm run build:e2e\` first`);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', dir, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => server.exitCode === null && server.kill('SIGTERM'));
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(URL);
await page.tap('[data-nation-card="fr"]');
await page.fill('.menu-options input[type="number"]', '2024');
await page.tap('[data-testid="start-campaign"]');
await page.waitForSelector('[data-testid="tutorial"]');
while (!(await page.$('[data-testid="tutorial-done"]'))) await page.tap('.tutorial button.primary');
await page.tap('[data-testid="tutorial-done"]');
// Let the city models and the terrain bake, and the game run at normal speed.
await page.waitForTimeout(4000);

// Panning while the game runs, as it usually is.
await page.evaluate((p) => window.__game.setPaused(p), paused);
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const box = await page.locator('svg.map').boundingBox();
const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });

async function drag(dx, dy, ms) {
  await touch('touchStart', cx, cy);
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', cx + (dx * i) / steps, cy + (dy * i) / steps);
    await new Promise((r) => setTimeout(r, 16));
  }
  await touch('touchEnd', cx + dx, cy + dy);
}

const where = () => page.evaluate(() => document.querySelector('svg.map > g').getAttribute('transform'));
const before = await where();
const m0 = await metrics();
await page.evaluate(() => {
  const w = window;
  w.__frames = [];
  const tick = (t) => {
    w.__frames.push(t);
    w.__raf = requestAnimationFrame(tick);
  };
  w.__raf = requestAnimationFrame(tick);
});
for (let i = 0; i < 4; i++) {
  await drag(140, 90, 900);
  await drag(-140, -90, 900);
}
const panned = (await where()) !== before;
const m1 = await metrics();
const busy = (k) => Math.round((m1[k] - m0[k]) * 1000);
const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return window.__frames;
});
const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
const total = frames.at(-1) - frames[0];
const share = (ms) => gaps.filter((g) => g > ms).length / gaps.length;
console.log(
  JSON.stringify({
    build: dir,
    cpuSlowdown: slowdown,
    fps: Math.round((gaps.length / total) * 1000 * 10) / 10,
    medianFrameMs: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10,
    p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10,
    framesOver50ms: `${Math.round(share(50) * 100)}%`,
    // Main-thread time while dragging (ms, at the slowed-down CPU), out of about 7200 ms of dragging.
    taskMs: busy('TaskDuration'),
    scriptMs: busy('ScriptDuration'),
    styleLayoutMs: busy('RecalcStyleDuration') + busy('LayoutDuration'),
    panned,
    paused: await page.evaluate(() => window.__game.loop.paused),
  }),
);
await browser.close();
process.exit();
