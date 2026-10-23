// Browser playthrough of the milestone loop against the test build:
// start → improve production → recruit → research → move → capture →
// save → reload → load → play on (DEV speed) to a win or loss.
//
// It plays Spain and invades Portugal, which borders only Spain, so no computer
// opponent can race the player to the target however the real-time clock falls.
// Portugal is a minor power with a fortified capital: Spain gathers most of its
// army in the land of Castile and León and raises more before it marches on
// Lisbon through the land round it.
//
//   npm run build:e2e && npm run e2e
//
// Uses Playwright's Chromium. Screenshots and a JSON summary go to e2e-output/.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4175;
const URL = `http://localhost:${PORT}/`;
const OUT = 'e2e-output';
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

/** The middle of a city's marker or model, which answers clicks for the city. */
async function cityPoint(pid) {
  return page.evaluate((pid) => {
    const r = document.querySelector(`[data-city="${pid}"]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
  // 1. Start a campaign as Spain and read the tutorial.
  await page.goto(URL);
  await shot('01-menu');
  await page.click('[data-nation-card="es"]');
  await page.fill('.menu-options input[type="number"]', '2024');
  await page.click('[data-testid="start-campaign"]');
  await page.waitForSelector('[data-testid="tutorial"]');
  await shot('02-tutorial');
  while (!(await page.$('[data-testid="tutorial-done"]'))) await page.click('.tutorial button.primary');
  await page.click('[data-testid="tutorial-done"]');
  step('campaign started (Spain, seed 2024), tutorial completed');

  // 2. Improve production: upgrade Industrial Works in Madrid.
  const madrid = await cityPoint('es-madrid');
  await page.mouse.click(madrid.x, madrid.y);
  await page.waitForSelector('[data-testid="province-panel"][data-province="es-madrid"]');
  const money0 = await state((s) => s.nations.es.resources.money);
  await page.click('[data-build="industry"]');
  const construction = await state((s) => s.provinces['es-madrid'].construction);
  if (!construction) throw new Error('construction did not start');
  step('ordered Industrial Works level 2 in Madrid', { moneyBefore: Math.round(money0), job: construction.building });

  // 3. Recruit infantry in Madrid (Recruit tab of the city view).
  await page.click('[data-tab="recruit"]');
  await page.click('[data-recruit="infantry"]');
  const queue = await state((s) => s.provinces['es-madrid'].recruitQueue.length);
  if (queue !== 1) throw new Error('recruitment did not queue');
  step('queued infantry in Madrid');

  // 4. Research an upgrade.
  await page.click('[data-testid="open-research"]');
  await page.click('[data-tech="industrialMobilisation"]');
  const research = await state((s) => s.nations.es.research.active.map((j) => j.tech));
  if (!research.includes('industrialMobilisation')) throw new Error('research did not start');
  // Clicking a locked technology queues it with its missing prerequisites.
  await page.click('[data-tech="lightTanks"]');
  const researchQueue = await state((s) => s.nations.es.research.queue);
  if (researchQueue.join(',') !== 'landships,lightTanks') throw new Error(`research path not queued: ${researchQueue}`);
  await shot('03-research');
  await page.keyboard.press('Escape');
  step('started research: Industrial Mobilisation; queued Landships → Light Tanks');

  // 5. Move the Madrid garrison out to Salamanca, in Castile & León (select marker, right-click destination).
  const madridArmy = await state((s) => Object.values(s.armies).find((a) => a.owner === 'es' && a.province === 'es-madrid').id);
  const castileArmy = await state((s) => Object.values(s.armies).find((a) => a.owner === 'es' && a.province === 'es-castile-sw').id);
  let p = await armyPoint(madridArmy);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector(`[data-testid="army-panel"][data-army="${madridArmy}"]`);
  const castile = await provincePoint('es-castile-sw');
  await page.mouse.click(castile.x, castile.y, { button: 'right' });
  const order = await page.evaluate((id) => window.__game.state.armies[id].move?.path, madridArmy);
  if (!order || order.at(-1) !== 'es-castile-sw') throw new Error('move order not accepted');
  await shot('04-move-order');
  step('ordered Madrid army to Salamanca', { path: order });
  // The Barcelona garrison and the northern field army join them.
  const others = await state((s) => Object.values(s.armies).filter((a) => a.owner === 'es' && ['es-catalonia', 'es-north-se'].includes(a.province)).map((a) => a.id));
  for (const id of others) {
    p = await armyPoint(id);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector(`[data-testid="army-panel"][data-army="${id}"]`);
    await page.mouse.click(castile.x, castile.y, { button: 'right' });
    const path = await page.evaluate((id) => window.__game.state.armies[id].move?.path, id);
    if (!path || path.at(-1) !== 'es-castile-sw') throw new Error('move order not accepted');
  }
  step('ordered the Catalan and northern armies to Salamanca', { armies: others.length });

  // 6. Run at DEV speed until the army arrives and the timers complete.
  await setSpeed(20);
  await setPaused(false);
  await waitUntil(`(s) => s.armies['${madridArmy}'].province === 'es-castile-sw' && !s.armies['${madridArmy}'].move`, 30000, 'army arrival');
  step('army arrived in Salamanca');
  await waitUntil(`(s) => ${JSON.stringify(others)}.every((id) => s.armies[id].province === 'es-castile-sw' && !s.armies[id].move)`, 60000, 'Catalan and northern armies');
  step('the Catalan and northern armies arrived');
  await waitUntil((s) => (s.provinces['es-madrid'].buildings.industry ?? 0) >= 2, 30000, 'Industrial Works L2');
  step('Industrial Works level 2 completed (production improved)', {
    rate: await page.textContent('[data-resource="money"] .tb-res-rate'),
  });
  await waitUntil((s) => s.nations.es.research.completed.includes('industrialMobilisation'), 40000, 'research');
  step('research completed: Industrial Mobilisation');
  await waitUntil((s) => s.provinces['es-madrid'].recruitQueue.length === 0, 30000, 'recruitment');
  // With the new works paying out, raise more for Portugal's fortified capital: infantry and an artillery battery.
  await setPaused(true);
  const madridPoint = await cityPoint('es-madrid');
  await page.mouse.click(madridPoint.x, madridPoint.y);
  await page.waitForSelector('[data-testid="province-panel"][data-province="es-madrid"]');
  await page.click('[data-tab="recruit"]');
  await page.click('[data-recruit="infantry"]');
  await page.click('[data-recruit="artillery"]');
  if ((await state((s) => s.provinces['es-madrid'].recruitQueue.length)) !== 2) throw new Error('second recruitment did not queue');
  await setPaused(false);
  await waitUntil((s) => s.provinces['es-madrid'].recruitQueue.length === 0, 30000, 'second recruitment');
  step('infantry recruited, then more infantry and an artillery battery');

  // The recruits joined up in Madrid after the army left: march them to Salamanca as well.
  const recruits = await state((s) => Object.values(s.armies).find((a) => a.owner === 'es' && a.province === 'es-madrid').id);
  await setPaused(true);
  let r = await armyPoint(recruits);
  await page.mouse.click(r.x, r.y);
  await page.waitForSelector(`[data-testid="army-panel"][data-army="${recruits}"]`);
  r = await provincePoint('es-castile-sw');
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await setPaused(false);
  await waitUntil(`(s) => s.armies['${recruits}'].province === 'es-castile-sw' && !s.armies['${recruits}'].move`, 30000, 'recruits arrival');
  step('recruits marched to Salamanca');

  // 7. Merge in Salamanca and attack Portugal (a minor power): the order asks to declare war first.
  await setPaused(true);
  p = await armyPoint(madridArmy);
  await page.mouse.click(p.x, p.y);
  await page.click('text=Merge here');
  const merged = await state((s) => Object.values(s.armies).filter((a) => a.owner === 'es' && a.province === 'es-castile-sw'));
  if (merged.length !== 1) throw new Error('merge failed');
  const portugal = await cityPoint('pt-lisbon');
  await page.click('[data-testid="move-mode"]');
  await page.mouse.click(portugal.x, portugal.y);
  await page.waitForSelector('[data-testid="confirm"]');
  if ((await state((s) => s.nations.es.relations.pt.status)) !== 'peace') throw new Error('war declared without asking');
  await page.click('[data-testid="confirm"]');
  if ((await state((s) => s.nations.es.relations.pt.status)) !== 'war') throw new Error('war on Portugal not declared');
  const target = await page.evaluate((id) => window.__game.state.armies[id].move?.path?.at(-1), madridArmy);
  if (target !== 'pt-lisbon') throw new Error('attack order not accepted');
  step('merged armies, ordered the invasion of Portugal and declared war when asked', { castileArmyMerged: castileArmy, units: merged[0].units.length });
  await setPaused(false);
  await waitUntil((s) => Object.keys(s.battles).some((pid) => pid.startsWith('pt-')), 30000, 'battle start');
  await page.waitForTimeout(400);
  await shot('05-battle');
  step('battle started in Portugal');
  // A Move order marches through the lands round Lisbon (they stay Portuguese) and takes the city.
  await waitUntil((s) => s.provinces['pt-lisbon'].owner === 'es', 90000, 'capture of Lisbon');
  await setPaused(true);
  await shot('06-captured');
  // What the fortress cost: the invaders' remaining strength (100% = every division at full strength).
  const strength = await state((s) => {
    const units = Object.values(s.armies).filter((a) => a.owner === 'es' && a.province === 'pt-lisbon').flatMap((a) => a.units);
    return `${units.length} divisions at ${Math.round((100 * units.reduce((t, u) => t + u.strength, 0)) / units.length)}%`;
  });
  step('captured Lisbon', { tick: await state((s) => s.tick), invaders: strength, landHeldBy: await state((s) => ['pt-lisbon-n', 'pt-lisbon-ne', 'pt-lisbon-nne', 'pt-lisbon-se'].map((id) => s.provinces[id].owner).join(' ')) });

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
  process.exit();
}
