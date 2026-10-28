// Plays batches of all-AI campaigns in parallel and keeps their records: the building block of
// `npm run balance` and of the tuner. A run is saved as a directory: games.jsonl (one record per
// campaign), meta.json, summary.json and report.md. While it plays, each campaign is also saved
// as it finishes in a checkpoint (checkpoint/ in the run's directory), so a run that stops can be
// carried on by running the same command with the same --out.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Checkpoint, simFingerprint } from './checkpoint';
import { checkoutRef, workingTree, type Checkout } from './git';
import type { Override } from './overrides';
import { progress, runTasks, seedChunks, type PoolOptions, type WorkerTask } from './pool';
import type { GameRecord } from './record';
import { renderReport } from './report';
import type { Catalogue } from './sim';
import { describeSeeds, summarise, type RunMeta, type Summary } from './summary';

export interface Batch {
  simRoot: string;
  overrides: Override[];
  seeds: number[];
}

export interface PlayOptions {
  /** What the progress lines count ("campaigns"). */
  label?: string;
  /**
   * A directory to save each campaign in as it finishes. Played again with the same batches, a
   * run carries on from what it holds; the caller removes it once the run is saved.
   */
  checkpoint?: string;
  pool?: PoolOptions;
}

export interface BatchResult {
  records: GameRecord[];
  catalogue: Catalogue;
}

type CheckpointEntry = { batch: number; record: GameRecord } | { batch: number; catalogue: Catalogue };

/**
 * Plays several batches together (sharing the workers), returning each batch's records in seed
 * order and the content catalogue its simulation reported, and when the run first started (an
 * earlier attempt's start when carried on from a checkpoint).
 */
export async function playBatches(batches: Batch[], minutes: number, workers: number, options: PlayOptions = {}): Promise<{ results: BatchResult[]; started: Date }> {
  const results = batches.map(() => ({ records: new Map<number, GameRecord>(), catalogue: null as Catalogue | null }));
  let checkpoint: Checkpoint<CheckpointEntry> | null = null;
  if (options.checkpoint) {
    const plan = { minutes, batches: batches.map((b) => ({ sim: simFingerprint(b.simRoot), overrides: b.overrides, seeds: b.seeds })) };
    checkpoint = new Checkpoint<CheckpointEntry>(options.checkpoint, plan);
    for (const entry of checkpoint.entries) {
      const result = results[entry.batch];
      if ('record' in entry) result.records.set(entry.record.seed, entry.record);
      else result.catalogue ??= entry.catalogue;
    }
  }
  const tasks: WorkerTask[] = [];
  const owner: number[] = [];
  batches.forEach((b, i) => {
    const missing = b.seeds.filter((s) => !results[i].records.has(s));
    for (const seeds of seedChunks(missing, workers)) {
      tasks.push({ kind: 'games', simRoot: b.simRoot, overrides: b.overrides, seeds, minutes });
      owner.push(i);
    }
  });
  const total = batches.reduce((s, b) => s + b.seeds.length, 0);
  const saved = results.reduce((s, r) => s + r.records.size, 0);
  if (saved > 0) console.error(`  Carrying on from ${checkpoint!.dir}: ${saved} of ${total} ${options.label ?? 'campaigns'} already played.`);
  const started = checkpoint?.started ?? new Date();
  const tick = progress(options.label ?? 'campaigns', total, saved);
  try {
    await runTasks(
      tasks,
      workers,
      (msg, task) => {
        const batch = owner[task];
        const result = results[batch];
        if (msg.type === 'catalogue' && !result.catalogue) {
          result.catalogue = msg.catalogue;
          checkpoint?.add({ batch, catalogue: msg.catalogue });
        } else if (msg.type === 'game' && !result.records.has(msg.record.seed)) {
          result.records.set(msg.record.seed, msg.record);
          checkpoint?.add({ batch, record: msg.record });
          tick();
        }
      },
      options.pool,
    );
  } catch (err) {
    if (!checkpoint) throw err;
    const played = results.reduce((s, r) => s + r.records.size, 0);
    throw new Error(`${err instanceof Error ? err.message : String(err)}
${played} of ${total} campaigns are saved in ${checkpoint.dir}: run the same command with --out pointing at the same run to play only the rest.`);
  }
  return {
    results: results.map((r) => ({ records: [...r.records.values()].sort((a, b) => a.seed - b.seed), catalogue: r.catalogue! })),
    started,
  };
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
