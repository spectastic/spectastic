import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleInventory, FileWriteDecision } from './types.js';

/**
 * Build the write plan from a BundleInventory + a target cwd.
 *
 * Every entry starts with action="write"; the prompt loop (US2) mutates
 * entries to "overwrite" or "skip" based on user choices. The writer
 * (US1) only fires after the loop returns cleanly.
 *
 * Per D-005 of specs/003-init-node-port/plan.html and FR-002 of the spec.
 */
export interface BuildPlanOptions {
  inventory: BundleInventory;
  cwd: string;
}

export function buildPlan(opts: BuildPlanOptions): FileWriteDecision[] {
  const { inventory, cwd } = opts;
  return inventory.files.map((entry) => {
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
 * Returns the subset of decisions that point at pre-existing files.
 * The prompt loop iterates these; entries without conflicts skip the loop.
 */
export function findConflicts(plan: readonly FileWriteDecision[]): FileWriteDecision[] {
  return plan.filter((d) => d.preExisting);
}
