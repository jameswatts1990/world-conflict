// Which simulation a balance run plays: the working tree's, or another commit's. `--vs <ref>`
// checks the ref out into a temporary git worktree under balance-runs/ (ignored by git) and
// runs its simulation with these balance scripts, so older commits need no balance tooling.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Checkout {
  /** The simulation sources to load (…/src/sim). */
  simRoot: string;
  /** "working tree" or the ref asked for. */
  label: string;
  /** Commit hash (with "+changes" when the working tree differs from it). */
  commit: string;
  dispose(): void;
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function workingTree(): Checkout {
  let commit = 'unknown';
  try {
    commit = git(['rev-parse', '--short=12', 'HEAD']);
    if (git(['status', '--porcelain', '--', 'src']) !== '') commit += '+changes';
  } catch {
    // Not a git checkout: the run still works, it just cannot say which commit it was.
  }
  return { simRoot: resolve('src/sim'), label: 'working tree', commit, dispose: () => {} };
}

export function checkoutRef(ref: string, parent: string): Checkout {
  let commit: string;
  try {
    commit = git(['rev-parse', '--verify', '--short=12', `${ref}^{commit}`]);
  } catch {
    throw new Error(`No commit "${ref}" in this checkout: fetch it first (git fetch origin ${ref.replace(/^origin\//, '')}), or name a branch, tag or commit.`);
  }
  mkdirSync(parent, { recursive: true });
  const dir = resolve(join(parent, `worktree-${commit}`));
  git(['worktree', 'prune']);
  if (existsSync(dir)) {
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  git(['worktree', 'add', '--detach', '--force', dir, commit]);
  return {
    simRoot: join(dir, 'src', 'sim'),
    label: ref,
    commit,
    dispose: () => {
      try {
        git(['worktree', 'remove', '--force', dir]);
      } catch {
        rmSync(dir, { recursive: true, force: true });
        git(['worktree', 'prune']);
      }
    },
  };
}
