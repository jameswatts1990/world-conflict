// How smoothly the map moves under a finger or a mouse: an emulated phone (or a desktop window) drags or
// zooms the map back and forth while Chrome records a trace, and the trace tells what reached the screen.
//
//   npm run build:e2e && node scripts/dev/pan-perf.mjs [dist-e2e] [cpu slowdown, default 4] [paused] [zoom] [desktop]
//
// `zoom` pinches (on the desktop, spins the wheel) instead of dragging; `desktop` uses a 1440 × 900 window and
// a mouse instead of a phone; `paused` pauses the game, to tell the cost of moving the map from the cost of the
// running game. The input comes on a fixed clock, as a finger or a wheel gives it, without waiting for the page.
//
// Prints the frames that reached the screen and the ones dropped, the time spent rasterising the map (drawing
// it into tiles, off the main thread, which is what drags fall behind on), main-thread time by phase, and how
// many times the map was drawn again. Counting requestAnimationFrame callbacks alone misses dropped frames.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const dir = process.argv[2] ?? 'dist-e2e';
const slowdown = Number(process.argv[3] ?? 4);
const flags = new Set(process.argv.slice(4));
const paused = flags.has('paused');
const gesture = flags.has('zoom') ? 'zoom' : 'drag';
const phone = !flags.has('desktop');
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
const context = await browser.newContext(
  phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
const page = await context.newPage();
const press = (selector) => (phone ? page.tap(selector) : page.click(selector));
await page.goto(URL);
await press('[data-nation-card="fr"]');
await page.fill('.menu-options input[type="number"]', '2024');
await press('[data-testid="start-campaign"]');
await page.waitForSelector('[data-testid="tutorial"]');
while (!(await page.$('[data-testid="tutorial-done"]'))) await press('.tutorial button.primary');
await press('[data-testid="tutorial-done"]');
// Let the city models and the terrain bake, and the game run at normal speed.
await page.waitForTimeout(4000);

await page.evaluate((p) => window.__game.setPaused(p), paused);
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });

const box = await page.locator('.map-stage').boundingBox();
const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const touch = (type, points) => () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
const mouse = (type, x, y, more = {}) => () => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...more });

/** Sends the events of one gesture every 16 ms, as a finger or a wheel would, without waiting for the page. */
async function stream(events) {
  const sent = [];
  const t0 = performance.now();
  for (let i = 0; i < events.length; i++) {
    const wait = t0 + i * 16 - performance.now();
    if (wait > 0) await sleep(wait);
    sent.push(events[i]());
  }
  await Promise.all(sent);
}

/** One drag by (dx, dy) screen pixels, or one zoom in (dir 1) or out (-1), over about `ms`. */
function events(dx, dy, dir, ms) {
  const steps = Math.round(ms / 16);
  const along = (i) => [cx + (dx * i) / steps, cy + (dy * i) / steps];
  if (gesture === 'drag' && phone) return [touch('touchStart', [[cx, cy]]), ...Array.from({ length: steps }, (_, i) => touch('touchMove', [along(i + 1)])), touch('touchEnd', [])];
  if (gesture === 'drag') {
    const held = { button: 'left', buttons: 1 };
    return [
      mouse('mouseMoved', cx, cy),
      mouse('mousePressed', cx, cy, { ...held, clickCount: 1 }),
      ...Array.from({ length: steps }, (_, i) => mouse('mouseMoved', ...along(i + 1), held)),
      mouse('mouseReleased', cx + dx, cy + dy, { button: 'left', clickCount: 1 }),
    ];
  }
  if (phone) {
    // Two fingers apart (in) or together (out).
    const [a, b] = dir > 0 ? [40, 160] : [160, 40];
    const apart = (d) => [
      [cx - d, cy],
      [cx + d, cy],
    ];
    return [touch('touchStart', apart(a)), ...Array.from({ length: steps }, (_, i) => touch('touchMove', apart(a + ((b - a) * (i + 1)) / steps))), touch('touchEnd', [])];
  }
  // A wheel spun fast, or a trackpad: small steps every frame.
  return [mouse('mouseMoved', cx, cy), ...Array.from({ length: steps }, () => mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: dir > 0 ? -40 : 40 }))];
}

