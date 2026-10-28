// Runs balance tasks in parallel child processes. Each task gets a fresh process (vite-node
// running worker.ts) with its own copy of the simulation and its own config overrides, so
// tasks never see each other's settings. Results stream back one game or battle at a time. A
// worker that dies (Node itself crashes now and then on long runs) is replaced, and only what it
// had not sent yet is played again.
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LabCell, LabResult, LabSettings } from './lab';
import type { Override } from './overrides';
import type { GameRecord } from './record';
import type { TechSeedResult, TechSettings } from './techlab';
import type { Catalogue } from './sim';

export type WorkerTask =
  | { kind: 'games'; simRoot: string; overrides: Override[]; seeds: number[]; minutes: number }
  | { kind: 'lab'; simRoot: string; overrides: Override[]; cells: LabCell[]; settings: LabSettings }
  | { kind: 'techs'; simRoot: string; overrides: Override[]; seeds: number[]; techs: string[]; settings: TechSettings };

export type WorkerMessage =
  | { type: 'catalogue'; catalogue: Catalogue }
  | { type: 'game'; record: GameRecord }
  | { type: 'lab'; result: LabResult }
  | { type: 'techs'; seed: number; result: TechSeedResult | null }
  | { type: 'done' }
  | { type: 'error'; message: string };

const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'worker.ts');

function viteNodeCli(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve('vite-node/package.json');
  const { bin } = require(pkg) as { bin: Record<string, string> };
  return join(dirname(pkg), bin['vite-node']);
}

export function defaultWorkers(): number {
  return Math.max(1, availableParallelism());
}

/** Splits seeds into tasks small enough to keep every worker busy to the end. */
export function seedChunks(seeds: number[], workers: number): number[][] {
  const size = Math.max(1, Math.min(20, Math.ceil(seeds.length / (workers * 3))));
  const chunks: number[][] = [];
  for (let i = 0; i < seeds.length; i += size) chunks.push(seeds.slice(i, i + size));
  return chunks;
}

/** A running worker: a child process by default (`startWorker`); tests substitute their own. */
export interface WorkerHandle {
  on(event: 'message', listener: (msg: WorkerMessage) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  send(task: WorkerTask): unknown;
}

export interface PoolOptions {
  /**
   * How many times a task whose worker died (Node's own crashes on Windows, exit code 3221225477,
   * or a killed process) is started again in a fresh worker, for the results it had not yet sent.
   * Errors the simulation reports are not retried: they would only happen again.
   */
  retries?: number;
  startWorker?: (task: WorkerTask) => WorkerHandle;
}

export function startWorker(task: WorkerTask): WorkerHandle {
  const child = fork(viteNodeCli(), [WORKER], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }) as unknown as WorkerHandle;
  child.send(task);
  return child;
}

/** What is left of a task once its worker has sent some of its results (workers send them in order). */
export function remainingTask(task: WorkerTask, sent: number): WorkerTask | null {
  if (task.kind === 'lab') return sent >= task.cells.length ? null : { ...task, cells: task.cells.slice(sent) };
  return sent >= task.seeds.length ? null : { ...task, seeds: task.seeds.slice(sent) };
}

const isResult = (msg: WorkerMessage) => msg.type === 'game' || msg.type === 'lab' || msg.type === 'techs';

type Attempt = { finished: true } | { finished: false; sent: number; why: string };

/**
 * Runs every task, at most `workers` at once, handing each result to `onMessage` with its task's
 * index. A worker that dies is replaced, and plays only what it had not sent yet.
 */
export async function runTasks(tasks: WorkerTask[], workers: number, onMessage: (msg: WorkerMessage, task: number) => void, options: PoolOptions = {}): Promise<void> {
  const retries = options.retries ?? 3;
  const start = options.startWorker ?? startWorker;
  let next = 0;
  let failure: Error | null = null;
  const attempt = (task: WorkerTask, index: number) =>
    new Promise<Attempt>((resolve, reject) => {
      let done = false;
      let settled = false;
      let sent = 0;
      const settle = (outcome: Attempt | Error) => {
        if (settled) return;
        settled = true;
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };
      const child = start(task);
      child.on('message', (msg: WorkerMessage) => {
        if (settled) return;
        if (msg.type === 'error') settle(new Error(`A balance worker failed:
${msg.message}`));
        else if (msg.type === 'done') done = true;
        else {
          if (isResult(msg)) sent++;
          onMessage(msg, index);
        }
      });
      child.on('error', (err) => settle({ finished: false, sent, why: err.message }));
      child.on('close', (code) => settle(done ? { finished: true } : { finished: false, sent, why: `exit code ${code}` }));
    });
  const runOne = async (index: number) => {
    let task: WorkerTask | null = tasks[index];
    for (let tries = 0; task; tries++) {
      const outcome = await attempt(task, index);
      if (outcome.finished) return;
      task = remainingTask(task, outcome.sent);
      if (!task) return;
      const left = task.kind === 'lab' ? task.cells.length : task.seeds.length;
      if (tries >= retries) throw new Error(`A balance worker stopped (${outcome.why}) before finishing its task, ${retries + 1} times in a row`);
      console.error(`  A balance worker stopped (${outcome.why}) after ${outcome.sent} results: playing the ${left} left in a new one (retry ${tries + 1} of ${retries}).`);
    }
  };
  const lanes = Array.from({ length: Math.min(workers, tasks.length) }, async () => {
    while (next < tasks.length && !failure) {
      const index = next++;
      try {
        await runOne(index);
      } catch (err) {
        failure ??= err instanceof Error ? err : new Error(String(err));
      }
    }
  });
  await Promise.all(lanes);
  if (failure) throw failure;
}

/**
 * A progress line every so often: "120/300 games · 4.5 min · about 6 min left". `already` counts
 * results saved by an earlier attempt, which do not speed up the estimate.
 */
export function progress(label: string, total: number, already = 0): (count?: number) => void {
  const started = performance.now();
  let done = already;
  let lastPrint = 0;
  return (count = 1) => {
    done += count;
    const now = performance.now();
    if (done < total && now - lastPrint < 15000) return;
    lastPrint = now;
    const elapsed = (now - started) / 60000;
    const left = done > already ? (elapsed / (done - already)) * (total - done) : 0;
    const tail = done < total ? ` · about ${left < 1 ? '<1' : left.toFixed(0)} min left` : '';
    console.error(`  ${done}/${total} ${label} · ${elapsed.toFixed(1)} min${tail}`);
  };
}
