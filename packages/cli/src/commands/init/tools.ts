import { execFileSync } from 'node:child_process';
import type { AdapterTarget } from './adapters.js';
import { CLAUDE_TARGET, generateAdapters, removeAdapters } from './adapters.js';
import type { CiHost, CiSelection } from './ci.js';
import { bootstrapGitlabRoot, gitlabIncludeNote, installCi, removeCi, removeGitlabBootstrap, resolveCiHosts } from './ci.js';
import { ToolsError } from './errors.js';
import { installHook, uninstallHook } from './hook.js';

/** Human label for a host, used in decision details and notes — every call
 *  site already appends "CI gate", so this names the host only. */
function hostLabel(host: CiHost): string {
  return host === 'github' ? 'GitHub' : 'GitLab';
}

/**
 * Orchestrator for `init --tools` (spec 031-init-tools, plan D-004; extended
 * to a third half by 121-init-ci-gate).
 *
 * `init --tools` installs the guarantee layer into a spectastic project: a git
 * pre-commit gate that runs `spectastic validate` (US1, FR-002..006), a CI
 * gate for GitHub Actions / GitLab CI running validate + enforce + verdict
 * (121, FR-001), and generate-on-demand Claude Code command adapters that
 * can't ship stale (US2, FR-007/008). This module owns the plan/execute/
 * summary flow; the three halves live in ./hook.ts, ./ci.ts and ./adapters.ts.
 * It reuses the init command's opt-in, idempotent, report-what-changed
 * contract (FR-001).
 */

export { ToolsError };

/** The three installable halves, selectable via --hooks-only / --commands-only / --ci-only. */
export interface ToolsOptions {
  cwd: string;
  /** Install the pre-commit gate (US1). */
  hooks: boolean;
  /** Install the generated command adapters (US2). */
  commands: boolean;
  /** Install the CI gate (121-init-ci-gate). */
  ci: boolean;
  /** Which host(s) the CI gate targets — resolved by the caller (a terminal
   *  prompt may already have turned `auto` into an explicit choice; 121 FR-002). */
  ciHost?: CiSelection;
  /** The installing CLI's own version, pinned into the rendered gate (121 FR-005). */
  cliVersion?: string;
  /** Remove what was installed instead of installing (FR-010). */
  uninstall: boolean;
  /** Overwrite without prompting (mirrors init --force). */
  force: boolean;
  /** Absolute CLI entry the installed hook should invoke (see hook.currentCliEntry). */
  cliEntry: string;
  /** Host target for the command adapters — 'claude' (default) or 'codex' (spec 111). */
  target?: 'claude' | 'codex';
}

/** A single planned action, mirroring init's FileWriteDecision shape (D-004). */
export interface ToolsDecision {
  kind: 'install-hook' | 'generate-adapters' | 'remove-hook' | 'remove-adapters' | 'install-ci' | 'remove-ci';
  /** One-line human description for the summary (FR-001 reporting). */
  detail: string;
  /** The CI host this decision targets — only set for install-ci/remove-ci. */
  host?: CiHost;
}

