// Development aid: how each power fares across many all-AI campaigns. Starting
// positions differ (some powers have more neighbours, some are islands); across
// seeds the powers should still come out roughly even. Seeds run in parallel.
//
//   npx vite-node scripts/dev/balance.ts [seeds=80] [minutes=120] [--difficulty easy] [--jobs 4]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  EUROPE_SCENARIO,
  Simulation,
  buildWorld,
  createInitialState,
  nationName,
  sentence,
  type AiDifficulty,
  type NationId,
} from '../../src/sim';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const difficulty = (flag('difficulty') ?? 'normal') as AiDifficulty;
const jobs = Number(flag('jobs') ?? Math.min(4, cpus().length));
const range = flag('range');
const seeds = Number(args[0] ?? 80);
const minutes = Number(args[1] ?? 120);
const world = buildWorld(EUROPE_SCENARIO);
const SNAPSHOTS = [30, 60, 90, 120];

interface PowerRun {
  provinces: (number | null)[];
  capitalLost: number | null;
  eliminated: number | null;
  declared: number;
  declaredOn: number;
  enemyMinutes: number;
  aliveMinutes: number;
  lostTo: Record<string, number>;
}
interface Run {
  seed: number;
  winner: NationId | null;
  /** Leader on score when the campaign ran to its time limit. */
  scoreWinner: NationId | null;
  reason: string | null;
  minute: number | null;
  powers: Record<string, PowerRun>;
}

function play(seed: number): Run {
  const sim = new Simulation(world, createInitialState(world, { seed, humanNation: null, difficulty }));
  const s = sim.state;
  const declarations = new Map<string, [NationId, NationId]>();
  for (const a of world.nationIds) {
    for (const b of world.nationIds) if (a !== b) declarations.set(`${sentence(nationName(world, a))} declared war on ${nationName(world, b)}!`, [a, b]);
  }
  const powers: Record<string, PowerRun> = Object.fromEntries(
    world.nationIds.map((n) => [n, { provinces: [], capitalLost: null, eliminated: null, declared: 0, declaredOn: 0, enemyMinutes: 0, aliveMinutes: 0, lostTo: {} }]),
  );
  const owner = Object.fromEntries(world.provinceIds.map((p) => [p, s.provinces[p].owner]));
  const startOwner = { ...owner };
  let lastEvent = 0;
  const count = (n: NationId) => world.provinceIds.filter((p) => s.provinces[p].owner === n).length;
  let m = 0;
  for (; m < minutes && !s.outcome; m++) {
    sim.run(60);
    for (const e of s.events) {
      if (e.id <= lastEvent || e.kind !== 'war') continue;
      const pair = declarations.get(e.text);
      if (pair) {
        powers[pair[0]].declared++;
        powers[pair[1]].declaredOn++;
      }
    }
    lastEvent = s.nextEventId - 1;
    for (const pid of world.provinceIds) {
      const now = s.provinces[pid].owner;
      const was = owner[pid];
      if (now !== was && was !== 'neutral' && startOwner[pid] === was && now !== 'neutral') {
        powers[was].lostTo[now] = (powers[was].lostTo[now] ?? 0) + 1;
      }
      owner[pid] = now;
    }
    for (const n of world.nationIds) {
      const p = powers[n];
      if (s.nations[n].eliminated) {
        p.eliminated ??= m + 1;
        continue;
      }
      p.aliveMinutes++;
      p.enemyMinutes += world.nationIds.filter((o) => s.nations[n].relations[o]?.status === 'war').length;
      if (p.capitalLost === null && s.provinces[world.nations[n].capital].owner !== n) p.capitalLost = m + 1;
    }
    if (SNAPSHOTS.includes(m + 1)) for (const n of world.nationIds) powers[n].provinces.push(count(n));
  }
  // A campaign that ends early keeps its final map for the later snapshots.
  for (const n of world.nationIds) while (powers[n].provinces.length < SNAPSHOTS.length && SNAPSHOTS[powers[n].provinces.length] <= minutes) powers[n].provinces.push(count(n));
  const o = s.outcome;
  return { seed, winner: o?.reason === 'timeLimit' ? null : (o?.winner ?? null), scoreWinner: o?.reason === 'timeLimit' ? o.winner : null, reason: o?.reason ?? null, minute: o ? Math.round(o.tick / 60) : null, powers };
}

