// Browser check of the phone layouts against the test build: a touch screen
// held upright (bottom tab bar, bottom sheet), then turned on its side (slim tab bar,
// side sheet). It plays a short stretch as Spain through the touch controls only:
// a city's full-screen page (build, recruit with a steady layout, a unit's details),
// the sheet's handle on a province without a city, a move previewed and confirmed,
// an attack that asks to declare war, research, field reports, pause and save; and
// checks that nothing spills off the screen and that tapping never moves the map.
//
//   npm run build:e2e && npm run e2e:mobile
//
// Uses Playwright's Chromium with touch emulation. Screenshots and a JSON summary go to e2e-output/mobile/.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4176;
const URL = `http://localhost:${PORT}/`;
const OUT = 'e2e-output/mobile';
mkdirSync(OUT, { recursive: true });
// The production build with the window.__game handle these checks read the game through.
if (!existsSync('dist-e2e/index.html')) throw new Error('no test build: run `npm run build:e2e` first');

// Run Vite's CLI directly: killing an `npx` wrapper would leave the server running and the script hanging.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stopServer = () => server.exitCode === null && server.kill('SIGTERM');
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start');
}

const summary = { steps: [], errors: [] };
function step(name, detail = {}) {
  summary.steps.push({ name, ...detail });
  console.log(`✓ ${name}`, Object.keys(detail).length ? JSON.stringify(detail) : '');
}

await waitForServer();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// A common Android phone held upright: narrower than most iPhones.
const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.on('pageerror', (e) => summary.errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') summary.errors.push(`console: ${m.text()}`);
});

const state = (fn) => page.evaluate(`(${fn})(window.__game.state)`);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const settle = () => page.waitForTimeout(350);

