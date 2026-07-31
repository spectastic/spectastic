/**
 * Pure derivation for the git layer (spec 026-git-strategy, plan D-006). Given a
 * just-written artifact's verb + spec id, derive the commit subject and branch
 * name, and answer the one policy question the orchestrator asks: may this verb
 * create a branch? Nothing here touches git or the filesystem — it is a function
 * of its inputs, so it is exhaustively unit-testable.
 *
 * The grammar is Conventional Commits (FR-002): `<verb>(NNN): <subject>`, where
 * the verb is the type and the spec id's numeric prefix is the scope. The branch
 * is the full `NNN-slug` (the slice = the branch).
 */

import type { Verb } from './index.js';

/** Per-verb git policy. Only `spec` may open a branch (FR-003); everything else
 * commits on the current branch — which is also the small-work rule (FR-005):
 * just-do/triage/hotfix work runs through verbs that never branch. */
export interface VerbGitPolicy {
  /** May this verb create the `NNN-slug` branch for a new slice? */
  createsBranch: boolean;
}

export const VERB_GIT_MAP: Record<Verb, VerbGitPolicy> = {
  spec: { createsBranch: true },
  design: { createsBranch: false },
  tasks: { createsBranch: false },
  implement: { createsBranch: false },
  propose: { createsBranch: false },
  apply: { createsBranch: false },
  triage: { createsBranch: false },
  principles: { createsBranch: false },
};

/** The commit scope: the spec id's numeric prefix (`026-git-strategy` → `026`),
 * falling back to the whole id if it carries no leading number. */
export function scopeOf(specId: string): string {
  const m = /^(\d+)/.exec(specId);
  return m ? m[1]! : specId;
}

/**
 * The Conventional-Commits subject for an auto-commit (FR-002, FR-007). Scoped
 * `<verb>(NNN): <subject>` whenever a spec id is in play; unscoped
 * `<verb>: <subject>` when it isn't — `triage` list-intake, `principles`, or an
 * `implement` run draining an id-less inbox `just-do` card. The scope is
 * omitted, never faked with a placeholder.
 */
export function commitSubject(verb: Verb, specId: string | undefined, subject: string): string {
  if (!specId || specId.trim() === '') return `${verb}: ${subject}`;
  return `${verb}(${scopeOf(specId)}): ${subject}`;
}

/** The branch name for a slice — the full `NNN-slug` (FR-003). */
export function branchName(specId: string): string {
  return specId;
}

/**
 * Whether the orchestrator should create a branch for this commit: only when the
 * config is `branch+commit`, the verb may branch, and this is a new slice (a
 * sharpen/re-entry reuses the existing branch).
 */
export function shouldCreateBranch(verb: Verb, auto: 'off' | 'commit' | 'branch+commit', newSlice: boolean): boolean {
  return auto === 'branch+commit' && VERB_GIT_MAP[verb].createsBranch && newSlice;
}
