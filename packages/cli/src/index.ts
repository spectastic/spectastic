import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerValidate } from './commands/validate.js';

/**
 * @spectastic/cli entry point.
 *
 * Per FR-001 of specs/002-validate-cli/spec.html: no args → print
 * usage and exit 2. With args, parse via commander and dispatch.
 */

// Read version from this package's package.json at runtime so `spectastic -V`
// always reports the actually-installed version. The path resolves from the
// compiled `dist/index.js` (production install) and from `src/index.ts` (dev),
// both of which sit one level under the package root.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program
  .name('spectastic')
  .description(
    'Single-file HTML spec tooling: bootstrap a project with `init`; validate spec-html artifacts with `validate`.',
  )
  .version(pkg.version);

registerInit(program);
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
