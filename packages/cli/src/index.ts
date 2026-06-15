import { Command } from 'commander';
import { registerValidate } from './commands/validate.js';

/**
 * @spectastic/cli entry point.
 *
 * Per FR-001 of specs/002-validate-cli/spec.html: no args → print
 * usage and exit 2. With args, parse via commander and dispatch.
 */
const program = new Command();
program
  .name('spectastic')
  .description('Validate spec-html files against the spectastic grammar.')
  .version('0.1.0-pre');

registerValidate(program);

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(2);
}

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}
