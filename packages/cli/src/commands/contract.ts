import type { Command } from 'commander';

/**
 * Register the `contract` subcommand (spec 076-contract-export-handover, US1).
 * Resolves a contract coordinate to the contract it names and prints it.
 *
 * Read-only and offline: it resolves against this repository's own declarations
 * and prints what is already on disk — it never fetches a remote coordinate.
 * The deterministic engine lives in `@spectastic/core/commands/contract`.
 */
export function registerContract(program: Command): void {
  program
    .command('contract')
    .description(
      'Print a declared contract by its coordinate — for addressing an interface unambiguously across repos. Reads local declarations only; never fetches.',
    )
    .argument('<coordinate>', 'the contract to resolve — a name, or a full spectastic:// coordinate')
    .option('--uri', 'print the canonical coordinate instead of the contract content')
    .action(async (coordinate: string, opts: { uri?: boolean }) => {
      const { contractCommand, UnknownContractError, UnresolvedContractError } = await import(
        '@spectastic/core/commands/contract'
      );

      try {
        const result = contractCommand({ coordinate }, process.cwd());
        process.stdout.write(opts.uri ? `${result.uri}\n` : result.content);
        process.exit(0);
      } catch (err) {
        if (err instanceof UnknownContractError || err instanceof UnresolvedContractError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });
}
