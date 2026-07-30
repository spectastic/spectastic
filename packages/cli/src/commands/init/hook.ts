import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The git pre-commit gate for `init --tools` (spec 031, US1 / plan D-002, D-003).
 *
 * The gate is `spectastic validate` over the artifact corpus, exit-code-gated:
 * validate already exits 1 on any error and no-unresolved-question already errors
 * only on Accepted specs, so FR-003+FR-004 fall out of the exit code with no
 * bespoke logic. --no-verify is git's own bypass (FR-005) — nothing to add.
 */

/** Marks a hook as ours, so re-install is idempotent and uninstall is precise. */
export const HOOK_MARKER = '# spectastic guarantee-layer gate — managed; do not edit by hand';

/** The artifact globs the gate validates — the whole corpus (FR-002). `*.html`
 *  at the root catches principles/index/inbox without erroring when absent. */
export const ARTIFACT_GLOBS = ['specs/**/*.html', '*.html', 'examples/*.html'];

/**
 * Resolve the git hooks directory: honour `core.hooksPath` when set (D-003),
 * else the repo's real hooks dir (via `rev-parse --git-path`, which is correct
 * for worktrees/submodules where `.git` is a file).
 */
export function hooksDir(cwd: string): string {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  let configured = '';
  try {
    configured = git(['config', '--get', 'core.hooksPath']);
  } catch {
    // unset — fall through to the default
  }
  if (configured) return resolve(cwd, configured);
  return resolve(cwd, git(['rev-parse', '--git-path', 'hooks']));
}

/**
 * Build the pre-commit hook script. `cliEntry` is the absolute path to the
 * spectastic CLI entry that installed the hook, run via `node` so it resolves
 * without depending on PATH. A preserved prior hook (FR-006) runs first and its
 * exit propagates.
 */
export function buildHookScript(cliEntry: string): string {
  const globs = ARTIFACT_GLOBS.map((g) => `'${g}'`).join(' ');
  return `${[
    '#!/usr/bin/env bash',
    HOOK_MARKER,
    'set -euo pipefail',
    '# Chain a preserved prior hook first (FR-006); its non-zero exit blocks too.',
    'prior="$(dirname "$0")/pre-commit.prior"',
    'if [ -x "$prior" ]; then "$prior" || exit $?; fi',
    '# The gate: validate the corpus; a non-zero exit blocks the commit (FR-002..005).',
    `exec node ${JSON.stringify(cliEntry)} validate ${globs}`,
  ].join('\n')}\n`;
}

export interface HookInstallResult {
  /** True when a foreign prior hook was preserved and chained (FR-006). */
  chained: boolean;
  /** Absolute path the hook was written to. */
  path: string;
}

/**
 * Install (or idempotently reconcile) the pre-commit gate. A foreign existing
 * hook is preserved as `pre-commit.prior` and chained; our own hook is simply
 * rewritten. Re-running never double-chains (FR-001, FR-006).
 */
export function installHook(cwd: string, cliEntry: string): HookInstallResult {
  const dir = hooksDir(cwd);
  mkdirSync(dir, { recursive: true });
  const hookPath = join(dir, 'pre-commit');
  const priorPath = join(dir, 'pre-commit.prior');

  let chained = false;
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, 'utf8');
    if (!current.includes(HOOK_MARKER) && !existsSync(priorPath)) {
      // A foreign hook we haven't seen — preserve it once.
      renameSync(hookPath, priorPath);
      chmodSync(priorPath, 0o755);
      chained = true;
    }
  }
  chained = chained || existsSync(priorPath);
  writeFileSync(hookPath, buildHookScript(cliEntry), 'utf8');
  chmodSync(hookPath, 0o755);
  return { chained, path: hookPath };
}

export interface HookUninstallResult {
  removed: boolean;
  /** True when a chained prior hook was restored to its place. */
  restored: boolean;
}

/**
 * Remove our gate, restoring any chained prior hook. Leaves a foreign
 * (non-managed) pre-commit hook untouched.
 */
export function uninstallHook(cwd: string): HookUninstallResult {
  const dir = hooksDir(cwd);
  const hookPath = join(dir, 'pre-commit');
  const priorPath = join(dir, 'pre-commit.prior');
  if (!existsSync(hookPath) || !readFileSync(hookPath, 'utf8').includes(HOOK_MARKER)) {
    return { removed: false, restored: false };
  }
  rmSync(hookPath);
  let restored = false;
  if (existsSync(priorPath)) {
    renameSync(priorPath, hookPath);
    restored = true;
  }
  return { removed: true, restored };
}

/** The absolute CLI entry of the currently-running process, for the hook to invoke. */
export function currentCliEntry(): string {
  return resolve(process.argv[1] ?? join(dirname(process.execPath), 'spectastic'));
}
