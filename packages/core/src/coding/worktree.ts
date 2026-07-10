/**
 * GitWorktreeSandbox — the real isolation for the coding drain (spec 038 FR-004,
 * plan D-002). Each `create()` adds a detached git worktree at HEAD; the agent and
 * the verify run there. `accept()` transfers the worktree's net change into the
 * primary working tree (surfaced, unstaged, for review) and removes the worktree;
 * `discard()` removes the worktree, leaving the primary tree byte-for-byte
 * unchanged. Requires a git repo — it refuses otherwise (edge case), never
 * degrading to editing the primary tree.
 *
 * Core runs git via `node:child_process` (a built-in — never on the init-time
 * path), mirroring the CLI's git/run.ts.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Sandbox, SandboxHandle } from './types.js';

const exec = promisify(execFile);

export class WorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreeError';
  }
}

async function git(cwd: string, args: string[], input?: string): Promise<string> {
  const child = exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  const { stdout } = await child;
  return stdout;
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

export class GitWorktreeSandbox implements Sandbox {
  async create(baseCwd: string): Promise<SandboxHandle> {
    if (!(await isGitRepo(baseCwd))) {
      throw new WorktreeError(
        `coding sandbox: ${baseCwd} is not a git repository — refusing rather than editing the primary tree`,
      );
    }
    const dir = join(tmpdir(), `spectastic-wt-${randomUUID()}`);
    await git(baseCwd, ['worktree', 'add', '--detach', dir, 'HEAD']);

    // A fresh worktree has no node_modules (gitignored); symlink the repo's so the
    // agent + verify can run there. Best-effort — absent deps just mean verify fails loudly.
    const deps = join(baseCwd, 'node_modules');
    if (existsSync(deps)) {
      await symlink(deps, join(dir, 'node_modules'), 'dir').catch(() => undefined);
    }

    let removed = false;
    const remove = async (): Promise<void> => {
      if (removed) return;
      removed = true;
      await git(baseCwd, ['worktree', 'remove', '--force', dir]);
    };

    return {
      dir,
      async accept(): Promise<void> {
        // Stage everything in the worktree and take the net diff vs HEAD.
        await git(dir, ['add', '-A']);
        const patch = await git(dir, ['diff', '--cached', 'HEAD']);
        if (patch.trim() !== '') {
          // Apply into the PRIMARY tree, unstaged — surfaced for review (FR-004).
          await git(baseCwd, ['apply', '--whitespace=nowarn', '-'], patch);
        }
        await remove();
      },
      discard: remove,
    };
  }
}
