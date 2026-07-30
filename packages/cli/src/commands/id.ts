import type { Command } from 'commander';

/**
 * Register the `id` subcommand (spec 067-spec-project-identity, plan D-003).
 * Prints a spec's canonical, federation-unique `spectastic://` resource URI —
 * the project identity (from `spectastic.json`) qualifying the repo-local
 * spec id. A read-only utility, not a lifecycle verb; main-CLI-only (the
 * standalone corpus binary has no `specs/`).
 *
 * The CLI is the thin wrapper; the deterministic engine lives in
 * `@spectastic/core/commands/id`.
 */
export function registerId(program: Command): void {
  program
    .command('id')
    .description(
      "Print a spec's canonical resource URI, qualified by this project's identity — for addressing it unambiguously across repos.",
    )
    .argument('<spec-id>', 'the spec to resolve (e.g. 001-auth-service)')
    .option('--anchor <id>', 'append an id from the spec (a requirement, task, or section anchor) as a URI fragment')
    .action(async (specId: string, opts: { anchor?: string }) => {
      const { idCommand, UnknownSpecError } = await import('@spectastic/core/commands/id');

      try {
        const result = idCommand(
          {
            specId,
            ...(opts.anchor !== undefined ? { anchor: opts.anchor } : {}),
          },
          process.cwd(),
        );
        process.stdout.write(`${result.uri}\n`);
        process.exit(0);
      } catch (err) {
        if (err instanceof UnknownSpecError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });
}
