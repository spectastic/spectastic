import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { buildPlan, findConflicts } from './init/plan.js';
import {
  NonTTYConflictError,
  UserCancelError,
  resolveConflicts,
} from './init/prompt.js';
import { printSummary } from './init/summary.js';
import { executeWrites } from './init/write.js';

interface InitOptions {
  force?: boolean;
}

/**
 * Register the `init` subcommand. Bootstraps a spectastic project in
 * the current working directory by writing the canonical 16-file
 * lifecycle structure (8 slash commands + 2 assets + 6 templates).
 *
 * Per FR-001..FR-009 of specs/003-init-node-port/spec.html.
 * Conflict UX delegates to `resolveConflicts` (prompt.ts); --force
 * + non-TTY refusal land via FR-004 + FR-005.
 */
export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Bootstrap a spectastic project in the current directory.')
    .option('-f, --force', 'overwrite existing files without prompting')
    .action(async (options: InitOptions) => {
      const inventory = resolveBundle();
      const plan = buildPlan({ inventory, cwd: process.cwd() });
      const conflicts = findConflicts(plan);

      try {
        await resolveConflicts(conflicts, { force: options.force ?? false });
      } catch (err) {
        if (err instanceof NonTTYConflictError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        if (err instanceof UserCancelError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }

      const summary = await executeWrites(plan);
      printSummary(summary);
      process.exit(0);
    });
}
