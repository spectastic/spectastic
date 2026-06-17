import type { Command } from 'commander';

/**
 * Register the `tasks` subcommand. Reads spec.html + plan.html for the
 * named slice; calls @spectastic/core/commands/tasks; writes the result
 * to specs/<id>/tasks.html.
 */
export function registerTasks(program: Command): void {
  program
    .command('tasks')
    .description('Generate tasks.html for an existing spec slice.')
    .argument('<spec-id>', 'spec ID, e.g. 001-auth-service')
    .option('--force', 'overwrite existing tasks.html')
    .action(async (specId: string, opts: { force?: boolean }) => {
      const [{ tasksCommand }, { ClaudeProvider }, { nodeFs }, fs, path] =
        await Promise.all([
          import('@spectastic/core/commands/tasks'),
          import('@spectastic/core/providers/claude'),
          import('@spectastic/core/providers/node-fs'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

      const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
      const planPath = path.resolve(process.cwd(), 'specs', specId, 'plan.html');
      const tasksPath = path.resolve(process.cwd(), 'specs', specId, 'tasks.html');

      try {
        await fs.access(tasksPath);
        if (!opts.force) {
          process.stderr.write(
            `${tasksPath} already exists. Use --force to overwrite.\n`,
          );
          process.exit(2);
        }
      } catch {
        // Doesn't exist — proceed.
      }

      const ai = new ClaudeProvider();
      const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

      const result = await tasksCommand({ specPath, planPath }, ctx);
      await fs.writeFile(tasksPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${tasksPath} (${result.totalTasks} tasks, ${result.parallelTasks} parallel).\n`,
      );
      process.exit(0);
    });
}