// The zoom behaviour's view (on the <svg> itself in builds before the map moved as a layer).
const where = () =>
  page.evaluate(() => {
    const t = document.querySelector('.map-stage').__zoom ?? document.querySelector('svg.map').__zoom;
    return `${t.x},${t.y},${t.k}`;
  });
const before = await where();
// Each time the map is drawn again for a new view, the drawing's own transform changes.
await page.evaluate(() => {
  window.__redraws = 0;
  new MutationObserver(() => window.__redraws++).observe(document.querySelector('svg.map > g'), { attributes: true, attributeFilter: ['transform'] });
});

const trace = [];
cdp.on('Tracing.dataCollected', (e) => trace.push(...e.value));
const traced = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
const categories = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'cc', 'viz', 'benchmark'];
await cdp.send('Tracing.start', { categories: categories.join(','), transferMode: 'ReportEvents' });
const t0 = Date.now();
const [dx, dy] = phone ? [140, 90] : [400, 250];
for (let i = 0; i < 3; i++) {
  await stream(events(dx, dy, 1, 900));
  await sleep(150);
  await stream(events(-dx, -dy, -1, 900));
  await sleep(150);
}
const wallMs = Date.now() - t0;
await cdp.send('Tracing.end');
await traced;
const moved = (await where()) !== before;
const redraws = await page.evaluate(() => window.__redraws);

// The renderer's main thread: the busiest CrRendererMain.
const threadName = new Map();
for (const e of trace) if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args.name);
const busiest = new Map();
for (const e of trace) {
  const t = `${e.pid}:${e.tid}`;
  if (threadName.get(t) === 'CrRendererMain') busiest.set(t, (busiest.get(t) ?? 0) + 1);
}
const main = [...busiest.entries()].sort((a, b) => b[1] - a[1])[0][0];
const onMain = (e) => `${e.pid}:${e.tid}` === main;
const total = (pred) => Math.round(trace.filter((e) => e.ph === 'X' && pred(e)).reduce((s, e) => s + (e.dur ?? 0), 0) / 1000);
const mainMs = (...names) => total((e) => onMain(e) && names.includes(e.name));
// A frame can have more than one report (what the compositor and the main thread each brought to it): it reached
// the screen if any of them says so, and was dropped if all of them do.
const frames = new Map();
for (const e of trace) {
  const r = e.name === 'PipelineReporter' && e.ph === 'b' && e.args?.frame_reporter;
  if (!r) continue;
  const key = `${r.frame_source}:${r.frame_sequence}`;
  frames.set(key, [...(frames.get(key) ?? []), r.state]);
}
const states = [...frames.values()];
const presented = states.filter((s) => s.some((x) => x.startsWith('STATE_PRESENTED'))).length;
const dropped = states.filter((s) => s.every((x) => x === 'STATE_DROPPED')).length;
console.log(
  JSON.stringify({
    build: dir,
    device: phone ? 'phone' : 'desktop',
    gesture,
    cpuSlowdown: slowdown,
    paused,
    // Frames that reached the screen, per second of gesture, and the share of frames that were due but dropped.
    fps: Math.round((presented / wallMs) * 10000) / 10,
    dropped: `${Math.round((dropped / Math.max(1, presented + dropped)) * 100)}%`,
    // Drawing the map into tiles (ms, all raster threads), and main-thread time by phase (ms, at the slowed-down CPU).
    rasterMs: total((e) => e.name === 'RasterTask'),
    mainMs: mainMs('ThreadControllerImpl::RunTask'),
    scriptMs: mainMs('FunctionCall'),
    styleLayoutMs: mainMs('UpdateLayoutTree', 'Layout'),
    paintMs: mainMs('Paint'),
    // Waiting for the last frame's tiles before the next one can start.
    commitWaitMs: mainMs('Commit'),
    // How many times the whole map was drawn again for a new view.
    redraws,
    gestureMs: wallMs,
    moved,
  }),
);
await browser.close();
process.exit();
