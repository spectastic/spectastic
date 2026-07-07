import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { buildPlan, findConflicts } from './init/plan.js';
import {
  NonTTYConflictError,
  UserCancelError,
  resolveConflicts,
} from './init/prompt.js';
import { printSummary } from './init/summary.js';
import { ToolsError, runTools } from './init/tools.js';
import { executeWrites } from './init/write.js';

interface InitOptions {
  force?: boolean;
  with?: string[];
  tools?: boolean;
  hooksOnly?: boolean;
  commandsOnly?: boolean;
  uninstall?: boolean;
}

/** Collect repeatable `--with <verb>` values into an array. */
function collectVerb(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

/**
 * Run the `init --tools` guarantee-layer install/uninstall (spec 031). Any of
 * --tools / --hooks-only / --commands-only / --uninstall routes here instead of
 * the project bootstrap. --tools means both halves; the -only flags narrow it;
 * --uninstall reverses whichever halves are selected (both by default).
 */
async function runToolsMode(options: InitOptions): Promise<void> {
  const narrowed = options.hooksOnly === true || options.commandsOnly === true;
  const hooks = options.hooksOnly === true || (!narrowed);
  const commands = options.commandsOnly === true || (!narrowed);
  try {
    const summary = await runTools({
      cwd: process.cwd(),
      hooks,
      commands,
      uninstall: options.uninstall === true,
      force: options.force ?? false,
    });
    for (const d of summary.decisions) process.stdout.write(`✓ ${d.detail}\n`);
    for (const n of summary.notes) process.stdout.write(`⚠ ${n}\n`);
    process.exit(0);
  } catch (err) {
    if (err instanceof ToolsError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

/**
 * Register the `init` subcommand. Bootstraps a spectastic project in
 * the current working directory by writing the canonical 17-file
 * lifecycle structure (8 slash commands + 2 assets + 7 templates).
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
    .option(
      '--with <verb>',
      'also install an extended (opt-in) verb, e.g. --with explain (repeatable)',
      collectVerb,
      [],
    )
    .option('--tools', 'install the guarantee layer: a pre-commit validate gate + drift-proof command adapters (spec 031)')
    .option('--hooks-only', 'with --tools/--uninstall: only the pre-commit gate half')
    .option('--commands-only', 'with --tools/--uninstall: only the command-adapter half')
    .option('--uninstall', 'remove what init --tools installed (reversible)')
    .action(async (options: InitOptions) => {
      if (options.tools || options.hooksOnly || options.commandsOnly || options.uninstall) {
        await runToolsMode(options);
        return;
      }

      const inventory = resolveBundle();
      const plan = buildPlan({
        inventory,
        cwd: process.cwd(),
        withVerbs: options.with ?? [],
      });
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
