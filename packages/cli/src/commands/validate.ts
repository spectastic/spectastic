import type { Command } from 'commander';

interface ValidateOptions {
  format: string;
  ignore?: string[];
}

/**
 * Register the `validate` subcommand. Implements FR-001, FR-002, FR-014
 * of specs/002-validate-cli/spec.html.
 *
 * Heavy dependencies (parse5 via @spectastic/schema, tinyglobby) are
 * dynamically imported inside the action so that other subcommands —
 * notably `init` — don't pay the cold-start cost on every invocation.
 * Keeps init under its <500 ms NFR.
 */
export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate one or more spec-html files. Exits 0 on clean, 1 on findings, 2 on usage errors.')
    .argument('<paths...>', 'file paths or glob patterns')
    .option('-f, --format <fmt>', 'output format: human (default) | json | sarif', 'human')
    .option('-i, --ignore <patterns...>', 'additional glob patterns to exclude')
    .action(async (paths: string[], options: ValidateOptions) => {
      const [{ validateCommand }, { expandGlobs }, { humanFormatter }, { jsonFormatter }, { sarifFormatter }] =
        await Promise.all([
          import('@spectastic/core/commands/validate'),
          import('../glob.js'),
          import('../formatters/human.js'),
          import('../formatters/json.js'),
          import('../formatters/sarif.js'),
        ]);

      const files = await expandGlobs(paths, options.ignore);
      if (files.length === 0) {
        process.stderr.write('No files matched the given patterns.\n');
        process.exit(2);
      }

      const result = await validateCommand({ files }, { cwd: process.cwd() });

      if (result.exitCode === 2) {
        process.stderr.write(`${result.errorMessage ?? 'usage error'}\n`);
        process.exit(2);
      }

      let output: string;
      switch (options.format) {
        case 'human':
          output = humanFormatter(result.findings);
          break;
        case 'json':
          output = jsonFormatter(result.findings);
          break;
        case 'sarif':
          output = sarifFormatter(result.findings);
          break;
        default:
          process.stderr.write(`Unknown format "${options.format}". Use human | json | sarif.\n`);
          process.exit(2);
      }
      process.stdout.write(output);

      process.exit(result.exitCode);
    });
}
