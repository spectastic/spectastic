import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerCurate } from './curate.js';
import { registerConvert } from './convert.js';
import { registerValidate } from './validate.js';
import { registerRead } from './read.js';

/**
 * spectastic-corpus entry point — the standalone binary (064-corpus-package-extraction,
 * FR-004, US2). Runs without @spectastic/core or the SDD lifecycle present.
 *
 * Curation verbs (adapt/import/interview/source/publish) and corpus-intrinsic validate
 * (well-formed/registry/license) register at the top level, not nested under a `corpus`
 * subcommand — unlike @spectastic/cli, where `corpus` is one command group among many,
 * this binary IS the corpus tool, so `spectastic-corpus adapt` reads better than
 * `spectastic-corpus corpus adapt`. get/query/grep (US3) register the same way once built.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program
  .name('spectastic-corpus')
  .description(
    'Standalone knowledge-corpus tooling: curate a cited corpus, search it (get/query/grep), and validate it — no spec-driven lifecycle required.',
  )
  .version(pkg.version);

registerCurate(program);
registerConvert(program);
registerValidate(program);
registerRead(program);

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
