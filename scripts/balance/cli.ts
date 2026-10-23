// npm run balance: play many all-AI campaigns in parallel and report on balance and pacing.
//
//   npm run balance                                     200 campaigns of the working tree
//   npm run balance -- --games 400 --set AI.warStrengthRatio=1.3
//   npm run balance -- --vs main                        the working tree against main, same seeds
//   npm run balance -- --set AI.unitsFlat.minor=3 --vs defaults    with and without the override
//   npm run balance -- report balance-runs/<run>        re-read a saved run (with today's goals)
//   npm run balance -- compare <run A> <run B>          compare two saved runs
//
// Options: --games N (200), --seeds 1-300, --minutes M (0 = to the end), --workers W (all cores),
// --out DIR (balance-runs/<time>), --quiet. See docs/BALANCE.md.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderComparison } from './compare';
import { workingTree } from './git';
import { parseOverride } from './overrides';
import { defaultWorkers } from './pool';
import { renderReport } from './report';
import { baselineCheckout, loadRun, makeMeta, newRunDir, parseSeeds, playBatches, positiveInt, saveRun } from './run';
import { summarise } from './summary';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    games: { type: 'string' },
    seeds: { type: 'string' },
    minutes: { type: 'string' },
    workers: { type: 'string' },
    set: { type: 'string', multiple: true },
    vs: { type: 'string' },
    out: { type: 'string' },
    quiet: { type: 'boolean' },
  },
});

const [command = 'run', ...rest] = positionals;

if (command === 'report') {
  if (rest.length !== 1) throw new Error('Usage: npm run balance -- report <run directory>');
  const { records, summary } = loadRun(rest[0]);
  writeFileSync(join(rest[0], 'report.md'), renderReport(summary));
  writeFileSync(join(rest[0], 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(renderReport(summary));
  console.error(`(${records.length} campaigns re-read from ${rest[0]})`);
} else if (command === 'compare') {
  if (rest.length !== 2) throw new Error('Usage: npm run balance -- compare <run A> <run B>');
  const text = renderComparison(loadRun(rest[0]).summary, loadRun(rest[1]).summary);
  if (values.out) writeFileSync(values.out, text);
  console.log(text);
} else if (command === 'run') {
  const seeds = values.seeds ? parseSeeds(values.seeds) : parseSeeds(`1-${positiveInt(values.games, 200, 'games')}`);
  const minutes = positiveInt(values.minutes, 0, 'minutes');
  const workers = Math.max(1, positiveInt(values.workers, defaultWorkers(), 'workers'));
  const overrides = (values.set ?? []).map(parseOverride);
  const out = values.out ?? newRunDir(values.vs ? `vs-${values.vs.replace(/[^\w.-]+/g, '_')}` : 'run');
  const head = workingTree();
  const started = new Date();
  console.error(`Playing ${seeds.length} campaigns${values.vs ? ` each for the working tree and ${values.vs}` : ''} on ${workers} workers…`);

  if (!values.vs) {
    const [result] = await playBatches([{ simRoot: head.simRoot, overrides, seeds }], minutes, workers);
    const summary = summarise(result.records, makeMeta(head.label, head.commit, { simRoot: head.simRoot, overrides, seeds }, minutes, workers, started, result.catalogue));
    saveRun(out, result.records, summary);
    if (!values.quiet) console.log(renderReport(summary));
    console.error(`Saved to ${out}/ (report.md, summary.json, games.jsonl).`);
  } else {
    const { checkout: base, label } = baselineCheckout(values.vs, 'balance-runs');
    try {
      const batches = [
        { simRoot: base.simRoot, overrides: [], seeds },
        { simRoot: head.simRoot, overrides, seeds },
      ];
      const [a, b] = await playBatches(batches, minutes, workers);
      const summaryA = summarise(a.records, makeMeta(label, base.commit, batches[0], minutes, workers, started, a.catalogue));
      const summaryB = summarise(b.records, makeMeta(head.label, head.commit, batches[1], minutes, workers, started, b.catalogue));
      saveRun(join(out, 'a'), a.records, summaryA);
      saveRun(join(out, 'b'), b.records, summaryB);
      const text = renderComparison(summaryA, summaryB);
      writeFileSync(join(out, 'compare.md'), text);
      if (!values.quiet) console.log(text);
      console.error(`Saved to ${out}/ (compare.md, and each side's report in a/ and b/).`);
    } finally {
      base.dispose();
    }
  }
} else {
  throw new Error(`Unknown command "${command}": use run (the default), report or compare.`);
}
