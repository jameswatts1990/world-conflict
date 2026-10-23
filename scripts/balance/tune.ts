// npm run balance:tune: trains the AI by searching its config for the settings that best meet
// the design goals (goals.ts). It is an evolution strategy: each generation plays a population of
// settings around the current best guess on the same fresh campaigns, then moves the guess
// towards the settings with the lowest goal penalty and narrows or widens its steps to match.
// Finally it plays the proposal against today's settings on campaigns it has never seen, so a
// lucky score cannot pass for an improvement. Nothing is changed in the code: copy what you like
// into src/sim/config/ai.ts.
//
//   npm run balance:tune                          the default space (war and peace), ~1.5 h on 4 cores
//   npm run balance:tune -- --quick               a few minutes, to see it work
//   npm run balance:tune -- --space military --generations 8 --games 48
//   npm run balance:tune -- --knob AI.attackRatio=0.9..1.6 --knob AI.warChance=0.005..0.06
//   npm run balance:tune -- --set UNITS.tank.cost.money=260     tune the AI around a rules change
//
// Options: --population 8, --generations 6, --games 32 (campaigns per setting per generation),
// --validate 200 (campaigns each for the final check), --seed 1, --workers, --out DIR.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderComparison } from './compare';
import { workingTree } from './git';
import { describeOverrides, parseOverride } from './overrides';
import { defaultWorkers } from './pool';
import { num, table } from './report';
import { makeMeta, newRunDir, playBatches, positiveInt, saveRun, type Batch } from './run';
import { loadSim } from './sim';
import { knobOverrides, knobPosition, knobValue, parseKnob, SPACES, type Knob } from './space';
import type { GameRecord } from './record';
import { quantile } from './stats';
import { summarise, type RunMeta } from './summary';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    space: { type: 'string' },
    knob: { type: 'string', multiple: true },
    population: { type: 'string' },
    generations: { type: 'string' },
    games: { type: 'string' },
    validate: { type: 'string' },
    seed: { type: 'string' },
    workers: { type: 'string' },
    set: { type: 'string', multiple: true },
    out: { type: 'string' },
    quick: { type: 'boolean' },
  },
});

const quick = values.quick ?? false;
const population = Math.max(2, positiveInt(values.population, quick ? 4 : 8, 'population'));
const generations = Math.max(1, positiveInt(values.generations, quick ? 2 : 6, 'generations'));
const games = Math.max(1, positiveInt(values.games, quick ? 6 : 32, 'games'));
const validate = Math.max(1, positiveInt(values.validate, quick ? 12 : 200, 'validate'));
const tunerSeed = Math.max(1, positiveInt(values.seed, 1, 'seed'));
const workers = Math.max(1, positiveInt(values.workers, defaultWorkers(), 'workers'));
const fixed = (values.set ?? []).map(parseOverride);
const out = values.out ?? newRunDir('tune');

const head = workingTree();
const sim = await loadSim(head.simRoot, []);
const current = (path: string): unknown => {
  const set = fixed.find((o) => o.path === path);
  return set ? set.value : path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], sim.config);
};
const spaceName = values.space ?? 'ai';
if (!values.knob && !SPACES[spaceName]) throw new Error(`Unknown space "${spaceName}": use ${Object.keys(SPACES).join(', ')}, or --knob`);
const knobs: Knob[] = values.knob ? values.knob.map((k) => parseKnob(k, current)) : SPACES[spaceName].knobs;
for (const k of knobs) if (typeof current(k.path) !== 'number') throw new Error(`${k.path} is not a number in the config`);
const today = knobs.map((k) => current(k.path) as number);

