/**
 * Thin wrappers around the system `git` binary for the git layer (spec
 * 026-git-strategy, plan D-003). No git library is a dependency — we shell out
 * via `node:child_process.execFile`, whose `timeout` option bounds the remote
 * fetch and drives the local-scan fallback (FR-006/NFR-001).
 *
 * Everything here is commit-only: there is no amend, rebase, reset, or
 * squash-on-merge — full per-commit history is the legible record (NFR-002).
 *
 * The runner takes an injectable `GitExec` so unit tests can assert argument
 * construction and the timeout wiring without spawning git (T-014).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitExecOpts {
  cwd: string;
  timeout?: number;
}

/** Run `git <args>` and resolve its stdout/stderr; reject on non-zero exit. */
export type GitExec = (args: string[], opts: GitExecOpts) => Promise<{ stdout: string; stderr: string }>;

const realExec: GitExec = async (args, opts) => {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: opts.cwd,
    ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
  });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export interface GitRunner {
  currentBranch(): Promise<string>;
  headSubject(): Promise<string>;
  add(paths: string[]): Promise<void>;
  commit(subject: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  /** The remote default branch (e.g. `main`), or null when undeterminable. */
  defaultBranch(): Promise<string | null>;
  /** Fetch the given remote branch within `timeoutMs`; false on timeout / no remote. */
  fetchDefault(branch: string, timeoutMs: number): Promise<boolean>;
  /** Names of the immediate `specs/` subdirectories at `ref` (e.g. `origin/main`). */
  lsTreeSpecDirs(ref: string): Promise<string[]>;
}

export function gitRunner(cwd: string, exec: GitExec = realExec): GitRunner {
  return {
    async currentBranch() {
      const { stdout } = await exec(['symbolic-ref', '--short', 'HEAD'], { cwd });
      return stdout.trim();
    },

    async headSubject() {
      const { stdout } = await exec(['log', '-1', '--format=%s'], { cwd });
      return stdout.trim();
    },

    async add(paths) {
      if (paths.length === 0) return;
      await exec(['add', '--', ...paths], { cwd });
    },

    async commit(subject) {
      await exec(['commit', '-m', subject], { cwd });
    },

    async createBranch(name) {
      await exec(['checkout', '-b', name], { cwd });
    },

    async defaultBranch() {
      // 1. origin/HEAD's symbolic ref — the normal case.
      try {
        const { stdout } = await exec(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
        const b = stdout.trim().replace(/^origin\//, '');
        if (b) return b;
      } catch {
        // fall through
      }
      // 2. `git remote show origin` names the HEAD branch even when the local
      //    origin/HEAD ref is unset (a remote exists, just no cached HEAD).
      try {
        const { stdout } = await exec(['remote', 'show', 'origin'], { cwd });
        const hb = /HEAD branch:\s*(\S+)/.exec(stdout)?.[1];
        if (hb && hb !== '(unknown)') return hb;
      } catch {
        // fall through
      }
      // 3. No usable remote → the current branch (T-901). Null only if HEAD is
      //    unborn; the caller then falls back to the local-only id scan.
      try {
        const { stdout } = await exec(['symbolic-ref', '--short', 'HEAD'], { cwd });
        return stdout.trim() || null;
      } catch {
        return null;
      }
    },

    async fetchDefault(branch, timeoutMs) {
      try {
        await exec(['fetch', 'origin', branch], { cwd, timeout: timeoutMs });
        return true;
      } catch {
        return false;
      }
    },

    async lsTreeSpecDirs(ref) {
      try {
        const { stdout } = await exec(['ls-tree', '-d', '--name-only', ref, '--', 'specs/'], { cwd });
        return stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((p) => p.replace(/^specs\//, ''));
      } catch {
        return [];
      }
    },
  };
}
