// Development aid: a behaviour report for the computer opponents over several
// headless campaigns. Three questions:
//   pathologies — does the AI waste effort (armies marched back and forth,
//                 captures abandoned, idle reserves, starving stacks)?
//   variety     — do different seeds play differently, or is every opening the same?
//   challenge   — how long does an idle human last, and who comes for them?
//
//   npx vite-node scripts/dev/ai-report.ts [seeds=10] [minutes=90] [--human fr] [--difficulty easy|normal]
import {
  EUROPE_SCENARIO,
  Simulation,
  buildWorld,
  createInitialState,
  hostileArmiesIn,
  setAiOrderTrace,
  type AiDifficulty,
  type AiOrderTrace,
  type NationId,
} from '../../src/sim';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const human = (flag('human') ?? null) as NationId | null;
const difficulty = (flag('difficulty') ?? 'normal') as AiDifficulty;
const seeds = Number(args[0] ?? 10);
const minutes = Number(args[1] ?? 90);
const world = buildWorld(EUROPE_SCENARIO);
const city = (pid: string) => world.provinces[pid].city.name;
const REVERSAL_WINDOW = 240;

const count: Record<string, number> = {};
const add = (k: string, n = 1) => (count[k] = (count[k] ?? 0) + n);
const firstCapture: Record<string, Record<string, number>> = {};
const firstWar: Record<string, number> = {};
const firstWarMinute: number[] = [];
const outcomes: string[] = [];
const humanFell: string[] = [];
const humanAttacked: string[] = [];
const t0 = performance.now();

for (let seed = 1; seed <= seeds; seed++) {
  const sim = new Simulation(world, createInitialState(world, { seed, humanNation: human, difficulty }));
  const s = sim.state;
  const last = new Map<string, AiOrderTrace>();
  setAiOrderTrace((t) => {
    add('orders');
    const prev = last.get(t.armyId);
    last.set(t.armyId, t);
    if (s.provinces[t.from].capture?.by === t.nation) add('abandoned');
    if (t.reason === 'attack' && s.provinces[t.to].capture?.by === t.nation && hostileArmiesIn(s, t.to, t.nation).length === 0) add('pileOn');
    if (!prev || t.tick - prev.tick > REVERSAL_WINDOW || prev.to !== t.from) return;
    if (t.reason === 'retreat' && (prev.reason === 'attack' || prev.reason === 'strike')) add('failedAttack');
    else if (t.to === prev.from && prev.reason !== 'retreat') add('reversal');
  });

  const startOwner = Object.fromEntries(world.provinceIds.map((p) => [p, s.provinces[p].owner]));
  const captured = new Set<string>();
  let warSeen = false;
  let attacked = false;
  for (let m = 0; m < minutes && !s.outcome; m++) {
    sim.run(60);
    for (const pid of world.provinceIds) {
      const owner = s.provinces[pid].owner;
      if (owner === startOwner[pid] || owner === 'neutral' || owner === human || captured.has(owner)) continue;
      captured.add(owner);
      ((firstCapture[owner] ??= {})[city(pid)] ??= 0);
      firstCapture[owner][city(pid)]++;
    }
    const wars = world.nationIds.flatMap((a) => world.nationIds.filter((b) => a < b && s.nations[a].relations[b]?.status === 'war').map((b) => `${a}-${b}`));
    if (!warSeen && wars.length > 0) {
      warSeen = true;
      firstWarMinute.push(m + 1);
      for (const w of wars) firstWar[w] = (firstWar[w] ?? 0) + 1;
    }
    if (human && !attacked) {
      const foes = world.nationIds.filter((n) => s.nations[human].relations[n]?.status === 'war');
      if (foes.length > 0) {
        attacked = true;
        humanAttacked.push(`${foes.join('+')}@${m + 1}m`);
      }
    }
    for (const a of Object.values(s.armies)) {
      if (a.owner === 'neutral' || a.owner === human) continue;
      add('armyMinutes');
      if (!a.supplied) add('unsuppliedMinutes');
      const interior = s.provinces[a.province].owner === a.owner && world.neighbors[a.province].every((n) => s.provinces[n.id].owner === a.owner);
      if (!a.move && interior) add('idleRearMinutes');
    }
  }
  setAiOrderTrace(null);
  for (const e of s.events) if ((e.kind === 'attrition' || e.kind === 'disband') && !(human && e.nations.includes(human))) add(e.kind);
  const o = s.outcome;
  outcomes.push(o ? `${o.winner}:${o.reason === 'timeLimit' ? 'time' : o.reason === 'objectives' ? 'vp' : o.reason}@${Math.round(o.tick / 60)}m` : 'running');
  if (human) humanFell.push(s.nations[human].eliminated || o?.reason === 'humanEliminated' ? `${Math.round((o?.tick ?? s.tick) / 60)}m` : 'alive');
}

const per = (k: string, of: string, scale = 100) => (((count[k] ?? 0) / Math.max(1, count[of] ?? 0)) * scale).toFixed(1);
console.log(`${seeds} seeds × ${minutes} min, difficulty ${difficulty}${human ? `, idle human ${human}` : ', all AI'} — ${((performance.now() - t0) / 1000).toFixed(0)}s\n`);
console.log('Pathologies');
console.log(`  move orders                ${count.orders ?? 0} (${((count.orders ?? 0) / seeds).toFixed(0)} per game)`);
console.log(`  back-and-forth reversals   ${per('reversal', 'orders')}% of orders (A→B→A within ${REVERSAL_WINDOW / 60} min, not counting retreats)`);
console.log(`  captures abandoned         ${per('abandoned', 'orders')}% of orders`);
console.log(`  pile-on attacks            ${per('pileOn', 'orders')}% of orders (into a province already falling uncontested)`);
console.log(`  attack then retreat        ${per('failedAttack', 'orders')}% of orders`);
console.log(`  idle in the interior       ${per('idleRearMinutes', 'armyMinutes')}% of army-minutes (no border at all)`);
console.log(`  out of supply              ${per('unsuppliedMinutes', 'armyMinutes')}% of army-minutes; ${count.attrition ?? 0} armies starved, ${count.disband ?? 0} disband orders`);

console.log('\nVariety (first province each power captures, across seeds)');
let sameShare = 0;
let powers = 0;
for (const [nation, cities] of Object.entries(firstCapture).sort()) {
  const total = Object.values(cities).reduce((a, b) => a + b, 0);
  const list = Object.entries(cities).sort((a, b) => b[1] - a[1]);
  sameShare += list[0][1] / total;
  powers++;
  console.log(`  ${nation}: ${list.map(([c, n]) => `${c} ${n}`).join(', ')}`);
}
console.log(`  → the most common opening repeats in ${((sameShare / Math.max(1, powers)) * 100).toFixed(0)}% of games on average`);
const wars = Object.entries(firstWar).sort((a, b) => b[1] - a[1]);
firstWarMinute.sort((a, b) => a - b);
console.log(`  first war: ${wars.map(([w, n]) => `${w} ${n}`).join(', ') || 'none'}; at ${firstWarMinute[0] ?? '-'}–${firstWarMinute.at(-1) ?? '-'} min`);
console.log(`  outcomes: ${outcomes.join(' ')}`);
if (human) {
  console.log('\nChallenge (idle human)');
  console.log(`  first war on ${human}: ${humanAttacked.join(' ') || 'never'}`);
  console.log(`  ${human} eliminated: ${humanFell.join(' ')}`);
}
