// Runs balance tasks in parallel child processes. Each task gets a fresh process (vite-node
// running worker.ts) with its own copy of the simulation and its own config overrides, so
// tasks never see each other's settings. Results stream back one game or battle at a time.
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LabCell, LabResult, LabSettings } from './lab';
import type { Override } from './overrides';
import type { GameRecord } from './record';
import type { Catalogue } from './sim';

export type WorkerTask =
  | { kind: 'games'; simRoot: string; overrides: Override[]; seeds: number[]; minutes: number }
  | { kind: 'lab'; simRoot: string; overrides: Override[]; cells: LabCell[]; settings: LabSettings };

export type WorkerMessage =
  | { type: 'catalogue'; catalogue: Catalogue }
  | { type: 'game'; record: GameRecord }
  | { type: 'lab'; result: LabResult }
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

/** Runs every task, at most `workers` at once, handing each result to `onMessage` with its task's index. */
export async function runTasks(tasks: WorkerTask[], workers: number, onMessage: (msg: WorkerMessage, task: number) => void): Promise<void> {
  const cli = viteNodeCli();
  let next = 0;
  let failure: Error | null = null;
  const runOne = (index: number) =>
    new Promise<void>((resolve, reject) => {
      const child = fork(cli, [WORKER], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      let done = false;
      child.on('message', (msg: WorkerMessage) => {
        if (msg.type === 'error') reject(new Error(`A balance worker failed:\n${msg.message}`));
        else if (msg.type === 'done') done = true;
        else onMessage(msg, index);
      });
      child.on('error', reject);
      child.on('close', (code) => (done ? resolve() : reject(new Error(`A balance worker stopped (exit code ${code}) before finishing its task`))));
      child.send(tasks[index]);
    });
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

/** A progress line every so often: "120/300 games · 4.5 min · about 6 min left". */
export function progress(label: string, total: number): (count?: number) => void {
  const started = performance.now();
  let done = 0;
  let lastPrint = 0;
  return (count = 1) => {
    done += count;
    const now = performance.now();
    if (done < total && now - lastPrint < 15000) return;
    lastPrint = now;
    const elapsed = (now - started) / 60000;
    const left = done > 0 ? (elapsed / done) * (total - done) : 0;
    const tail = done < total ? ` · about ${left < 1 ? '<1' : left.toFixed(0)} min left` : '';
    console.error(`  ${done}/${total} ${label} · ${elapsed.toFixed(1)} min${tail}`);
  };
}
