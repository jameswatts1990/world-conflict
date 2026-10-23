// Plays batches of all-AI campaigns in parallel and keeps their records: the building block of
// `npm run balance` and of the tuner. A run is saved as a directory: games.jsonl (one record per
// campaign), meta.json, summary.json and report.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutRef, workingTree, type Checkout } from './git';
import type { Override } from './overrides';
import { progress, runTasks, seedChunks, type WorkerTask } from './pool';
import type { GameRecord } from './record';
import { renderReport } from './report';
import type { Catalogue } from './sim';
import { describeSeeds, summarise, type RunMeta, type Summary } from './summary';

export interface Batch {
  simRoot: string;
  overrides: Override[];
  seeds: number[];
}

/**
 * Plays several batches together (sharing the workers), returning each batch's records in seed
 * order and the content catalogue its simulation reported.
 */
export async function playBatches(batches: Batch[], minutes: number, workers: number, label = 'campaigns'): Promise<{ records: GameRecord[]; catalogue: Catalogue }[]> {
  const tasks: WorkerTask[] = [];
  const owner: number[] = [];
  batches.forEach((b, i) => {
    for (const seeds of seedChunks(b.seeds, workers)) {
      tasks.push({ kind: 'games', simRoot: b.simRoot, overrides: b.overrides, seeds, minutes });
      owner.push(i);
    }
  });
  const results = batches.map(() => ({ records: [] as GameRecord[], catalogue: null as Catalogue | null }));
  const tick = progress(label, batches.reduce((s, b) => s + b.seeds.length, 0));
  await runTasks(tasks, workers, (msg, task) => {
    const result = results[owner[task]];
    if (msg.type === 'catalogue') result.catalogue ??= msg.catalogue;
    else if (msg.type === 'game') {
      result.records.push(msg.record);
      tick();
    }
  });
  return results.map((r) => ({ records: r.records.sort((a, b) => a.seed - b.seed), catalogue: r.catalogue! }));
}

export function makeMeta(label: string, commit: string, batch: Batch, minutes: number, workers: number, startedAt: Date, catalogue: Catalogue): RunMeta {
  return {
    label,
    commit,
    overrides: batch.overrides,
    seeds: describeSeeds(batch.seeds),
    maxMinutes: minutes,
    startedAt: startedAt.toISOString(),
    wallSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    workers,
    catalogue,
  };
}

export function saveRun(dir: string, records: GameRecord[], summary: Summary): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'games.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(summary.meta, null, 2) + '\n');
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(dir, 'report.md'), renderReport(summary));
}

/** Reads a saved run and summarises it afresh (so edited goals apply to old runs too). */
export function loadRun(dir: string): { records: GameRecord[]; summary: Summary } {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as RunMeta;
  const records = readFileSync(join(dir, 'games.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as GameRecord);
  return { records, summary: summarise(records, meta) };
}

/** "1-300" or "4,8,15": seeds to play. */
export function parseSeeds(text: string): number[] {
  const seeds: number[] = [];
  for (const part of text.split(',')) {
    const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(part);
    if (!m) throw new Error(`Seeds "${text}" should look like 1-300 or 4,8,15`);
    const lo = Number(m[1]);
    const hi = m[2] === undefined ? lo : Number(m[2]);
    for (let s = lo; s <= hi; s++) seeds.push(s);
  }
  return seeds;
}

export function positiveInt(text: string | undefined, fallback: number, name: string): number {
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} should be a whole number, not "${text}"`);
  return n;
}

/** A directory name for a new run: balance-runs/2026-10-23-1405-<name>. */
export function newRunDir(name: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return join('balance-runs', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${name}`);
}

/**
 * What `--vs` compares against: "defaults" is the working tree without the overrides; anything
 * else is a git ref, checked out in a temporary worktree.
 */
export function baselineCheckout(vs: string, parent: string): { checkout: Checkout; label: string } {
  if (vs === 'defaults') return { checkout: workingTree(), label: 'defaults (no overrides)' };
  const checkout = checkoutRef(vs, parent);
  return { checkout, label: vs };
}
