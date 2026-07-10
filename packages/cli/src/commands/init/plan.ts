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
 * Per D-005 of specs/003-init-node-port/plan.html (FR-002) and
 * specs/018-explain/plan.html D-002 (FR-009).
 */
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
