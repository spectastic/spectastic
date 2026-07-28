import { resolve } from 'node:path';
import type { Command } from 'commander';
import { convertDocument, ConverterNotFoundError, ExecFileConverterRunner } from '../knowledge/convert.js';
import { resolveCorpusConfig } from '../config.js';

/**
 * The standalone binary's `convert` verb (065-corpus-pdf-convert, US1/US2, D-004) — a
 * thin dispatch over `convertDocument`. Mirrors the other curation verbs
 * (`cli/curate.ts`): parse args, resolve the corpus root, delegate, print, exit.
 *
 * The converter itself is never bundled (FR-003) — only a documented user
 * prerequisite, named in `--help` and in the missing-binary hint.
 */
export function registerConvert(program: Command): void {
  program
    .command('convert')
    .description(
      'Convert a source document (PDF and other formats the chosen converter supports) into a cited corpus document, via a user-installed converter (MarkItDown by default). No converter is bundled — see --converter.',
    )
    .argument('<file>', 'the source file to convert')
    .option('--pack <name>', 'the pack name under knowledge/ to file the result into (required unless --no-adapt)')
    .option('--converter <name>', 'which converter to invoke: markitdown (default), docling, or marker')
    .option('--no-adapt', 'emit the converted markdown without filing it into any pack')
    .option('--out <path>', 'with --no-adapt, write the markdown here instead of stdout')
    .option('--timeout <seconds>', 'override the default 120s child-process timeout')
    .addHelpText(
      'after',
      '\nEach converter is a separate install this tool never bundles:\n' +
        '  markitdown  pip install markitdown   (default)\n' +
        '  docling     pip install docling\n' +
        '  marker      pip install marker-pdf\n',
    )
    .action(async (file: string, opts: { pack?: string; converter?: string; adapt: boolean; out?: string; timeout?: string }) => {
      const sourceFile = resolve(process.cwd(), file);
      const timeoutMs = opts.timeout ? Number(opts.timeout) * 1000 : undefined;
      const runner = new ExecFileConverterRunner();

      try {
        if (!opts.adapt) {
          const result = await convertDocument({
            sourceFile,
            runner,
            ...(opts.converter !== undefined ? { converter: opts.converter } : {}),
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
            noAdapt: true,
            ...(opts.out !== undefined ? { out: resolve(process.cwd(), opts.out) } : {}),
          });
          if (result.markdown !== undefined) process.stdout.write(result.markdown);
          else process.stdout.write(`corpus convert: wrote ${opts.out}\n`);
          process.exit(0);
        }

        if (!opts.pack) {
          process.stderr.write('corpus convert: --pack is required unless --no-adapt is given\n');
          process.exit(2);
        }

        const { root } = resolveCorpusConfig(process.cwd());
        const knowledgeDir = resolve(process.cwd(), root);

        const result = await convertDocument({
          sourceFile,
          runner,
          knowledgeDir,
          pack: opts.pack,
          ...(opts.converter !== undefined ? { converter: opts.converter } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });

        process.stdout.write(`corpus convert: wrote ${result.id} (converter: ${result.converter}) → ${root}/${opts.pack}/\n`);
        process.stdout.write('  Newly-converted references are not-yet-spot-checked — review before citing.\n');
        process.exit(0);
      } catch (err) {
        if (err instanceof ConverterNotFoundError) {
          process.stderr.write(`corpus convert: ${err.message}\n`);
          process.exit(1);
        }
        process.stderr.write(`corpus convert failed: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
