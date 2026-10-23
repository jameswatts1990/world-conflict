// A balance worker (started by pool.ts): one child process with one copy of the simulation and
// one set of config overrides. It receives a task, sends back each game or battle result, and
// exits. vite-node closes its module server once this file's top level finishes, so all the work
// happens inside the top-level await.
import { runLabCell } from './lab';
import type { WorkerMessage, WorkerTask } from './pool';
import { playGame } from './record';
import { balanceWorld, catalogue, loadSim } from './sim';

const send = (msg: WorkerMessage) => new Promise<void>((resolve, reject) => process.send!(msg, undefined, {}, (err) => (err ? reject(err) : resolve())));

const task = await new Promise<WorkerTask>((resolve) => process.once('message', (msg) => resolve(msg as WorkerTask)));
try {
  const sim = await loadSim(task.simRoot, task.overrides);
  if (task.kind === 'games') {
    const world = balanceWorld(sim);
    await send({ type: 'catalogue', catalogue: catalogue(sim, world) });
    for (const seed of task.seeds) await send({ type: 'game', record: playGame(sim, world, seed, task.minutes) });
  } else {
    for (const cell of task.cells) await send({ type: 'lab', result: runLabCell(sim, cell, task.settings) });
  }
  await send({ type: 'done' });
} catch (err) {
  await send({ type: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err) });
}
process.disconnect?.();