async function waitUntil(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await state(fn)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

/** A screen point that hits the given province's own <path> (not a marker, label or panel). */
async function provincePoint(pid) {
  const p = await page.evaluate((pid) => {
    const el = document.querySelector(`path[data-province="${pid}"]`);
    const r = el.getBoundingClientRect();
    for (let n = 0; n < 400; n++) {
      const x = r.left + r.width * (((n * 0.618) % 1) * 0.9 + 0.05);
      const y = r.top + r.height * (((n * 0.382 + 0.5) % 1) * 0.9 + 0.05);
      if (document.elementFromPoint(x, y) === el) return { x, y };
    }
    return null;
  }, pid);
  if (!p) throw new Error(`no visible point in ${pid}`);
  return p;
}

/** The centre of an army counter, if nothing covers it. */
async function armyPoint(id) {
  const p = await page.evaluate((id) => {
    const g = document.querySelector(`g[data-army="${id}"]`);
    const r = g.querySelector('rect').getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return document.elementFromPoint(x, y)?.closest('[data-army]') === g ? { x, y } : null;
  }, id);
  if (!p) throw new Error(`army counter ${id} is covered or off screen`);
  return p;
}

const tapAt = (p) => page.touchscreen.tap(p.x, p.y);

/** The middle of a city's marker or model, which answers taps for the city, if nothing covers it. */
async function cityPoint(pid) {
  const p = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-city="${pid}"]`);
    const r = el.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    return document.elementFromPoint(x, y) === el ? { x, y } : null;
  }, pid);
  if (!p) throw new Error(`the city ${pid} is covered or off screen`);
  return p;
}

// Where the map is on screen: the zoom behaviour's view (a drag may only move the drawing, not draw it again).
const mapView = () =>
  page.evaluate(() => {
    const t = document.querySelector('.map-stage').__zoom;
    return `${t.x},${t.y},${t.k}`;
  });

/** Fails if the briefing's text or buttons reach past the dialog or the screen. */
async function checkBriefingFits(label) {
  const problem = await page.evaluate(() => {
    const box = document.querySelector('.tutorial').getBoundingClientRect();
    for (const el of document.querySelectorAll('.tutorial h3, .tutorial p, .tutorial-foot button')) {
      const r = el.getBoundingClientRect();
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) return `${el.textContent.slice(0, 30)} spills out of the briefing`;
    }
    if (box.left < 0 || box.top < 0 || box.right > window.innerWidth || box.bottom > window.innerHeight) return 'the briefing runs off the screen';
    return null;
  });
  if (problem) throw new Error(`${label}: ${problem}`);
}

/** Fails if any part of the HUD reaches past the screen's edges or a resource readout is clipped. */
async function checkFits(label) {
  const problems = await page.evaluate(() => {
    const out = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (document.documentElement.scrollWidth > w) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${w})`);
    const parts = ['.topbar', '.nav-rail', '.map-toolbar', '.map-nav', '.selection-dock', '.city-page', '.tb-res', '.tb-vp', '.tb-clock', '.tb-speed', '.rail-btn'];
    for (const sel of parts) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -0.5 || r.right > w + 0.5 || r.top < -0.5 || r.bottom > h + 0.5) out.push(`${sel} off screen (${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)})`);
      }
    }
    for (const el of document.querySelectorAll('.tb-res-text')) if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped resource: ${el.textContent}`);
    return out;
  });
  if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
}

try {
  // 1. Start as Spain and read the briefing, which speaks of taps.
  await page.goto(URL);
  await shot('01-menu');
  await page.tap('[data-nation-card="es"]');
  await page.fill('.menu-options input[type="number"]', '2024');
  await page.tap('[data-testid="start-campaign"]');
  await page.waitForSelector('[data-testid="tutorial"]');
  const layout = await page.getAttribute('.game-screen', 'class');
  if (!layout.includes('layout-portrait') || !layout.includes('touch')) throw new Error(`expected the portrait touch layout, got "${layout}"`);
  let touchCopy = false;
  for (let n = 1; !(await page.$('[data-testid="tutorial-done"]')); n++) {
    touchCopy ||= (await page.textContent('.tutorial')).includes('Tap an army counter');
    await checkBriefingFits(`briefing ${n}`);
    await page.tap('.tutorial button.primary');
  }
  if (!touchCopy) throw new Error('the briefing did not explain the touch controls');
  await shot('02-briefing-end');
  await page.tap('[data-testid="tutorial-done"]');
  await settle();
  await checkFits('portrait');
  if (await page.$('.selection-dock')) throw new Error('the map should open clear, with nothing selected');
  if (await page.$('.minimap')) throw new Error('phones have no overview map');
  await shot('03-portrait');
  step('campaign started on an upright phone; briefing in touch terms and on screen; map clear; HUD fits the screen');

  // 2. Tap Madrid: the city opens as a page of its own, without the skyline, and the map stays where it was.
  //    Build and recruit there: recruiting again and again never moves the Recruit button.
  const before = await mapView();
  await tapAt(await cityPoint('es-madrid'));
  await page.waitForSelector('[data-testid="city-page"] [data-testid="province-panel"][data-province="es-madrid"]');
  await settle();
  if (await page.$('.selection-dock')) throw new Error('the city page and the sheet are both open');
  if (await page.$('.city-page .city-scene-wrap')) throw new Error('the phone city page should not show the skyline');
  if ((await mapView()) !== before) throw new Error('tapping a city moved the map');
  await checkFits('city page');
  await page.tap('[data-build="industry"]');
  if (!(await state((s) => s.provinces['es-madrid'].construction))) throw new Error('construction did not start');
  await page.tap('[data-tab="recruit"]');
  const button = async () => (await page.locator('[data-recruit="infantry"]').boundingBox()).y;
  const y0 = await button();
  await page.tap('[data-recruit="infantry"]');
  await page.tap('[data-recruit="infantry"]');
  if ((await state((s) => s.provinces['es-madrid'].recruitQueue.length)) !== 2) throw new Error('recruitment did not queue');
  if (Math.abs((await button()) - y0) > 0.5) throw new Error('recruiting moved the Recruit button');
  if (await page.$('[data-unit-card="lightTank"]')) throw new Error('units not yet researched should not be offered');
  await shot('04-madrid-page');
  await page.tap('[data-unit-info="artillery"]');
  await page.waitForSelector('[data-testid="unit-info"][data-unit="artillery"]');
  const info = await page.textContent('[data-testid="unit-info"]');
  if (!info.includes('Strengths') || !info.includes('Weaknesses')) throw new Error('the unit details lack strengths and weaknesses');
  await shot('05-unit-info');
  await page.tap('.modal [aria-label="Close"]');
  await page.tap('[data-testid="close-page"]');
  if (await page.$('[data-testid="city-page"]')) throw new Error('the city page did not close');
  step('tapped Madrid: a full-screen city page without the skyline, the map unmoved; built, recruited twice with the button in place, read the artillery details');

  // 3. A province without a city opens in the bottom sheet, halfway up. Its handle drags up to full,
  //    then down past peek to close.
  await tapAt(await provincePoint('es-madrid-s'));
  await page.waitForSelector('.selection-dock [data-testid="province-panel"][data-province="es-madrid-s"]');
  await settle();
  if ((await page.getAttribute('.selection-dock', 'data-sheet')) !== 'half') throw new Error('the sheet did not open at half');
  if ((await mapView()) !== before) throw new Error('tapping a province moved the map');
  const handle = await page.locator('[data-testid="sheet-handle"]').boundingBox();
  const hx = handle.x + handle.width / 2;
  const hy = handle.y + handle.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy - 300, { steps: 8 });
  await page.mouse.up();
  await settle();
  if ((await page.getAttribute('.selection-dock', 'data-sheet')) !== 'full') throw new Error('dragging the handle up did not fill the screen');
  const full = await page.locator('[data-testid="sheet-handle"]').boundingBox();
  await page.mouse.move(hx, full.y + full.height / 2);
  await page.mouse.down();
  await page.mouse.move(hx, 770, { steps: 8 });
  await page.mouse.up();
  await settle();
  if (await page.$('.selection-dock')) throw new Error('dragging the handle down did not close the sheet');
  step('tapped La Mancha: a province without a city in the bottom sheet; dragged it open to full, then down to close it');

  // 4. Move an army: tap it, Move, tap the destination (a preview), then Confirm.
  const army = await state((s) => Object.values(s.armies).find((a) => a.owner === 'es' && a.province === 'es-madrid').id);
  await tapAt(await armyPoint(army));
  await page.waitForSelector(`[data-testid="army-panel"][data-army="${army}"]`);
  // Its formations open their unit's details too.
  await page.tap('[data-testid="army-panel"] [data-unit-info]');
  await page.waitForSelector('[data-testid="unit-info"]');
  await page.tap('.modal [aria-label="Close"]');
  await page.tap('[data-testid="move-mode"]');
  await settle();
  if ((await page.getAttribute('.selection-dock', 'data-sheet')) !== 'peek') throw new Error('move mode did not lower the sheet');
  await tapAt(await provincePoint('es-castile-e'));
  await settle();
  const banner = await page.textContent('[data-testid="move-confirm"]');
  if (!banner.includes('Move to')) throw new Error(`no route preview: "${banner}"`);
  if (await state(`(s) => !!s.armies['${army}'].move`)) throw new Error('the first tap already gave the order');
  await shot('05-move-preview');
  await page.tap('[data-testid="confirm-move"]');
  const path = await state(`(s) => s.armies['${army}'].move?.path`);
  if (!path || path.at(-1) !== 'es-castile-e') throw new Error('move order not given');
  step('tapped an army (and a formation, for its details), Move, a destination (preview) and Confirm', { preview: banner.replace(/(Confirm|Cancel)/g, '').trim(), path });

  // An attack on a nation at peace asks to declare war first; cancelling leaves the peace and the march alone.
  // (Portugal's south-eastern land: on this screen its northern one lies under its army and the roads out of it.)
  await page.tap('[data-testid="move-mode"]');
  await settle();
  await tapAt(await provincePoint('pt-lisbon-se'));
  await settle();
  const warBanner = await page.textContent('[data-testid="move-confirm"]');
  if (!warBanner.includes('At peace with Portugal')) throw new Error(`no peace warning: "${warBanner}"`);
  await page.tap('[data-testid="confirm-move"]');
  await page.waitForSelector('.modal >> text=War with Portugal?');
  await shot('05b-declare-war');
  await page.tap('.modal >> text=Cancel');
  if ((await state((s) => s.nations.es.relations.pt.status)) !== 'peace') throw new Error('cancelling still declared war');
  if ((await state(`(s) => s.armies['${army}'].move?.path?.at(-1)`)) !== 'es-castile-e') throw new Error('cancelling changed the march');
  step('an attack on Portugal asked to declare war; cancelled', { preview: warBanner.replace(/(Declare war…|Cancel)/g, '').trim() });

  // 5. Research from the tab bar: the phone list, one branch at a time. A tap shows a
  //    technology's details without spending anything; the order comes from there.
  await page.tap('[data-testid="open-research"]');
  await page.tap('[data-branch="industry"]');
  await page.tap('[data-tech="industrialMobilisation"]');
  await page.waitForSelector('[data-tech-detail="industrialMobilisation"]');
  if (await state((s) => s.nations.es.research.active.length)) throw new Error('tapping a technology already started it');
  await page.tap('[data-testid="research-action"]');
  if (!(await state((s) => s.nations.es.research.active.some((j) => j.tech === 'industrialMobilisation')))) throw new Error('research did not start');
  // A locked technology queues with the prerequisites it still needs.
  await page.tap('[data-branch="armour"]');
  await page.tap('[data-tech="lightTanks"]');
  const queueLabel = await page.textContent('[data-testid="research-action"]');
  if (!/Queue 2/i.test(queueLabel)) throw new Error(`expected to queue a path of two, got "${queueLabel}"`);
  await page.tap('[data-testid="research-action"]');
  const researchQueue = await state((s) => s.nations.es.research.queue);
  if (researchQueue.join(',') !== 'landships,lightTanks') throw new Error(`research path not queued: ${researchQueue}`);
  // Its requirement is a link to that technology's details.
  await page.tap('.tech-detail .td-link >> text=Landships');
  await page.waitForSelector('[data-tech-detail="landships"]');
  await shot('06-research');
  await page.tap('.modal-header [aria-label="Close"]');
  step('research list: details before spending; started Industrial Mobilisation; queued Landships → Light Tanks');

  // 6. Field reports open over the map and close again.
  await page.tap('[data-testid="toggle-reports"]');
  await page.waitForSelector('[data-testid="event-log"]');
  await shot('07-reports');
  await page.tap('[data-testid="event-log"] header');
  if (await page.$('[data-testid="event-log"]')) throw new Error('field reports did not close');
  step('opened and closed the field reports');

  // 7. Run the clock (fast, from the console: the phone has no DEV speeds) until the army arrives;
  //    pause from the top bar, resume from the Paused banner.
  await page.evaluate(() => window.__game.setSpeed(20));
  await page.tap('[data-testid="pause"]');
  await waitUntil(`(s) => s.armies['${army}'].province === 'es-castile-e' && !s.armies['${army}'].move`, 30000, 'army arrival');
  await page.tap('[data-testid="pause"]');
  await page.tap('[data-testid="paused-banner"]');
  if (await page.evaluate(() => window.__game.loop.paused)) throw new Error('tapping the Paused banner did not resume');
  await page.tap('[data-testid="pause"]');
  step('army arrived; paused from the top bar and resumed from the banner');

  // 8. Save from More.
  await page.tap('[data-testid="open-more"]');
  await page.tap('[data-testid="open-save"]');
  await page.tap('[data-save-slot="slot-1"]');
  await page.waitForSelector('[data-testid="save-message"]');
  await page.tap('.modal [aria-label="Close"]');
  step('saved from the More menu');

  // 9. Diplomacy as cards: a co-belligerent's shared-sight line and a truce take a line of their own, so no
  //    figure runs into the next. Set from the console (the game is paused) and put back afterwards.
  // Each entry is [a, b, a's relation to b, b's to a (the same if left out)]; returns the entries that undo it.
  const setRelations = (pairs) =>
    page.evaluate(
      (pairs) =>
        pairs.map(([a, b, rel, back = rel]) => {
          const n = window.__game.state.nations;
          const old = [a, b, n[a].relations[b], n[b].relations[a]];
          n[a].relations[b] = { ...rel };
          n[b].relations[a] = { ...back };
          return old;
        }),
      pairs,
    );
  const tick = await state((s) => s.tick);
  const war = { status: 'war', since: tick, truceUntil: 0 };
  const saved = await setRelations([['es', 'fr', war], ['it', 'fr', war], ['es', 'pt', { status: 'peace', since: tick, truceUntil: tick + 3000 }]]);
  await page.tap('[data-testid="open-diplomacy"]');
  await page.waitForSelector('.dip-relations [data-ally="it"]');
  await settle();
  const crowded = await page.evaluate(() => {
    const out = [];
    for (const tr of document.querySelectorAll('.dip-relations tbody tr')) {
      const card = tr.getBoundingClientRect();
      // A cell shown as `display: contents` has no box: its children are the card's pieces.
      const pieces = [...tr.children].flatMap((td) => (getComputedStyle(td).display === 'contents' ? [...td.children] : [td]));
      const boxes = pieces.map((el) => [el, [el, ...el.querySelectorAll('*')].map((d) => d.getBoundingClientRect()).filter((r) => r.width && r.height)]);
      for (const [el, rs] of boxes) {
        if (rs.some((r) => r.left < card.left - 0.5 || r.right > card.right + 0.5)) out.push(`${tr.dataset.nation}: ${el.className} runs out of its card`);
        for (const [other] of boxes) {
          if (other === el || !other.textContent.trim()) continue;
          const o = other.getBoundingClientRect();
          if (rs.some((r) => Math.min(r.right, o.right) - Math.max(r.left, o.left) > 0.5 && Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 0.5))
            out.push(`${tr.dataset.nation}: ${el.className} runs into ${other.className}`);
        }
      }
    }
    return [...new Set(out)];
  });
  if (crowded.length) throw new Error(`diplomacy cards: ${crowded.join('; ')}`);
  await shot('09-diplomacy');
  await page.tap('.modal-header [aria-label="Close"]');
  await setRelations(saved);
  step('diplomacy cards: a co-belligerent and a truce keep their figures apart');

  // 10. Turn the phone on its side: slim tab bar along the bottom, side sheet, one-row top bar.
  await page.setViewportSize({ width: 844, height: 390 });
  await settle();
  const turned = await page.getAttribute('.game-screen', 'class');
  if (!turned.includes('layout-landscape')) throw new Error(`expected the landscape layout, got "${turned}"`);
  const bar = await page.locator('.nav-rail').boundingBox();
  if (bar.width < 840 || bar.y + bar.height < 389 || bar.height > 48) throw new Error(`expected a slim tab bar along the bottom, got ${JSON.stringify(bar)}`);
  // Turning the phone keeps the view where it was: bring the capital back into it (C).
  await page.keyboard.press('c');
  await page.waitForTimeout(700);
  await tapAt(await cityPoint('es-madrid'));
  await page.waitForSelector('[data-testid="city-page"] [data-testid="province-panel"][data-province="es-madrid"]');
  await settle();
  await checkFits('landscape');
  await shot('08-landscape');
  await page.tap('[data-testid="close-page"]');
  await tapAt(await provincePoint('es-madrid-s'));
  await page.waitForSelector('.selection-dock [data-testid="province-panel"][data-province="es-madrid-s"]');
  await settle();
  await checkFits('landscape sheet');
  step('turned the phone: landscape layout with the tab bar along the bottom, the city as a page and La Mancha in a side sheet; HUD fits the screen');
} catch (e) {
  summary.errors.push(`step failed: ${e.message}`);
  await shot('error').catch(() => {});
} finally {
  await browser.close();
  stopServer();
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  if (summary.errors.length) {
    console.error('MOBILE E2E FAILED:\n' + summary.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Mobile E2E passed (${summary.steps.length} steps). Screenshots in ${OUT}/`);
  }
  process.exit();
}
