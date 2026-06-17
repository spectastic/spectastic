import type { Command } from 'commander';

/**
 * Register the `principles` subcommand. Generates principles.html
 * via @spectastic/core/commands/principles. Per FR-004 of
 * specs/008-core-principles/spec.html (post P-6 cascade): the
 * destination's `<spec-status>` gates the write — Draft accepts
 * in-place edit; past-Draft refuses with a pointer to
 * `/spectastic.propose`. `--force` bypasses with a warning.
 */
export function registerPrinciples(program: Command): void {
  program
    .command('principles')
    .description(
      'Generate a fresh principles.html for a project, or edit a Draft one in place. Past-Draft destinations refuse.',
    )
    .option('--name <project>', 'project name (kernel asks if omitted)')
    .option('--tagline <tag>', 'one-line tagline')
    .option('--count <n>', 'number of principles', '5')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .option('--output <path>', 'output path', './principles.html')
    .action(
      async (opts: {
        name?: string;
        tagline?: string;
        count: string;
        force?: boolean;
        output: string;
      }) => {
        const [{ principlesCommand }, { ClaudeProvider }, { nodeFs }, { gateOnDestinationState }, fs] =
          await Promise.all([
            import('@spectastic/core/commands/principles'),
            import('@spectastic/core/providers/claude'),
            import('@spectastic/core/providers/node-fs'),
            import('../state-gate.js'),
            import('node:fs/promises'),
          ]);

        const decision = await gateOnDestinationState(fs, opts.output, { force: opts.force });
        if (decision.kind === 'refuse') {
          process.stderr.write(
            `${opts.output} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to overwrite. Amend via /spectastic.propose against principles.html, or pass --force to bypass.\n`,
          );
          process.exit(2);
        }
        if (decision.kind === 'edit-in-place') {
          const note =
            opts.force && decision.status !== null && decision.status !== 'draft'
              ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
              : `Editing Draft ${opts.output} in place per P-6.\n`;
          process.stderr.write(note);
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