export interface ToolsSummary {
  decisions: ToolsDecision[];
  /** True when the hook half was skipped because this isn't a git repo (FR-009). */
  hookSkippedNoGit: boolean;
  /** Adapter count generated (US2) — 0 when commands half is off/uninstalling. */
  adaptersGenerated: number;
  /** Hosts the CI gate was actually installed for (121) — empty when ci is off/uninstalling. */
  ciInstalled: CiHost[];
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

/** The uninstall host set: an explicit host targets only itself; otherwise both
 *  — `removeCi` is a safe no-op on an absent/unmanaged file, so trying both
 *  never harms (121 FR-009). */
function uninstallCiHosts(opts: ToolsOptions): readonly CiHost[] {
  return opts.ciHost && opts.ciHost !== 'auto' ? resolveCiHosts(opts.ciHost, opts.cwd) : (['github', 'gitlab'] as const);
}

/** Plan the CI half's decisions (121-init-ci-gate). Split out of `planTools`
 *  to keep both functions' branching shallow. */
function planCi(opts: ToolsOptions): { decisions: ToolsDecision[]; notes: string[] } {
  const decisions: ToolsDecision[] = [];
  const notes: string[] = [];
  if (opts.uninstall) {
    for (const host of uninstallCiHosts(opts)) {
      decisions.push({ kind: 'remove-ci', host, detail: `remove the ${hostLabel(host)} CI gate` });
    }
    return { decisions, notes };
  }
  const hosts = resolveCiHosts(opts.ciHost ?? 'auto', opts.cwd);
  if (hosts.length === 0) {
    const ciOnlyRequested = !opts.hooks && !opts.commands;
    if (ciOnlyRequested) {
      throw new ToolsError(
        '--ci-only: no CI host detected and none given — pass --ci github|gitlab|both to choose one.',
      );
    }
    notes.push('skipped the CI gate — no .github/ or .gitlab-ci.yml found; pass --ci github|gitlab|both to choose.');
    return { decisions, notes };
  }
  for (const host of hosts) {
    decisions.push({ kind: 'install-ci', host, detail: `install the ${hostLabel(host)} CI gate` });
  }
  return { decisions, notes };
}

function planUninstall(opts: ToolsOptions, git: boolean, adapterDir: string): ToolsSummary {
  const decisions: ToolsDecision[] = [];
  const notes: string[] = [];
  if (opts.hooks && git) {
    decisions.push({ kind: 'remove-hook', detail: 'remove the pre-commit gate (restoring any chained prior hook)' });
  }
  if (opts.commands) {
    decisions.push({ kind: 'remove-adapters', detail: `remove the generated ${adapterDir} adapters` });
  }
  if (opts.ci) {
    const ciPlan = planCi(opts);
    decisions.push(...ciPlan.decisions);
    notes.push(...ciPlan.notes);
  }
  return { decisions, hookSkippedNoGit: false, adaptersGenerated: 0, ciInstalled: [], notes };
}

function planInstall(opts: ToolsOptions, git: boolean, adapterDir: string): ToolsSummary {
  const decisions: ToolsDecision[] = [];
  const notes: string[] = [];
  if (opts.hooks) {
    if (git) {
      decisions.push({ kind: 'install-hook', detail: 'install a git pre-commit gate running `spectastic validate`' });
    } else {
      notes.push(
        'skipped the pre-commit gate — not a git repository (FR-009); run `git init` then re-run `init --tools`.',
      );
    }
  }
  if (opts.commands) {
    decisions.push({ kind: 'generate-adapters', detail: `generate drift-proof ${adapterDir} adapters from source` });
  }
  if (opts.ci) {
    const ciPlan = planCi(opts);
    decisions.push(...ciPlan.decisions);
    notes.push(...ciPlan.notes);
  }
  return { decisions, hookSkippedNoGit: opts.hooks && !git, adaptersGenerated: 0, ciInstalled: [], notes };
}

/**
 * Build the ordered decision list from the options + repo state. Pure but for
 * the git-presence and CI-host-detection probes; the executor (runTools) turns
 * each decision into a real fs/hook operation. The command half installs even
 * without git; the hook half is dropped (with a note) in a non-git project
 * (FR-009).
 */
export function planTools(opts: ToolsOptions): ToolsSummary {
  const git = isGitRepo(opts.cwd);
  const adapterDir = opts.target === 'codex' ? '.agents/skills' : '.claude/commands';
  return opts.uninstall ? planUninstall(opts, git, adapterDir) : planInstall(opts, git, adapterDir);
}

/**
 * Execute a planned tools install/uninstall. Idempotent and reporting (FR-001):
 * re-running reconciles to the same state. The per-decision executors land with
 * their stories — install/remove-hook in ./hook.ts (T-110..), generate/remove
 * adapters in ./adapters.ts (T-210..). Until those land this throws for the
 * install kinds, so no half-built path masquerades as done.
 */
function applyInstallHook(opts: ToolsOptions, summary: ToolsSummary): void {
  const { chained } = installHook(opts.cwd, opts.cliEntry);
  if (chained) summary.notes.push('preserved and chained an existing pre-commit hook (FR-006).');
}

function applyRemoveHook(opts: ToolsOptions, summary: ToolsSummary): void {
  const { restored } = uninstallHook(opts.cwd);
  if (restored) summary.notes.push('restored the previously-chained pre-commit hook.');
}

function applyGenerateAdapters(opts: ToolsOptions, summary: ToolsSummary, targets: readonly AdapterTarget[]): void {
  let generated = 0;
  for (const target of targets) generated += generateAdapters(opts.cwd, target).generated;
  summary.adaptersGenerated = generated;
  if (generated === 0) summary.notes.push('no commands/ source found — no adapters generated.');
}

function applyRemoveAdapters(opts: ToolsOptions, summary: ToolsSummary, targets: readonly AdapterTarget[]): void {
  let removed = 0;
  for (const target of targets) removed += removeAdapters(opts.cwd, target).removed;
  summary.notes.push(`removed ${removed} managed adapter(s).`);
}

function applyInstallCi(opts: ToolsOptions, summary: ToolsSummary, host: CiHost): void {
  const result = installCi(opts.cwd, host, { cliVersion: opts.cliVersion ?? '', force: opts.force });
  summary.ciInstalled.push(host);
  summary.notes.push(`CI gate ${result.path}: ${result.outcome}.`);
  if (host === 'gitlab') {
    // The sidecar above is the managed gate; the root file is a one-time
    // courtesy (121 FR-007/008) — bootstrap it only when the project has none,
    // then always report the include's state so a real project's own
    // .gitlab-ci.yml (left untouched) is never silently un-wired.
    const { created } = bootstrapGitlabRoot(opts.cwd);
    if (created) summary.notes.push('created .gitlab-ci.yml with the include (no root pipeline file existed).');
    summary.notes.push(gitlabIncludeNote(opts.cwd));
  }
}

function applyRemoveCi(opts: ToolsOptions, summary: ToolsSummary, host: CiHost): void {
  const { removed } = removeCi(opts.cwd, host);
  summary.notes.push(removed ? `removed the ${hostLabel(host)} CI gate.` : `no ${hostLabel(host)} CI gate to remove.`);
  if (host === 'gitlab') {
    const { removed: bootstrapRemoved } = removeGitlabBootstrap(opts.cwd);
    if (bootstrapRemoved) summary.notes.push('removed the bootstrap .gitlab-ci.yml (still unchanged since it was created).');
  }
}

/**
 * Execute a planned tools install/uninstall. Idempotent and reporting (FR-001):
 * re-running reconciles to the same state. Each decision kind's own logic
 * lives in its `apply*` helper above; this function is a dispatcher only.
 */
export async function runTools(opts: ToolsOptions): Promise<ToolsSummary> {
  const summary = planTools(opts);
  // Which adapter trees this target manages (spec 111 FR-013): Codex manages
  // only the portable `.agents/skills` tree; the default Claude target manages
  // its `.claude/commands` AND that same portable skills tree, so a managed
  // Claude project's skills cannot ship stale either. The skills target's
  // descriptor is imported lazily so the translator + its yaml dependency stay
  // off the init cold path.
  const { CODEX_TARGET } = await import('./adapters-codex.js');
  const targets = opts.target === 'codex' ? [CODEX_TARGET] : [CLAUDE_TARGET, CODEX_TARGET];
  for (const decision of summary.decisions) {
    switch (decision.kind) {
      case 'install-hook':
        applyInstallHook(opts, summary);
        break;
      case 'remove-hook':
        applyRemoveHook(opts, summary);
        break;
      case 'generate-adapters':
        applyGenerateAdapters(opts, summary, targets);
        break;
      case 'remove-adapters':
        applyRemoveAdapters(opts, summary, targets);
        break;
      case 'install-ci':
        applyInstallCi(opts, summary, decision.host as CiHost);
        break;
      case 'remove-ci':
        applyRemoveCi(opts, summary, decision.host as CiHost);
        break;
    }
  }
  return summary;
}
