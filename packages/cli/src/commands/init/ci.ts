import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CI_FILE_PATHS, CI_MANAGED_MARKER, type CiHost, isCiManaged, renderCiWorkflow } from '@spectastic/core/ci/render';
import { ToolsError } from './errors.js';

/**
 * The CI-gate installer (spec 121-init-ci-gate, D-001/D-002/D-003). Detection,
 * writes and removal for both hosts — the underlying sidecar write is
 * host-generic (both hosts write to a per-host managed path the same way).
 * The GitLab-specific bootstrap root file and include-state probe live
 * alongside this module's exports but are additive: US1's GitHub install path
 * exercises everything below without needing them.
 *
 * Mirrors `adapters.ts`'s shape (a managed marker scoping the drift gate) and
 * `hook.ts`'s idempotent install/remove contract.
 */

export type { CiHost };

/** The four legal `--ci` values; `auto` triggers detection. */
export type CiSelection = 'github' | 'gitlab' | 'both' | 'auto';

const LEGAL_SELECTIONS: readonly CiSelection[] = ['github', 'gitlab', 'both', 'auto'];

/** Parse `--ci <value>`, defaulting to `auto`. Throws `ToolsError` on an illegal value. */
export function parseCiSelection(raw: string | undefined): CiSelection {
  if (raw === undefined) return 'auto';
  if ((LEGAL_SELECTIONS as readonly string[]).includes(raw)) return raw as CiSelection;
  throw new ToolsError(`--ci: '${raw}' is not one of github, gitlab, both, auto.`);
}

/** Detect which hosts are present by filesystem convention only — never the
 *  user's file contents. `.github/` → github; `.gitlab-ci.yml` or `.gitlab/` → gitlab. */
export function detectCiHosts(cwd: string): CiHost[] {
  const hosts: CiHost[] = [];
  if (existsSync(join(cwd, '.github'))) hosts.push('github');
  if (existsSync(join(cwd, '.gitlab-ci.yml')) || existsSync(join(cwd, '.gitlab'))) hosts.push('gitlab');
  return hosts;
}

/** Resolve a selection to the concrete host list. `auto` defers to detection. */
export function resolveCiHosts(selection: CiSelection, cwd: string): CiHost[] {
  switch (selection) {
    case 'github':
      return ['github'];
    case 'gitlab':
      return ['gitlab'];
    case 'both':
      return ['github', 'gitlab'];
    case 'auto':
      return detectCiHosts(cwd);
  }
}

function managedPath(cwd: string, host: CiHost): string {
  return join(cwd, CI_FILE_PATHS[host]);
}

/** True when a managed gate file exists at `host`'s path (marker on line 1). */
export function ciManaged(cwd: string, host: CiHost): boolean {
  const path = managedPath(cwd, host);
  if (!existsSync(path)) return false;
  try {
    return isCiManaged(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
}

export interface InstallCiOptions {
  cliVersion: string;
  force: boolean;
}

export interface InstallCiResult {
  path: string;
  outcome: 'created' | 'updated' | 'unchanged';
}

/**
 * Install (or idempotently reconcile) the CI gate for one host. Refuses to
 * overwrite a file at the managed path that isn't already managed, unless
 * `force` is set — the first real consumer of the `--tools` force option
 * (121 FR-006).
 */
export function installCi(cwd: string, host: CiHost, opts: InstallCiOptions): InstallCiResult {
  const path = managedPath(cwd, host);
  const existed = existsSync(path);
  if (existed && !opts.force) {
    const current = readFileSync(path, 'utf8');
    if (!isCiManaged(current)) {
      throw new ToolsError(
        `${path} exists and is not managed by spectastic — pass --force to replace it, or move it aside.`,
      );
    }
  }
  const rendered = renderCiWorkflow(host, { cliVersion: opts.cliVersion, mode: 'managed' });
  if (existed) {
    const current = readFileSync(path, 'utf8');
    if (current === rendered.content) return { path, outcome: 'unchanged' };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rendered.content, 'utf8');
  return { path, outcome: existed ? 'updated' : 'created' };
}

export interface RemoveCiResult {
  removed: boolean;
}

/** Remove a managed gate file. A no-op — never touches — an unmanaged or absent file. */
export function removeCi(cwd: string, host: CiHost): RemoveCiResult {
  if (!ciManaged(cwd, host)) return { removed: false };
  rmSync(managedPath(cwd, host), { force: true });
  return { removed: true };
}

// --- GitLab-specific: the root .gitlab-ci.yml is a bootstrap courtesy, never
// an owned file (spec 121-init-ci-gate, D-003). The sidecar above (installCi/
// removeCi/ciManaged with host='gitlab') is host-generic and already covers
// the managed gate itself; everything below is additive.

const GITLAB_ROOT_FILE = '.gitlab-ci.yml';

/** The `include:` snippet pointing at the managed GitLab sidecar. */
function gitlabIncludeSnippet(): string {
  return `include:\n  - local: '/${CI_FILE_PATHS.gitlab}'\n`;
}

/** The full bootstrap root file's content — the marker plus the include, nothing else. */
function gitlabBootstrapContent(): string {
  return `${CI_MANAGED_MARKER}\n${gitlabIncludeSnippet()}`;
}

/** Whether the sidecar is already `include`d from the project's root pipeline
 *  file — `no-gitlab-ci` when the root file doesn't exist at all (121 FR-007/008). */
export function gitlabIncludeState(cwd: string): 'included' | 'missing' | 'no-gitlab-ci' {
  const path = join(cwd, GITLAB_ROOT_FILE);
  if (!existsSync(path)) return 'no-gitlab-ci';
  const content = readFileSync(path, 'utf8');
  return content.includes(`/${CI_FILE_PATHS.gitlab}`) ? 'included' : 'missing';
}

export interface BootstrapGitlabResult {
  path: string;
  created: boolean;
}

/**
 * Create a minimal root `.gitlab-ci.yml` — the marker plus the include, and
 * nothing else — only when no root file exists at all. Never edits an
 * existing one (121 FR-007): spectastic never owns the user's pipeline.
 */
export function bootstrapGitlabRoot(cwd: string): BootstrapGitlabResult {
  const path = join(cwd, GITLAB_ROOT_FILE);
  if (existsSync(path)) return { path, created: false };
  writeFileSync(path, gitlabBootstrapContent(), 'utf8');
  return { path, created: true };
}

/**
 * Remove the bootstrap root file — only while it is still byte-identical to
 * what `bootstrapGitlabRoot` wrote (121 FR-008). A root file the user has
 * since grown with their own jobs is never touched, even though it started
 * as the bootstrap.
 */
export function removeGitlabBootstrap(cwd: string): RemoveCiResult {
  const path = join(cwd, GITLAB_ROOT_FILE);
  if (!existsSync(path)) return { removed: false };
  if (readFileSync(path, 'utf8') !== gitlabBootstrapContent()) return { removed: false };
  rmSync(path, { force: true });
  return { removed: true };
}

/** The printed include note for `runTools`'s summary — the snippet plus the
 *  current state, phrased for whichever of the three states applies. */
export function gitlabIncludeNote(cwd: string): string {
  const state = gitlabIncludeState(cwd);
  const snippet = gitlabIncludeSnippet().trimEnd();
  if (state === 'included') return `the ${GITLAB_ROOT_FILE} include is already present:\n  ${snippet}`;
  if (state === 'missing') {
    return `add this to your ${GITLAB_ROOT_FILE} to run the gate:\n  ${snippet}`;
  }
  return `add this include to ${GITLAB_ROOT_FILE} to run the gate:\n  ${snippet}`;
}
