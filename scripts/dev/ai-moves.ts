// Development aid: traces every AI army order in headless all-AI campaigns and
// reports armies sent back and forth — ordered A → B, then B → A soon after.
//   npx vite-node scripts/dev/ai-moves.ts [seeds=4] [minutes=60] [windowMinutes=4] [examples=6]
import { EUROPE_SCENARIO, Simulation, buildWorld, createInitialState, setAiOrderTrace, type AiOrderTrace } from '../../src/sim';

const seeds = Number(process.argv[2] ?? 4);
const minutes = Number(process.argv[3] ?? 60);
const windowTicks = Number(process.argv[4] ?? 4) * 60;
const examples = Number(process.argv[5] ?? 6);
const world = buildWorld(EUROPE_SCENARIO);
const city = (pid: string) => world.provinces[pid].city.name;
const clock = (tick: number) => `${Math.floor(tick / 60)}:${String(tick % 60).padStart(2, '0')}`;

const byReason: Record<string, number> = {};
/** Orders that pull an army out of an enemy or neutral province while it is capturing it, by reason. */
const abandoned: Record<string, number> = {};
let abandonedProgress = 0;
const pairs: Record<string, number> = {};
let orders = 0;
let reversals = 0;
let worst: { seed: number; army: string; count: number; trail: AiOrderTrace[] }[] = [];
const t0 = performance.now();

for (let seed = 1; seed <= seeds; seed++) {
  const trail = new Map<string, AiOrderTrace[]>();
  const sim = new Simulation(world, createInitialState(world, { seed, humanNation: null }));
  setAiOrderTrace((t) => {
    trail.set(t.armyId, [...(trail.get(t.armyId) ?? []), t]);
    const left = sim.state.provinces[t.from];
    if (left.capture?.by === t.nation) {
      abandoned[t.reason] = (abandoned[t.reason] ?? 0) + 1;
      abandonedProgress += left.capture.progress / left.capture.required;
    }
  });
  for (let m = 0; m < minutes && !sim.state.outcome; m++) sim.run(60);
  setAiOrderTrace(null);

  let seedOrders = 0;
  let seedReversals = 0;
  for (const [army, list] of trail) {
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      byReason[t.reason] = (byReason[t.reason] ?? 0) + 1;
      seedOrders++;
      const prev = list[i - 1];
      if (prev && t.to === prev.from && t.from === prev.to && t.tick - prev.tick <= windowTicks) {
        count++;
        const key = `${prev.reason} → ${t.reason}`;
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    }
    seedReversals += count;
    if (count > 0) worst.push({ seed, army, count, trail: list });
  }
  orders += seedOrders;
  reversals += seedReversals;
  console.log(`seed ${seed}: ${seedOrders} move orders, ${seedReversals} straight reversals (${((seedReversals / Math.max(1, seedOrders)) * 100).toFixed(1)}%)`);
}

const pct = (n: number) => `${((n / Math.max(1, orders)) * 100).toFixed(1)}%`;
console.log(`\nOrders by reason (${orders} total):`);
for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(9)} ${String(n).padStart(6)}  ${pct(n)}`);
const abandonedTotal = Object.values(abandoned).reduce((a, b) => a + b, 0);
console.log(
  `\nOrders leaving a province mid-capture: ${abandonedTotal} (${pct(abandonedTotal)}), on average ${((abandonedProgress / Math.max(1, abandonedTotal)) * 100).toFixed(0)}% captured — ${Object.entries(abandoned)
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${n}`)
    .join(', ')}`,
);
console.log(`\nStraight reversals within ${windowTicks / 60} min: ${reversals} (${pct(reversals)} of orders). Out-leg → back-leg:`);
for (const [k, n] of Object.entries(pairs).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${String(n).padStart(5)}`);

worst = worst.sort((a, b) => b.count - a.count).slice(0, examples);
for (const w of worst) {
  console.log(`\nseed ${w.seed} ${w.army} (${w.trail[0].nation}): ${w.count} reversals`);
  for (const t of w.trail.slice(0, 16)) console.log(`  ${clock(t.tick).padStart(6)}  ${t.reason.padEnd(9)} ${city(t.from)} → ${city(t.to)}`);
  if (w.trail.length > 16) console.log(`  … ${w.trail.length - 16} more`);
}
console.log(`\n${((performance.now() - t0) / 1000).toFixed(0)}s`);
