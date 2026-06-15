import { readFile } from 'node:fs/promises';
import { validateMany } from '@spectastic/schema';
import type { Command } from 'commander';
import { humanFormatter } from '../formatters/human.js';
import { jsonFormatter } from '../formatters/json.js';
import { sarifFormatter } from '../formatters/sarif.js';
import { expandGlobs } from '../glob.js';

interface ValidateOptions {
  format: string;
  ignore?: string[];
}

/**
 * Register the `validate` subcommand. Implements FR-001, FR-002, FR-014
 * of specs/002-validate-cli/spec.html. JSON and SARIF formats are
 * declared but deferred to US2 (T-210, T-211).
 */
export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate one or more spec-html files. Exits 0/1/2 per FR-002.')
    .argument('<paths...>', 'file paths or glob patterns')
    .option('-f, --format <fmt>', 'output format: human (default) | json | sarif', 'human')
    .option('-i, --ignore <patterns...>', 'additional glob patterns to exclude')
    .action(async (paths: string[], options: ValidateOptions) => {
      const files = await expandGlobs(paths, options.ignore);
      if (files.length === 0) {
        process.stderr.write('No files matched the given patterns.\n');
        process.exit(2);
      }

      const inputs: Array<{ html: string; file: string }> = [];
      for (const file of files) {
        const html = await readFile(file, 'utf8');
        inputs.push({ html, file });
      }
      const findings = validateMany(inputs);

      let output: string;
      switch (options.format) {
        case 'human':
          output = humanFormatter(findings);
          break;
        case 'json':
          output = jsonFormatter(findings);
          break;
        case 'sarif':
          output = sarifFormatter(findings);
          break;
        default:
          process.stderr.write(`Unknown format "${options.format}". Use human | json | sarif.\n`);
          process.exit(2);
      }
      process.stdout.write(output);

      const hasError = findings.some((f) => f.severity === 'error');
      process.exit(hasError ? 1 : 0);
    });
}
