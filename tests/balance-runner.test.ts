// The balance runner's resilience: workers that die are replaced and play only what they had
// left, every campaign is checkpointed as it finishes, and a stopped run carried on with the same
// --out ends with exactly the records an uninterrupted run would have.
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkpoint, simFingerprint } from '../scripts/balance/checkpoint';
import { remainingTask, runTasks, startWorker, type WorkerHandle, type WorkerMessage, type WorkerTask } from '../scripts/balance/pool';
import type { GameRecord } from '../scripts/balance/record';
import { playBatches, saveRun, type Batch } from '../scripts/balance/run';
import type { Catalogue } from '../scripts/balance/sim';
import { summarise, type RunMeta } from '../scripts/balance/summary';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wc-balance-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A stand-in record: what a campaign of this seed would give, the same every time. */
const fakeRecord = (seed: number, overrides: unknown) => ({ seed, minutes: 5, winner: seed % 3 === 0 ? 'fr' : null, overrides }) as unknown as GameRecord;
const fakeCatalogue = { nations: [] } as unknown as Catalogue;

/**
 * Fake workers that play games tasks at once. `die(attempt, task)` returns how many results the
 * attempt sends before its process dies (null: it finishes).
 */
function fakeWorkers(die: (attempt: number, task: WorkerTask) => number | null = () => null) {
  const started: number[][] = [];
  const startWorker = (task: WorkerTask): WorkerHandle => {
    if (task.kind !== 'games') throw new Error('fake workers play games only');
    const attempt = started.length;
    started.push(task.seeds);
    const child = new EventEmitter();
    const handle = Object.assign(child, { send: () => true }) as unknown as WorkerHandle;
    setImmediate(() => {
      const limit = die(attempt, task);
      child.emit('message', { type: 'catalogue', catalogue: fakeCatalogue } satisfies WorkerMessage);
      const seeds = limit === null ? task.seeds : task.seeds.slice(0, limit);
      for (const seed of seeds) child.emit('message', { type: 'game', record: fakeRecord(seed, task.overrides) } satisfies WorkerMessage);
      if (limit === null) child.emit('message', { type: 'done' } satisfies WorkerMessage);
      child.emit('close', limit === null ? 0 : 3221225477);
    });
    return handle;
  };
  return { started, startWorker };
}

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const error = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = error;
  }
};

describe('balance worker pool', () => {
  const task = (seeds: number[]): WorkerTask => ({ kind: 'games', simRoot: 'x', overrides: [], seeds, minutes: 0 });

  it('knows what is left of a task', () => {
    expect(remainingTask(task([4, 5, 6]), 1)).toEqual(task([5, 6]));
    expect(remainingTask(task([4, 5, 6]), 3)).toBeNull();
    expect(remainingTask({ kind: 'techs', simRoot: 'x', overrides: [], seeds: [1, 2], techs: [], settings: { at: 20, minutes: 0 } }, 1)).toMatchObject({ seeds: [2] });
  });

  it('replaces a worker that dies and plays only the seeds it had left', async () => {
    const workers = fakeWorkers((attempt) => (attempt === 0 ? 2 : null));
    const seen: number[] = [];
    await quietly(() =>
      runTasks([task([1, 2, 3, 4, 5])], 1, (msg) => msg.type === 'game' && seen.push(msg.record.seed), { startWorker: workers.startWorker }),
    );
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(workers.started).toEqual([
      [1, 2, 3, 4, 5],
      [3, 4, 5],
    ]);
  });

  it('gives up on a task whose workers keep dying', async () => {
    const workers = fakeWorkers(() => 0);
    await expect(quietly(() => runTasks([task([1, 2])], 1, () => {}, { startWorker: workers.startWorker, retries: 2 }))).rejects.toThrow(/3 times in a row/);
    expect(workers.started).toHaveLength(3);
  });

  it('does not retry an error the simulation reports', async () => {
    let starts = 0;
    const startWorker = (): WorkerHandle => {
      starts++;
      const child = new EventEmitter();
      setImmediate(() => {
        child.emit('message', { type: 'error', message: 'boom' } satisfies WorkerMessage);
        child.emit('close', 0);
      });
      return Object.assign(child, { send: () => true }) as unknown as WorkerHandle;
    };
    await expect(runTasks([task([1])], 1, () => {}, { startWorker })).rejects.toThrow(/boom/);
    expect(starts).toBe(1);
  });
});

describe('balance checkpoints', () => {
  it('keeps what was saved, drops a line cut short, and refuses another plan', () => {
    const dir = join(tempDir(), 'checkpoint');
    const first = new Checkpoint<{ n: number }>(dir, { seeds: [1, 2, 3] });
    first.add({ n: 1 });
    first.add({ n: 2 });
    appendFileSync(join(dir, 'entries.jsonl'), '{"n":');
    const again = new Checkpoint<{ n: number }>(dir, { seeds: [1, 2, 3] });
    expect(again.entries).toEqual([{ n: 1 }, { n: 2 }]);
    expect(again.started.getTime()).toBe(first.started.getTime());
    again.add({ n: 3 });
    expect(new Checkpoint<{ n: number }>(dir, { seeds: [1, 2, 3] }).entries).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(() => new Checkpoint(dir, { seeds: [1, 2] })).toThrow(/different run/);
    again.remove();
    expect(new Checkpoint(dir, { seeds: [1, 2] }).entries).toEqual([]);
  });

  it('fingerprints the simulation code it plays', () => {
    const root = tempDir();
    writeFileSync(join(root, 'a.ts'), 'export const A = 1;');
    const before = simFingerprint(root);
    expect(simFingerprint(root)).toBe(before);
    writeFileSync(join(root, 'a.ts'), 'export const A = 2;');
    expect(simFingerprint(root)).not.toBe(before);
  });
});

