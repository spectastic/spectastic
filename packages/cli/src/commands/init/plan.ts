import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isExtended, loadManifest, verbFromDestination } from './manifest.js';
import type { BundleInventory, FileWriteDecision } from './types.js';

/**
 * Build the write plan from a BundleInventory + a target cwd.
 *
 * Every entry starts with action="write"; the prompt loop (US2) mutates
 * entries to "overwrite" or "skip" based on user choices. The writer
 * (US1) only fires after the loop returns cleanly.
 *
 * The plan is the DEFAULT (core-only) install unless `withVerbs` names
 * extended verbs to include: a command file whose verb is marked extended
 * in the bundle manifest is dropped unless its verb appears in `withVerbs`.
 * Non-command files (assets, templates) and core verbs always stay.
 * Per D-005 of specs/003-init-node-port/design.html (FR-002) and
 * specs/018-explain/design.html D-002 (FR-009).
 */
/**
 * The canonical sizes of a default (core-only) scaffold — the single source of
 * truth for "how many files does `init` write".
 *
 * There are deliberately TWO numbers, because conflating them is what let this
 * drift three ways (spec said 16, the init docblock said 17, the tests asserted
 * 20 — while the real tree was 21):
 *
 *   SCAFFOLD_FILE_COUNT       files written FROM THE BUNDLE — what buildPlan()
 *                             returns and what the summary reports as `wrote`.
 *   SCAFFOLD_TREE_FILE_COUNT  files ON DISK afterwards — the bundle files plus
 *                             the two files init generates itself outside the
 *                             plan: the `.gitignore` block and the
 *                             `spectastic.json` corpus config (063-corpus-
 *                             discoverability FR-001). This is the number
 *                             004's SC-001 asserts ("a N-file tree").
 *
 * Both are guarded in plan.test.ts: one test asserts the real plan length, one
 * asserts the tree is exactly two more (the generated .gitignore + spectastic.json),
 * and a drift guard asserts SC-001 states SCAFFOLD_TREE_FILE_COUNT. Change the
 * scaffold → change these once, and the guards name everything else that must follow.
 */
// 30 since T-026: the three subagent definitions 044 FR-004 requires synced
// to .claude/agents/ are now installed rather than bundled-and-dropped.
export const SCAFFOLD_FILE_COUNT = 30;
export const SCAFFOLD_TREE_FILE_COUNT = SCAFFOLD_FILE_COUNT + 2;

export interface BuildPlanOptions {
  inventory: BundleInventory;
  cwd: string;
  /** Extended verbs to opt in (from `init --with <verb>`). Default: none. */
  withVerbs?: string[];
}

export function buildPlan(opts: BuildPlanOptions): FileWriteDecision[] {
  const { inventory, cwd, withVerbs = [] } = opts;
  const manifest = loadManifest(inventory.root);
  return inventory.files
    .filter((entry) => {
      const verb = verbFromDestination(entry.relativeDestination);
      if (verb === null) return true; // assets, templates — always installed
      if (!isExtended(verb, manifest)) return true; // core verb
      return withVerbs.includes(verb); // extended: only when opted in
    })
    .map((entry) => {
      const destination = join(cwd, entry.relativeDestination);
      const preExisting = existsSync(destination);
      return {
        source: entry.source,
        destination,
        preExisting,
        action: 'write',
      };
    });
}

/**
 * Returns the subset of decisions that point at pre-existing files AND are
 * still unresolved (action === "write"). The prompt loop iterates these.
 *
 * The `action === "write"` guard lets the profile upgrade path (spec 041)
 * pre-resolve a decision to "overwrite" — a safe additive splice that
 * preserves the user's content — so it bypasses the y/N/skip prompt.
 */
export function findConflicts(plan: readonly FileWriteDecision[]): FileWriteDecision[] {
  return plan.filter((d) => d.preExisting && d.action === 'write');
}
