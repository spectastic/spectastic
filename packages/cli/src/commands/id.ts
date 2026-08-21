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
      "Print a resource's canonical URI, qualified by this project's identity — for addressing it unambiguously across repos.",
    )
    .argument('<name>', 'what to resolve — a spec id by default (e.g. 001-auth-service)')
    .option(
      '--kind <kind>',
      'what the name denotes: spec (default), screen (<spec-id>/<name>), contract, corpus (<plugin>/<slug>), or unit',
      'spec',
    )
    .option(
      '--anchor <id>',
      'append an id from the resource (a requirement, task, or section anchor) as a URI fragment',
    )
    .action(async (specId: string, opts: { anchor?: string; kind?: string }) => {
      const { idCommand, UnknownSpecError } = await import('@spectastic/core/commands/id');
      const { RESOURCE_KINDS } = await import('@spectastic/schema/project');

      // Validated against the grammar's own declaration rather than a literal
      // list, so a kind added there can never be unreachable here.
      const kind = opts.kind ?? 'spec';
      if (!(RESOURCE_KINDS as readonly string[]).includes(kind)) {
        process.stderr.write(`Unknown kind "${kind}". Expected one of: ${RESOURCE_KINDS.join(', ')}.\n`);
        process.exit(1);
      }

      try {
        const result = idCommand(
          {
            specId,
            kind: kind as 'spec' | 'screen' | 'contract' | 'corpus' | 'unit',
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
