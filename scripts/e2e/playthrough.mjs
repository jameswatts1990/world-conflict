// Browser playthrough of the milestone loop against the production build:
// start → improve production → recruit → research → move → capture →
// save → reload → load → play on (DEV speed) to a win or loss.
//
//   npm run build && npm run e2e
//
// Uses Playwright's Chromium. Screenshots and a JSON summary go to e2e-output/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4175;
const URL = `http://localhost:${PORT}/`;
const OUT = 'e2e-output';
mkdirSync(OUT, { recursive: true });

// Run Vite's CLI directly: killing an `npx` wrapper would leave the server running and the script hanging.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => summary.errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') summary.errors.push(`console: ${m.text()}`);
});

const state = (fn) => page.evaluate(`(${fn})(window.__game.state)`);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function waitUntil(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await state(fn)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

/** A screen point that hits the given province's own <path> (not a marker or label). */
async function provincePoint(pid) {
  return page.evaluate((pid) => {
    const el = document.querySelector(`path[data-province="${pid}"]`);
    const r = el.getBoundingClientRect();
    for (let fy = 0.5, n = 0; n < 400; n++) {
      const fx = ((n * 0.618) % 1) * 0.9 + 0.05;
      fy = ((n * 0.382 + 0.5) % 1) * 0.9 + 0.05;
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y) === el) return { x, y };
    }
    return null;
  }, pid);
}

