import type { Command } from 'commander';

/** Register the `apply` subcommand. Per 010-core-apply spec. */
export function registerApply(program: Command): void {
  program
    .command('apply')
    .description('Apply an approved change proposal to its live spec.')
    .argument('<spec-id>', 'spec ID, e.g. 001-auth-service')
    .argument('<slug>', 'change folder slug, e.g. 2026-06-16-add-oauth')
    .option('--withdraw', 'withdraw mode: reject the proposal instead of applying')
    .option('--reason <reason>', 'rejection reason (required with --withdraw)')
    .action(
      async (
        specId: string,
        slug: string,
        opts: { withdraw?: boolean; reason?: string },
      ) => {
        const [{ applyCommand }, { nodeFs }] = await Promise.all([
          import('@spectastic/core/commands/apply'),
          import('@spectastic/core/providers/node-fs'),
        ]);

        if (opts.withdraw && !opts.reason) {
          process.stderr.write('--withdraw requires --reason "<one-line reason>"\n');
          process.exit(2);
        }

        const input = opts.withdraw
          ? ({ kind: 'withdraw' as const, specId, slug, reason: opts.reason! })
          : ({ kind: 'apply' as const, specId, slug });

        const result = await applyCommand(input, { cwd: process.cwd(), fs: nodeFs });

        process.stdout.write(
          `${opts.withdraw ? 'Withdrew' : 'Applied'} ${slug} → ${result.archivedPath}\n`,
        );
        if (result.deltas.length > 0) {
          const ok = result.deltas.filter((d) => d.result === 'success').length;
          process.stdout.write(`  ${result.deltas.length} delta(s), ${ok} successful\n`);
        }
        if (result.crossSpecWarnings.length > 0) {
          process.stdout.write(
            `  ${result.crossSpecWarnings.length} cross-spec warning(s); follow-up may be needed\n`,
          );
        }
        process.exit(0);
      },
    );
}
