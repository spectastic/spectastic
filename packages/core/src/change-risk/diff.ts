/**
 * Git diff adapter for the change-risk scan (spec 049, plan D-001/D-005).
 * Isolates git + process I/O behind a pure result shape, mirroring
 * `coding/worktree.ts`'s `execFile('git', …)` pattern — the scan module
 * itself never touches git.
 *
 * Default scope is `git diff HEAD` — every uncommitted change against HEAD,
 * staged or not (FR-008's "working tree + staged"). A brand-new file must be
 * `git add`-ed to appear in this default diff; that's ordinary `git diff`
 * semantics (untracked files are a separate category) and the convention
 * most git-diff-based tools follow. A `--range` scan (US2, T-210) diffs two
 * fixed commits directly and has no such gap — everything in the range is
 * already committed.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class ChangeRiskDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeRiskDiffError';
  }
}

/** The raw material a scan needs — a unified patch plus its numstat summary. */
export interface DiffResult {
  /** The unified patch text (`git diff --no-color`). */
  patch: string;
  /** Per-file numstat lines — a binary file reports `-` for both counts. */
  numstat: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
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

/**
 * Resolve a diff: the uncommitted working-tree+staged diff by default
 * (`git diff HEAD`), or an explicit `base..head` range when `range` is given
 * (FR-008) — git's two-dot range syntax accepted as a single positional arg.
 */
export async function getDiff(cwd: string, range?: string): Promise<DiffResult> {
  if (!(await isGitRepo(cwd))) {
    throw new ChangeRiskDiffError(`change-risk: "${cwd}" is not a git repository`);
  }
  const target = range ?? 'HEAD';
  try {
    const [patch, numstat] = await Promise.all([
      git(cwd, ['diff', '--no-color', target]),
      git(cwd, ['diff', '--numstat', target]),
    ]);
    return { patch, numstat };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ChangeRiskDiffError(`change-risk: failed to resolve diff for "${target}" — ${message}`);
  }
}