async function armyPoint(id) {
  return page.evaluate((id) => {
    const r = document.querySelector(`g[data-army="${id}"] rect`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function setSpeed(mult) {
  await page.click(`[data-speed="${mult}"]`);
}
async function setPaused(paused) {
  const isPaused = await page.evaluate(() => window.__game.loop.paused);
  if (isPaused !== paused) await page.click('[data-testid="pause"]');
}

try {
  // 1. Start a campaign as France and read the tutorial.
  await page.goto(URL);
  await shot('01-menu');
  await page.click('[data-nation-card="fr"]');
  await page.fill('.menu-options input[type="number"]', '2024');
  await page.click('[data-testid="start-campaign"]');
  await page.waitForSelector('[data-testid="tutorial"]');
  await shot('02-tutorial');
  for (let i = 0; i < 5; i++) await page.click('.tutorial button.primary');
  await page.click('[data-testid="tutorial-done"]');
  step('campaign started (France, seed 2024), tutorial completed');

  // 2. Improve production: upgrade Industrial Works in Paris.
  const paris = await provincePoint('fr-paris');
  await page.mouse.click(paris.x, paris.y);
  await page.waitForSelector('[data-testid="province-panel"][data-province="fr-paris"]');
  const money0 = await state((s) => s.nations.fr.resources.money);
  await page.click('[data-build="industry"]');
  const construction = await state((s) => s.provinces['fr-paris'].construction);
  if (!construction) throw new Error('construction did not start');
  step('ordered Industrial Works level 2 in Paris', { moneyBefore: Math.round(money0), job: construction.building });

  // 3. Recruit infantry in Paris.
  await page.click('[data-recruit="infantry"]');
  const queue = await state((s) => s.provinces['fr-paris'].recruitQueue.length);
  if (queue !== 1) throw new Error('recruitment did not queue');
  step('queued infantry in Paris');

  // 4. Research an upgrade.
  await page.click('[data-testid="open-research"]');
  await page.click('[data-tech="industrialMobilisation"] button');
  const research = await state((s) => s.nations.fr.research.active?.tech);
  if (research !== 'industrialMobilisation') throw new Error('research did not start');
  await shot('03-research');
  await page.keyboard.press('Escape');
  step('started research: Industrial Mobilisation');

  // 5. Move the Paris army to Nord (select marker, right-click destination).
  const parisArmy = await state((s) => Object.values(s.armies).find((a) => a.owner === 'fr' && a.province === 'fr-paris').id);
  const nordArmy = await state((s) => Object.values(s.armies).find((a) => a.owner === 'fr' && a.province === 'fr-nord').id);
  let p = await armyPoint(parisArmy);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector(`[data-testid="army-panel"][data-army="${parisArmy}"]`);
  const nord = await provincePoint('fr-nord');
  await page.mouse.click(nord.x, nord.y, { button: 'right' });
  const order = await page.evaluate((id) => window.__game.state.armies[id].move?.path, parisArmy);
  if (!order || order.at(-1) !== 'fr-nord') throw new Error('move order not accepted');
  await shot('04-move-order');
  step('ordered Paris army to Nord', { path: order });

  // 6. Run at DEV speed until the army arrives and the timers complete.
  await setSpeed(20);
  await setPaused(false);
  await waitUntil(`(s) => s.armies['${parisArmy}'].province === 'fr-nord' && !s.armies['${parisArmy}'].move`, 30000, 'army arrival');
  step('army arrived in Nord');
  await waitUntil((s) => (s.provinces['fr-paris'].buildings.industry ?? 0) >= 2, 30000, 'Industrial Works L2');
  step('Industrial Works level 2 completed (production improved)', {
    rate: await page.textContent('[data-resource="money"] .tb-res-rate'),
  });
  await waitUntil((s) => s.nations.fr.research.completed.includes('industrialMobilisation'), 40000, 'research');
  step('research completed: Industrial Mobilisation');
  await waitUntil((s) => s.provinces['fr-paris'].recruitQueue.length === 0, 30000, 'recruitment');
  step('infantry recruited');

  // 7. Merge in Nord and invade neutral Belgium & Luxembourg.
  await setPaused(true);
  p = await armyPoint(parisArmy);
  await page.mouse.click(p.x, p.y);
  await page.click('text=Merge here');
  const merged = await state((s) => Object.values(s.armies).filter((a) => a.owner === 'fr' && a.province === 'fr-nord').length);
  if (merged !== 1) throw new Error('merge failed');
  const benelux = await provincePoint('nt-benelux');
  await page.click('[data-testid="move-mode"]');
  await page.mouse.click(benelux.x, benelux.y);
  const target = await page.evaluate((id) => window.__game.state.armies[id].move?.path?.at(-1), parisArmy);
  if (target !== 'nt-benelux') throw new Error('attack order not accepted');
  step('merged armies and ordered the invasion of Belgium & Luxembourg', { nordArmyMerged: nordArmy });
  await setPaused(false);
  await waitUntil((s) => Object.keys(s.battles).includes('nt-benelux'), 30000, 'battle start');
  await page.waitForTimeout(400);
  await shot('05-battle');
  step('battle started in Belgium');
  await waitUntil((s) => s.provinces['nt-benelux'].owner === 'fr', 90000, 'capture of Belgium');
  await setPaused(true);
  await shot('06-captured');
  step('captured Belgium & Luxembourg', { tick: await state((s) => s.tick) });

  // 8. Save to slot 1, reload the page, load the slot and compare state hashes.
  await page.click('[data-testid="open-save"]');
  await page.click('[data-save-slot="slot-1"]');
  await page.waitForSelector('[data-testid="save-message"]');
  const savedHash = await page.evaluate(() => window.__hash());
  const savedTick = await state((s) => s.tick);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.click('[data-testid="menu-load"]');
  await page.click('[data-load-slot="slot-1"]');
  await page.waitForSelector('.game-screen');
  const loadedHash = await page.evaluate(() => window.__hash());
  const loadedTick = await state((s) => s.tick);
  if (loadedHash !== savedHash || loadedTick !== savedTick) throw new Error(`save/load mismatch ${savedHash} vs ${loadedHash}`);
  await shot('07-loaded');
  step('saved, reloaded the page and loaded: identical state', { tick: loadedTick, hash: loadedHash });

  // 9. Play on at DEV 200x until the campaign ends.
  await setSpeed(200);
  await setPaused(false);
  await page.waitForSelector('[data-testid="outcome"]', { timeout: 300000 });
  await page.waitForTimeout(300);
  await shot('08-outcome');
  const result = await page.getAttribute('[data-testid="outcome"]', 'data-result');
  const outcome = await state((s) => ({ winner: s.outcome.winner, reason: s.outcome.reason, minute: Math.round(s.outcome.tick / 60) }));
  step(`campaign ended: ${result === 'win' ? 'WIN' : 'LOSS'}`, outcome);
} catch (e) {
  summary.errors.push(`step failed: ${e.message}`);
  await shot('error').catch(() => {});
} finally {
  await browser.close();
  stopServer();
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  if (summary.errors.length) {
    console.error('E2E FAILED:\n' + summary.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`E2E passed (${summary.steps.length} steps). Screenshots in ${OUT}/`);
  }
}
