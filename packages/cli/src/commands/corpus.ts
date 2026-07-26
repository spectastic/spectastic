import { basename, dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { Command } from 'commander';
import { adaptCorpus } from '@spectastic/core/knowledge';

/**
 * The `corpus` subcommand group (056-corpus-adapter, plan D-001) — the CLI's
 * first subcommand group, contained entirely to this registrar. `adapt`
 * turns an existing corpus shape (a markdown folder, or an `llms.txt`) into
 * 051's frontmatter + index convention.
 *
 * Filesystem-only, deterministic, no model (mirrors `gitignore`'s command
 * shape) — the adapter is core, this is the thin dispatch (D-001).
 */
export function registerCorpus(program: Command): void {
  const corpus = program.command('corpus').description('Commands for the knowledge/ corpus family.');

  corpus
    .command('adapt')
    .description('Adapt an existing corpus shape (a markdown folder, or an llms.txt) into the spectastic knowledge/ convention.')
    .argument('<path>', 'a folder of markdown files, or an llms.txt file')
    .option('--pack <name>', 'the pack name under knowledge/ (default: the source folder/parent-folder\'s name)')
    .action(async (path: string, opts: { pack?: string }) => {
      const target = resolve(process.cwd(), path);
      const isDir = statSync(target).isDirectory();
      const pack = opts.pack ?? basename(isDir ? target : dirname(target));
      const knowledgeDir = resolve(process.cwd(), 'knowledge');

      const result = adaptCorpus({ target, knowledgeDir, pack });

      process.stdout.write(
        `corpus adapt: ${result.written.length} written, ${result.skipped.length} already adapted (untouched), ` +
          `${result.indexRows} index row(s) → knowledge/${pack}/\n`,
      );
      if (result.written.length > 0) {
        process.stdout.write(
          '  Adaptation is lossy and its losses are silent — spot-check the newly-written documents ' +
            'against their sources before citing them, and fill in any TODO provenance field you can verify.\n',
        );
      }
      process.exit(0);
    });
}
