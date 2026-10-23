// npm run balance:techs: the tech lab. What each technology is worth to the nation that has it,
// by experiment: the same campaigns with and without it handed to a test seat (see techlab.ts).
//
//   npm run balance:techs                                     every technology, 60 campaigns each
//   npm run balance:techs -- --techs staffCollege,infiltrationTactics --games 200
//   npm run balance:techs -- --set TECH_BY_ID.staffCollege.seconds=600     after a change
//   npm run balance:techs -- --shard 2/4                      a quarter of the technologies (CI runners)
//   npm run balance:techs -- merge <run dir>… --out DIR       one report from shards
//
// Options: --games N (60) or --seeds 1-60, --at 20 (minute of the handover), --minutes M (0 = to the end),
// --workers, --out DIR, --quiet. Every technology costs one campaign per seed, so all of them at 60 seeds
// is about 3,000 campaigns: two hours on 4 cores, or about half an hour split over 4 runners in CI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { workingTree } from './git';
import { parseOverride } from './overrides';
import { defaultWorkers, progress, runTasks, type WorkerTask } from './pool';
import { newRunDir, parseSeeds, positiveInt } from './run';
import { loadSim } from './sim';
import { describeSeeds } from './summary';
import type { TechSeedResult, TechSettings } from './techlab';
import { mergeRuns, renderTechs, type TechInfo, type TechRun } from './techreport';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    techs: { type: 'string' },
    games: { type: 'string' },
    seeds: { type: 'string' },
    at: { type: 'string' },
    minutes: { type: 'string' },
    shard: { type: 'string' },
    workers: { type: 'string' },
    set: { type: 'string', multiple: true },
    out: { type: 'string' },
    quiet: { type: 'boolean' },
  },
});

function save(dir: string, run: TechRun): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'techs.json'), JSON.stringify(run) + '\n');
  writeFileSync(join(dir, 'techs.md'), renderTechs(run));
}

const [command = 'run', ...rest] = positionals;
if (command === 'merge') {
  if (rest.length === 0 || !values.out) throw new Error('Usage: npm run balance:techs -- merge <run dir>… --out DIR');
  const run = mergeRuns(rest.map((dir) => JSON.parse(readFileSync(join(dir, 'techs.json'), 'utf8')) as TechRun));
  save(values.out, run);
  if (!values.quiet) console.log(renderTechs(run));
  console.error(`Merged ${rest.length} runs into ${values.out}/ (techs.md, techs.json).`);
} else if (command === 'run') {
  const seeds = values.seeds ? parseSeeds(values.seeds) : parseSeeds(`1-${positiveInt(values.games, 60, 'games')}`);
  const settings: TechSettings = { at: positiveInt(values.at, 20, 'at'), minutes: positiveInt(values.minutes, 0, 'minutes') };
  const workers = Math.max(1, positiveInt(values.workers, defaultWorkers(), 'workers'));
  const overrides = (values.set ?? []).map(parseOverride);
  const head = workingTree();
  const sim = await loadSim(head.simRoot, []);
  const all: TechInfo[] = sim.config.TECHS.map((t) => ({
    id: t.id,
    name: t.name,
    branch: t.branch,
    col: t.col,
    cost: Object.entries(t.cost)
      .map(([k, v]) => `${v} ${k}`)
      .join(', '),
  }));
  const wanted = values.techs?.split(',').map((t) => t.trim()) ?? null;
  for (const id of wanted ?? []) if (!all.some((t) => t.id === id)) throw new Error(`Unknown technology ${id}`);
  let techs = wanted ? all.filter((t) => wanted.includes(t.id)) : all;
  if (values.shard) {
    const m = /^(\d+)\/(\d+)$/.exec(values.shard);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) throw new Error(`--shard "${values.shard}" should look like 2/4`);
    techs = techs.filter((_, i) => i % Number(m[2]) === Number(m[1]) - 1);
  }
  const out = values.out ?? newRunDir('techs');
  console.error(`Tech lab: ${techs.length} technologies × ${seeds.length} seeds (about ${techs.length * seeds.length} campaigns) on ${workers} workers…`);
  const tasks: WorkerTask[] = seeds.map((seed) => ({ kind: 'techs', simRoot: head.simRoot, overrides, seeds: [seed], techs: techs.map((t) => t.id), settings }));
  const results: TechSeedResult[] = [];
  const tick = progress('campaigns', seeds.length * (techs.length + 1));
  await runTasks(tasks, workers, (msg) => {
    if (msg.type !== 'techs') return;
    if (msg.result) results.push(msg.result);
    tick(techs.length + 1);
  });
  const run: TechRun = { label: head.label, commit: head.commit, overrides, settings, seeds: describeSeeds(seeds), techs, results: results.sort((a, b) => a.seed - b.seed) };
  save(out, run);
  if (!values.quiet) console.log(renderTechs(run));
  console.error(`Saved to ${out}/ (techs.md, techs.json).`);
} else {
  throw new Error(`Unknown command "${command}": use run (the default) or merge.`);
}