// The tuner's own dice (mulberry32), apart from the games' seeds.
let rngState = tunerSeed >>> 0;
const random = () => {
  let t = (rngState = (rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
// Training and checking campaigns never share seeds with each other or with everyday runs (1, 2, 3 …).
const trainingSeeds = (g: number) => range(tunerSeed * 1_000_000 + g * games + 1, games);
const checkSeeds = range(tunerSeed * 1_000_000 + 900_001, validate);

mkdirSync(out, { recursive: true });
const started = new Date();
const total = population * generations * games + 2 * validate;
console.error(`Tuning ${knobs.length} settings: ${generations} generations of ${population} × ${games} campaigns, then ${validate} × 2 to check (${total} campaigns) on ${workers} workers…`);

let mean = knobs.map((k, i) => knobPosition(k, today[i]));
let sigma = knobs.map(() => 0.2);
const progressRows: (string | number)[][] = [];
for (let g = 0; g < generations; g++) {
  // The current guess, then mirrored pairs around it (each step tried both ways cancels noise).
  const xs: number[][] = [mean.slice()];
  while (xs.length < population) {
    const z = knobs.map(() => gaussian());
    xs.push(mean.map((m, d) => clamp(m + sigma[d] * z[d], 0, 1)));
    if (xs.length < population) xs.push(mean.map((m, d) => clamp(m - sigma[d] * z[d], 0, 1)));
  }
  const seeds = trainingSeeds(g);
  const batches: Batch[] = xs.map((x) => ({ simRoot: head.simRoot, overrides: [...fixed, ...knobOverrides(knobs, x)], seeds }));
  const results = await playBatches(batches, 0, workers, `campaigns, generation ${g + 1} of ${generations}`);
  const scored = results.map((r, i) => {
    const summary = summarise(r.records, makeMeta(`generation ${g + 1}, setting ${i + 1}`, head.commit, batches[i], 0, workers, started, r.catalogue));
    return { x: xs[i], penalty: summary.fun.total, terms: summary.fun.terms };
  });
  for (const [i, s] of scored.entries()) {
    const settings = Object.fromEntries(knobs.map((k, d) => [k.path, knobValue(k, s.x[d])]));
    appendFileSync(join(out, 'history.jsonl'), JSON.stringify({ generation: g + 1, setting: i + 1, guess: i === 0, penalty: s.penalty, settings, terms: Object.fromEntries(s.terms.map((t) => [t.id, t.value])) }) + '\n');
  }
  const guessPenalty = scored[0].penalty;
  const ranked = [...scored].sort((a, b) => a.penalty - b.penalty);
  // Recombine the better half, best weighted most; step sizes follow how spread out they are.
  const mu = Math.max(1, Math.floor(population / 2));
  const raw = ranked.slice(0, mu).map((_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const weights = raw.map((w) => w / raw.reduce((s, x) => s + x, 0));
  const next = knobs.map((_, d) => ranked.slice(0, mu).reduce((s, c, i) => s + weights[i] * c.x[d], 0));
  const spread = knobs.map((_, d) => Math.sqrt(ranked.slice(0, mu).reduce((s, c, i) => s + weights[i] * (c.x[d] - mean[d]) ** 2, 0)));
  sigma = sigma.map((s, d) => clamp(0.5 * s + 0.5 * spread[d], 0.02, 0.35));
  mean = next;
  progressRows.push([g + 1, num(ranked[0].penalty, 2), num(guessPenalty, 2), num(sigma.reduce((s, x) => s + x, 0) / sigma.length, 3)]);
  console.error(`  generation ${g + 1}: best ${num(ranked[0].penalty, 2)}, the guess ${num(guessPenalty, 2)}`);
}

const proposal = knobOverrides(knobs, mean);
const checks: Batch[] = [
  { simRoot: head.simRoot, overrides: fixed, seeds: checkSeeds },
  { simRoot: head.simRoot, overrides: [...fixed, ...proposal], seeds: checkSeeds },
];
const [a, b] = await playBatches(checks, 0, workers, 'campaigns, final check');
const summaryA = summarise(a.records, makeMeta("today's settings", head.commit, checks[0], 0, workers, started, a.catalogue));
const summaryB = summarise(b.records, makeMeta('proposed settings', head.commit, checks[1], 0, workers, started, b.catalogue));
saveRun(join(out, 'check', 'today'), a.records, summaryA);
saveRun(join(out, 'check', 'proposed'), b.records, summaryB);
writeFileSync(join(out, 'best.json'), JSON.stringify({ overrides: proposal, fixed, penalty: { today: summaryA.fun.total, proposed: summaryB.fun.total } }, null, 2) + '\n');

// How sure is the change? Resample each side's campaigns and recompute the penalties.
function changeInterval(today: GameRecord[], metaToday: RunMeta, proposed: GameRecord[], metaProposed: RunMeta, reps = 200): [number, number] {
  const pick = (xs: GameRecord[]) => xs.map(() => xs[Math.floor(random() * xs.length)]);
  const diffs = Array.from({ length: reps }, () => summarise(pick(proposed), metaProposed).fun.total - summarise(pick(today), metaToday).fun.total);
  return [quantile(diffs, 0.025), quantile(diffs, 0.975)];
}
const [low, high] = changeInterval(a.records, summaryA.meta, b.records, summaryB.meta);
const verdict =
  high < 0
    ? 'The proposal does better on fresh campaigns. Check the comparison below for what it changes (and what it costs), then try it in play before adopting it.'
    : low > 0
      ? "The proposal does worse on fresh campaigns than today's settings: keep today's."
      : `The check cannot tell the proposal from today's settings: run a bigger check (--validate ${Math.max(validate * 2, 200)}) or a longer search before adopting it.`;
const describeKnob = (k: Knob) => `${k.min}–${k.max}${k.log ? ' (by ratio)' : ''}${k.integer ? ' (whole)' : ''}`;
const report: string[] = ['# AI tuning', ''];
report.push(
  `${values.knob ? `${knobs.length} settings given by --knob` : `Space "${spaceName}": ${SPACES[spaceName].description}`}. ${generations} generations of ${population} settings × ${games} campaigns, then ${validate} fresh campaigns each to check · commit \`${head.commit}\` · fixed overrides: ${describeOverrides(fixed)} · tuner seed ${tunerSeed}`,
  '',
);
report.push('## Result', '');
report.push(
  `Goal penalty on ${validate} campaigns the tuner never saw: today's settings **${num(summaryA.fun.total, 2)}**, proposed **${num(summaryB.fun.total, 2)}** (lower is better; the change is ${num(low, 2)} to ${num(high, 2)} at 95% confidence).`,
  '',
  verdict,
  '',
);
report.push(
  table(
    ['Setting', 'Today', 'Proposed', 'Searched'],
    knobs.map((k, i) => [k.path, String(today[i]), String(proposal[i].value), describeKnob(k)]),
  ),
  '',
);
const setFlags = [...fixed, ...proposal].map((o) => `--set ${o.path}=${JSON.stringify(o.value)}`).join(' ');
report.push(`Try it: \`npm run balance -- --vs defaults ${setFlags}\`. Adopt it: copy the values into \`src/sim/config/ai.ts\`.`, '');
report.push('## Progress', '');
report.push(table(['Generation', 'Best setting', 'The guess', 'Step size'], progressRows), '');
report.push('_Penalties per generation are on that generation\'s own campaigns, so they are noisy; the final check above is what counts._', '');
report.push(renderComparison(summaryA, summaryB).replace(/^#/gm, '##'));
const text = report.join('\n');
writeFileSync(join(out, 'tune.md'), text);
console.log(text);
console.error(`Saved to ${out}/ (tune.md, best.json, history.jsonl, and both sides of the final check in check/).`);
