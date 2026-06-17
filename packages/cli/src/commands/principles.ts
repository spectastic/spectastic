import type { Command } from 'commander';

/**
 * Register the `principles` subcommand. Generates principles.html
 * via @spectastic/core/commands/principles; refuses if the file
 * already exists per 008 D-002.
 */
export function registerPrinciples(program: Command): void {
  program
    .command('principles')
    .description(
      'Generate a fresh principles.html for a project. Refuses if one already exists.',
    )
    .option('--name <project>', 'project name (kernel asks if omitted)')
    .option('--tagline <tag>', 'one-line tagline')
    .option('--count <n>', 'number of principles', '5')
    .option('--force', 'overwrite existing principles.html')
    .option('--output <path>', 'output path', './principles.html')
    .action(
      async (opts: {
        name?: string;
        tagline?: string;
        count: string;
        force?: boolean;
        output: string;
      }) => {
        const [{ principlesCommand }, { ClaudeProvider }, { nodeFs }, fs] =
          await Promise.all([
            import('@spectastic/core/commands/principles'),
            import('@spectastic/core/providers/claude'),
            import('@spectastic/core/providers/node-fs'),
            import('node:fs/promises'),
          ]);

        // Refuse-if-exists per D-002 (caller-side; kernel stays pure).
        try {
          await fs.access(opts.output);
          if (!opts.force) {
            process.stderr.write(
              `${opts.output} already exists. Use --force to overwrite, or amend via /spectastic.propose against principles.html.\n`,
            );
            process.exit(2);
          }
        } catch {
          // File doesn't exist — proceed.
        }

        const ai = new ClaudeProvider();
        const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

        const input = {
          ...(opts.name ? { projectName: opts.name } : {}),
          ...(opts.tagline ? { tagline: opts.tagline } : {}),
          principlesCount: Number.parseInt(opts.count, 10),
        };

        const result = await principlesCommand(input, ctx);
        await fs.writeFile(opts.output, result.html, 'utf8');
        process.stdout.write(
          `Wrote ${opts.output} (${result.principlesCount} principles).\n`,
        );
        process.exit(0);
      },
    );
}
