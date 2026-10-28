// Saves a long run's results as they arrive, so a run that stops (a worker's native crash that
// outlives the retries, Ctrl+C, a reboot) can be carried on by running the same command with the
// same --out: only what is missing is played again. A checkpoint is a directory holding plan.json
// (what the run plays, and when it first started) and entries.jsonl (one result per line,
// appended as each arrives). It refuses to carry on a different plan, so results from other
// code, overrides or seeds cannot be mixed in.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export class Checkpoint<T> {
  /** When the run first started (the first attempt's start when carried on). */
  readonly started: Date;
  /** Results saved by earlier attempts, in the order they arrived. */
  readonly entries: T[];
  private readonly file: string;

  constructor(
    readonly dir: string,
    plan: unknown,
  ) {
    mkdirSync(dir, { recursive: true });
    const planFile = join(dir, 'plan.json');
    this.file = join(dir, 'entries.jsonl');
    const wanted = JSON.stringify(plan);
    if (existsSync(planFile)) {
      const saved = JSON.parse(readFileSync(planFile, 'utf8')) as { plan: unknown; started: string };
      if (JSON.stringify(saved.plan) !== wanted)
        throw new Error(`${dir} holds a checkpoint of a different run (other code, options or seeds): give another --out, or delete ${dir} to start again`);
      this.started = new Date(saved.started);
    } else {
      this.started = new Date();
      writeFileSync(planFile, JSON.stringify({ plan, started: this.started.toISOString() }, null, 2) + '\n');
    }
    this.entries = [];
    if (existsSync(this.file)) {
      const lines = readFileSync(this.file, 'utf8').split('\n');
      let good = '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          this.entries.push(JSON.parse(line) as T);
          good += line + '\n';
        } catch {
          // A line cut short when the run stopped mid-write: play that result again.
          break;
        }
      }
      writeFileSync(this.file, good);
    }
  }

  /** Saves one result for good. */
  add(entry: T): void {
    appendFileSync(this.file, JSON.stringify(entry) + '\n');
  }

  /** The run finished and was saved in full: the checkpoint is no longer needed. */
  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/** A hash of every file of a copy of the simulation, so a checkpoint notices edited code. */
export function simFingerprint(simRoot: string): string {
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) hash.update(relative(simRoot, path).replace(/\\/g, '/')).update('\0').update(readFileSync(path)).update('\0');
    }
  };
  walk(simRoot);
  return hash.digest('hex').slice(0, 16);
}
