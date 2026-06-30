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
    .option('--summary <text>', 'author-supplied one-line changelog summary (apply mode)')
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(
      async (
        specId: string,
        slug: string,
        opts: { withdraw?: boolean; reason?: string; summary?: string; commit?: boolean },
      ) => {
        const [{ applyCommand }, { nodeFs }, { gateOnQuarantine }, fs, path] = await Promise.all([
          import('@spectastic/core/commands/apply'),
          import('@spectastic/core/providers/node-fs'),
          import('../state-gate.js'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

        // Anti-ship guard (022-explore, FR-006): refuse to advance a quarantined exploration.
        const quarantine = await gateOnQuarantine(fs, process.cwd(), specId);
        if (quarantine) {
          process.stderr.write(`${quarantine.message}\n`);
          process.exit(2);
        }

        if (opts.withdraw && !opts.reason) {
          process.stderr.write('--withdraw requires --reason "<one-line reason>"\n');
          process.exit(2);
        }

        const input = opts.withdraw
          ? ({ kind: 'withdraw' as const, specId, slug, reason: opts.reason! })
          : ({
              kind: 'apply' as const,
              specId,
              slug,
              // Include `summary` only when given — exactOptionalPropertyTypes rejects an explicit undefined.
              ...(opts.summary ? { summary: opts.summary } : {}),
            });

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

        // Opt-in git layer (spec 026): stage the whole spec dir so the commit captures
        // the spec patch, the tasks-fold, and the changes→archive move (D-006).
        const { commitVerbAndExit } = await import('../git/index.js');
        await commitVerbAndExit({
          verb: 'apply',
          cwd: process.cwd(),
          specId,
          paths: [path.resolve(process.cwd(), 'specs', specId)],
          subject: slug,
          ...(opts.commit === undefined ? {} : { commit: opts.commit }),
        });
      },
    );
}
