import type { Command } from 'commander';

/**
 * Register the `tasks` subcommand. Reads spec.html + plan.html for the
 * named slice; calls @spectastic/core/commands/tasks; writes the result
 * to specs/<id>/tasks.html. Per FR-012 of specs/009-core-tasks/spec.html
 * (post P-6 cascade): destination state gates the write — Draft accepts
 * in-place edit; past-Draft refuses with a pointer to /spectastic.propose.
 */
export function registerTasks(program: Command): void {
  program
    .command('tasks')
    .description('Generate tasks.html for an existing spec slice; edit Draft in place, refuse past-Draft.')
    .argument('<spec-id>', 'spec ID, e.g. 001-auth-service')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .action(async (specId: string, opts: { force?: boolean }) => {
      const [{ tasksCommand }, { createAIProvider }, { nodeFs }, { gateOnDestinationState }, fs, path] =
        await Promise.all([
          import('@spectastic/core/commands/tasks'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('../state-gate.js'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

      const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
      const planPath = path.resolve(process.cwd(), 'specs', specId, 'plan.html');
      const tasksPath = path.resolve(process.cwd(), 'specs', specId, 'tasks.html');

      const decision = await gateOnDestinationState(fs, tasksPath, { force: opts.force });
      if (decision.kind === 'refuse') {
        process.stderr.write(
          `${tasksPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to overwrite. Amend via /spectastic.propose against the parent spec, or pass --force to bypass.\n`,
        );
        process.exit(2);
      }
      if (decision.kind === 'edit-in-place') {
        const note =
          opts.force && decision.status !== null && decision.status !== 'draft'
            ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
            : `Editing Draft ${tasksPath} in place per P-6.\n`;
        process.stderr.write(note);
      }

      const ai = await createAIProvider();
      const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

      const result = await tasksCommand({ specPath, planPath }, ctx);
      await fs.writeFile(tasksPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${tasksPath} (${result.totalTasks} tasks, ${result.parallelTasks} parallel).\n`,
      );
      process.exit(0);
    });
}