describe('balance runs that stop', () => {
  const batches = (simRoot: string): Batch[] => [
    { simRoot, overrides: [], seeds: Array.from({ length: 30 }, (_, i) => i + 1) },
    { simRoot, overrides: [{ path: 'AI.warChance', value: 0.03 }], seeds: Array.from({ length: 30 }, (_, i) => i + 1) },
  ];

  it('carries on from the checkpoint and ends with what an uninterrupted run gives', async () => {
    const simRoot = tempDir();
    writeFileSync(join(simRoot, 'index.ts'), '');
    const clean = await quietly(() => playBatches(batches(simRoot), 5, 3, { pool: { startWorker: fakeWorkers().startWorker } }));

    // Every worker dies after one campaign, every time: the run stops with the retries spent.
    const checkpoint = join(tempDir(), 'checkpoint');
    const dying = fakeWorkers(() => 1);
    await expect(quietly(() => playBatches(batches(simRoot), 5, 3, { checkpoint, pool: { startWorker: dying.startWorker, retries: 1 } }))).rejects.toThrow(
      /campaigns are saved in .*run the same command/s,
    );
    const saved = readFileSync(join(checkpoint, 'entries.jsonl'), 'utf8').trim().split('\n').length;
    expect(saved).toBeGreaterThan(2);

    // Run again: only the missing campaigns are played, and one worker still dies mid-batch.
    const rest = fakeWorkers((attempt) => (attempt === 1 ? 2 : null));
    const resumed = await quietly(() => playBatches(batches(simRoot), 5, 3, { checkpoint, pool: { startWorker: rest.startWorker } }));
    const replayed = rest.started.flat();
    expect(replayed.length).toBeLessThan(60);
    expect(resumed.results).toEqual(clean.results);

  });

  it('will not mix campaigns of edited code into a checkpoint', async () => {
    const simRoot = tempDir();
    writeFileSync(join(simRoot, 'index.ts'), 'export const A = 1;');
    const checkpoint = join(tempDir(), 'checkpoint');
    await expect(quietly(() => playBatches(batches(simRoot), 5, 3, { checkpoint, pool: { startWorker: fakeWorkers(() => 1).startWorker, retries: 0 } }))).rejects.toThrow();
    writeFileSync(join(simRoot, 'index.ts'), 'export const A = 2;');
    await expect(quietly(() => playBatches(batches(simRoot), 5, 3, { checkpoint, pool: { startWorker: fakeWorkers().startWorker } }))).rejects.toThrow(/different run/);
  });

  it('survives a real worker being killed mid-batch', { timeout: 180000 }, async () => {
    // Real campaigns (short ones) in real worker processes; the first worker is killed as soon as
    // it has sent one campaign, as Node's native crashes kill them.
    const seeds = [1, 2, 3, 4, 5, 6];
    const batch: Batch[] = [{ simRoot: resolve('src/sim'), overrides: [], seeds }];
    const clean = await quietly(() => playBatches(batch, 2, 1, {}));
    const started: number[][] = [];
    const killFirst = (task: WorkerTask): WorkerHandle => {
      const child = startWorker(task);
      if (task.kind === 'games' && started.push(task.seeds) === 1) child.on('message', (msg) => msg.type === 'game' && (child as unknown as ChildProcess).kill());
      return child;
    };
    const checkpoint = join(tempDir(), 'checkpoint');
    const killed = await quietly(() => playBatches(batch, 2, 1, { checkpoint, pool: { startWorker: killFirst } }));
    expect(started).toEqual([[1, 2], [2], [3, 4], [5, 6]]);

    // The saved run is byte for byte the uninterrupted one, but for the time each campaign took.
    const timeless = (records: GameRecord[]) => records.map((r) => ({ ...r, wallMs: 0 }));
    const meta: RunMeta = {
      label: 'test',
      commit: 'test',
      overrides: [],
      seeds: '1–6',
      maxMinutes: 2,
      startedAt: new Date(0).toISOString(),
      wallSeconds: 0,
      workers: 1,
      catalogue: clean.results[0].catalogue,
    };
    expect(killed.results[0].catalogue).toEqual(clean.results[0].catalogue);
    const [one, two] = [tempDir(), tempDir()];
    saveRun(one, timeless(clean.results[0].records), summarise(timeless(clean.results[0].records), meta));
    saveRun(two, timeless(killed.results[0].records), summarise(timeless(killed.results[0].records), meta));
    for (const file of ['games.jsonl', 'summary.json', 'report.md']) expect(readFileSync(join(two, file), 'utf8')).toBe(readFileSync(join(one, file), 'utf8'));
  });
});
