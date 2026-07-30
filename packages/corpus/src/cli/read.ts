import type { Command } from 'commander';
import { loadCorpus, loadRegistry } from '../knowledge/index.js';
import { get } from '../read/get.js';
import { grep } from '../read/grep.js';
import { query } from '../read/query.js';

/**
 * The read-path subcommands (064-corpus-package-extraction, US3, FR-005): get/query/grep
 * against the corpus on disk at the current working directory. Deterministic exact/substring
 * lookup only — no embeddings, no vector store (FR-005, the survey's provenance-first line).
 */
export function registerRead(program: Command): void {
  program
    .command('get')
    .description('Resolve one document by KB id (bare or edition-pinned), returning its coordinate and provenance.')
    .argument('<id>', 'a KB id, e.g. KB-501 or KB-501@2026-01-01')
    .action((id: string) => {
      const cwd = process.cwd();
      const result = get(id, loadCorpus(cwd), loadRegistry(cwd));
      if (!result.found) {
        process.stdout.write(`corpus get: not found — ${id}\n`);
        process.exit(1);
      }
      process.stdout.write(
        `${result.id}@${result.edition} (${result.kind}) → ${result.filePath}` +
          `${result.label ? `\n  ${result.label}` : ''}\n`,
      );
      process.exit(0);
    });

  program
    .command('query')
    .description(
      'Case-insensitive substring search over corpus metadata (id, slug, title, description) — never document bodies.',
    )
    .argument('<term>', 'the search term')
    .action((term: string) => {
      const cwd = process.cwd();
      const hits = query(term, loadCorpus(cwd), loadRegistry(cwd));
      if (hits.length === 0) {
        process.stdout.write(`corpus query: no matches for "${term}"\n`);
        process.exit(0);
      }
      for (const h of hits) process.stdout.write(`${h.id}@${h.edition} — ${h.title} → ${h.path}\n`);
      process.exit(0);
    });

  program
    .command('grep')
    .description('Full-text search over corpus document bodies — ripgrep when available, else a pure-Node scan.')
    .argument('<pattern>', 'the text to search for')
    .action((pattern: string) => {
      const hits = grep(pattern, loadCorpus(process.cwd()));
      if (hits.length === 0) {
        process.stdout.write(`corpus grep: no matches for "${pattern}"\n`);
        process.exit(0);
      }
      for (const h of hits) process.stdout.write(`${h.id}:${h.line}: ${h.context} (${h.filePath})\n`);
      process.exit(0);
    });
}
