import { execFileSync } from 'node:child_process';
import { generateAdapters, removeAdapters } from './adapters.js';
import { installHook, uninstallHook } from './hook.js';

/**
 * Orchestrator for `init --tools` (spec 031-init-tools, plan D-004).
 *
 * `init --tools` installs the guarantee layer into a spectastic project: a git
 * pre-commit gate that runs `spectastic validate` (US1, FR-002..006) and
 * generate-on-demand Claude Code command adapters that can't ship stale (US2,
 * FR-007/008). This module owns the plan/execute/summary flow; the two halves
 * live in ./hook.ts (T-110..) and ./adapters.ts (T-210..). It reuses the init
 * command's opt-in, idempotent, report-what-changed contract (FR-001).
 */

export class ToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolsError';
  }
}

/** The two installable halves, selectable via --hooks-only / --commands-only. */
export interface ToolsOptions {
  cwd: string;
  /** Install the pre-commit gate (US1). */
  hooks: boolean;
  /** Install the generated command adapters (US2). */
  commands: boolean;
  /** Remove what was installed instead of installing (FR-010). */
  uninstall: boolean;
  /** Overwrite without prompting (mirrors init --force). */
  force: boolean;
  /** Absolute CLI entry the installed hook should invoke (see hook.currentCliEntry). */
  cliEntry: string;
}

/** A single planned action, mirroring init's FileWriteDecision shape (D-004). */
export interface ToolsDecision {
  kind: 'install-hook' | 'generate-adapters' | 'remove-hook' | 'remove-adapters';
  /** One-line human description for the summary (FR-001 reporting). */
  detail: string;
}

export interface ToolsSummary {
  decisions: ToolsDecision[];
  /** True when the hook half was skipped because this isn't a git repo (FR-009). */
  hookSkippedNoGit: boolean;
  /** Adapter count generated (US2) — 0 when commands half is off/uninstalling. */
  adaptersGenerated: number;
  notes: string[];
}

/** Whether `cwd` is inside a git working tree (FR-009 — the gate needs git). */
export function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the ordered decision list from the options + repo state. Pure but for
 * the git-presence probe; the executor (runTools) turns each decision into a
 * real fs/hook operation. The command half installs even without git; the hook
 * half is dropped (with a note) in a non-git project (FR-009).
 */
export function planTools(opts: ToolsOptions): ToolsSummary {
  const decisions: ToolsDecision[] = [];
  const notes: string[] = [];
  const git = isGitRepo(opts.cwd);
  const hookSkippedNoGit = opts.hooks && !git;

  if (opts.uninstall) {
    if (opts.hooks && git) decisions.push({ kind: 'remove-hook', detail: 'remove the pre-commit gate (restoring any chained prior hook)' });
    if (opts.commands) decisions.push({ kind: 'remove-adapters', detail: 'remove the generated .claude/commands adapters' });
    return { decisions, hookSkippedNoGit: false, adaptersGenerated: 0, notes };
  }

  if (opts.hooks) {
    if (git) {
      decisions.push({ kind: 'install-hook', detail: 'install a git pre-commit gate running `spectastic validate`' });
    } else {
      notes.push('skipped the pre-commit gate — not a git repository (FR-009); run `git init` then re-run `init --tools`.');
    }
  }
  if (opts.commands) {
    decisions.push({ kind: 'generate-adapters', detail: 'generate drift-proof .claude/commands adapters from source' });
  }

  return { decisions, hookSkippedNoGit, adaptersGenerated: 0, notes };
}

/**
 * Execute a planned tools install/uninstall. Idempotent and reporting (FR-001):
 * re-running reconciles to the same state. The per-decision executors land with
 * their stories — install/remove-hook in ./hook.ts (T-110..), generate/remove
 * adapters in ./adapters.ts (T-210..). Until those land this throws for the
 * install kinds, so no half-built path masquerades as done.
 */
export async function runTools(opts: ToolsOptions): Promise<ToolsSummary> {
  const summary = planTools(opts);
  for (const decision of summary.decisions) {
    switch (decision.kind) {
      case 'install-hook': {
        const { chained } = installHook(opts.cwd, opts.cliEntry);
        if (chained) summary.notes.push('preserved and chained an existing pre-commit hook (FR-006).');
        break;
      }
      case 'remove-hook': {
        const { restored } = uninstallHook(opts.cwd);
        if (restored) summary.notes.push('restored the previously-chained pre-commit hook.');
        break;
      }
      case 'generate-adapters': {
        const { generated } = generateAdapters(opts.cwd);
        summary.adaptersGenerated = generated;
        if (generated === 0) summary.notes.push('no commands/ source found — no adapters generated.');
        break;
      }
      case 'remove-adapters': {
        const { removed } = removeAdapters(opts.cwd);
        summary.notes.push(`removed ${removed} managed command adapter(s).`);
        break;
      }
    }
  }
  return summary;
}