if (range) {
  // Worker: play a range of seeds and print one JSON line each.
  const [from, to] = range.split('-').map(Number);
  for (let seed = from; seed <= to; seed++) console.log(JSON.stringify(play(seed)));
  process.exit(0);
}

async function runAll(): Promise<Run[]> {
  const script = fileURLToPath(import.meta.url);
  const per = Math.ceil(seeds / jobs);
  const parts = Array.from({ length: jobs }, (_, j) => [j * per + 1, Math.min(seeds, (j + 1) * per)]).filter(([a, b]) => a <= b);
  const outputs = await Promise.all(
    parts.map(
      ([a, b]) =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(process.execPath, [process.argv[1], script, String(seeds), String(minutes), '--difficulty', difficulty, '--range', `${a}-${b}`]);
          let out = '';
          child.stdout.on('data', (d) => (out += d));
          child.stderr.on('data', (d) => process.stderr.write(d));
          child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`seeds ${a}-${b} failed (${code})`))));
        }),
    ),
  );
  return outputs
    .flatMap((o) => o.split('\n'))
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Run)
    .sort((x, y) => x.seed - y.seed);
}

const t0 = performance.now();
const runs = await runAll();
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const snaps = SNAPSHOTS.filter((t) => t <= minutes);
const decided = runs.filter((r) => r.winner);

console.log(`${runs.length} seeds × ${minutes} min, difficulty ${difficulty}, all AI — ${((performance.now() - t0) / 1000).toFixed(0)}s`);
console.log(`${decided.length} decided (${decided.map((r) => r.minute!).sort((a, b) => a - b).join(' ')} min); the rest ran to the limit\n`);
const head = ['power', 'wins', 'on time', 'out', ...snaps.map((t) => `prov@${t}`), 'capital lost', 'wars by/on', 'enemies', 'land lost to'];
const rows = world.nationIds.map((n) => {
  const p = runs.map((r) => r.powers[n]);
  const lost: Record<string, number> = {};
  for (const x of p) for (const [k, v] of Object.entries(x.lostTo)) lost[k] = (lost[k] ?? 0) + v;
  const lostTotal = Object.values(lost).reduce((a, b) => a + b, 0);
  const capitals = p.map((x) => x.capitalLost).filter((x): x is number => x !== null);
  return [
    n,
    String(decided.filter((r) => r.winner === n).length),
    String(runs.filter((r) => r.scoreWinner === n).length),
    String(p.filter((x) => x.eliminated !== null).length),
    ...snaps.map((_, i) => mean(p.map((x) => x.provinces[i] ?? 0)).toFixed(1)),
    capitals.length ? `${capitals.length} (~${median(capitals)}m)` : '0',
    `${mean(p.map((x) => x.declared)).toFixed(1)}/${mean(p.map((x) => x.declaredOn)).toFixed(1)}`,
    (mean(p.map((x) => x.enemyMinutes)) / Math.max(1, mean(p.map((x) => x.aliveMinutes)))).toFixed(2),
    Object.entries(lost)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${Math.round((v / lostTotal) * 100)}%`)
      .join(', ') || '-',
  ];
});
const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(width[i])).join('  '));
console.log(`\nwins: decided campaigns won · on time: led on score at the time limit · out: eliminated · prov@t: provinces held (start: ${world.nationIds.map((n) => world.provinceIds.filter((p) => world.provinces[p].core === n).length).join('/')})`);
console.log('wars by/on: declarations made and suffered per campaign · enemies: powers at war with it at once, on average while alive');
