import type { Finding } from '@spectastic/schema';
import type { Command } from 'commander';
import {
  corpusLicenseFindings,
  corpusRegistryFindings,
  corpusWellFormedFindings,
  loadCorpus,
  loadRegistry,
} from '../knowledge/index.js';

/**
 * Corpus-intrinsic validate (064-corpus-package-extraction, FR-004, US2) — well-formed,
 * registry, and license scans, reusing the same pure finding functions
 * @spectastic/cli's `validate` command folds in (packages/cli/src/commands/validate.ts).
 *
 * Deliberately excludes the grounding gate (corpusGroundingFindings): that scan checks a
 * spec-html document's citations against the corpus, so it needs a `specs/` tree — a
 * lifecycle concern the standalone binary doesn't have and shouldn't require. Well-formed /
 * registry / license are properties of the corpus alone.
 */
function formatFinding(f: Finding): string {
  const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
  const hint = f.fixHint ? `\n    → ${f.fixHint}` : '';
  return `  ${f.severity} ${loc} [${f.rule}] ${f.message}${hint}`;
}

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate the corpus itself — well-formedness, registry consistency, and license permissiveness.')
    .action(() => {
      const cwd = process.cwd();
      const packs = loadCorpus(cwd);
      const registry = loadRegistry(cwd);

      const findings: Finding[] = [
        ...corpusWellFormedFindings(packs),
        ...corpusRegistryFindings(registry),
        ...corpusLicenseFindings(packs),
      ];

      if (findings.length === 0) {
        process.stdout.write('✓ corpus validate: no findings\n');
        process.exit(0);
      }

      process.stdout.write(`corpus validate: ${findings.length} finding(s)\n`);
      for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
      process.exit(1);
    });
}
