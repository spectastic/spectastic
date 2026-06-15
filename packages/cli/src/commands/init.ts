import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { buildPlan, findConflicts } from './init/plan.js';
import { printSummary } from './init/summary.js';
import { executeWrites } from './init/write.js';

/**
 * Register the `init` subcommand. Bootstraps a spectastic project in
 * the current working directory by writing the canonical 16-file
 * lifecycle structure (8 slash commands + 2 assets + 6 templates).
 *
 * Per FR-001..FR-009 of specs/003-init-node-port/spec.html. The
 * prompt loop (US2) and --force handling (US3) wire in incrementally.
 */
export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Bootstrap a spectastic project in the current directory.')
    .action(async () => {
      const inventory = resolveBundle();
      const plan = buildPlan({ inventory, cwd: process.cwd() });

      const conflicts = findConflicts(plan);
      if (conflicts.length > 0) {
        // US2 lands the prompt loop here; until then, refuse on any conflict
        // so we never silently overwrite. The user can re-run after deleting
        // the conflicting files, or wait for the prompt loop to ship.
        process.stderr.write(
          `init: ${conflicts.length} existing file(s) in destination; pass --force or remove them first.\n`,
        );
        process.exit(2);
      }

      const summary = await executeWrites(plan);
      printSummary(summary);
      process.exit(0);
    });
}
