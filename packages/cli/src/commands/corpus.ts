import { basename, dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { Command } from 'commander';
import {
  adaptCorpus,
  installPack,
  publishCorpus,
  registerDocument,
  NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
  NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
  resolveCorpusConfig,
  createPackFetcher,
  convertDocument,
  ConverterNotFoundError,
  ExecFileConverterRunner,
} from '@spectastic/corpus';

/**
 * The `corpus` subcommand group (056-corpus-adapter, plan D-001; extended by
 * 061-corpus-ingester, 063-corpus-discoverability). `adapt` turns an
 * existing corpus shape (a markdown folder, or an `llms.txt`) into the
 * frontmatter + index convention; `import` installs a marketplace skill and
 * registers it; `publish` generates/refreshes the corpus's own
 * `marketplace.json`.
 *
 * Every write door resolves its corpus root and marketplace identity from
 * `resolveCorpusConfig` (063 FR-001/FR-006) rather than a hardcoded
 * `'knowledge'` — so `corpus.root` is a real, honoured override, and
 * `installPack`/`registerDocument` are handed a `corpusMarketplaceName` that
 * keeps `marketplace.json` in sync on every write (FR-003).
 *
 * Filesystem-only, deterministic, no model (mirrors `gitignore`'s command
 * shape) — the adapter/ingester/publish logic is core, this is the thin dispatch.
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
      const { root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);

      const result = adaptCorpus({ target, knowledgeDir, pack });

      process.stdout.write(
        `corpus adapt: ${result.written.length} written, ${result.skipped.length} already adapted (untouched), ` +
          `${result.indexRows} index row(s) → ${root}/${pack}/\n`,
      );
      if (result.written.length > 0) {
        process.stdout.write(
          '  Adaptation is lossy and its losses are silent — spot-check the newly-written documents ' +
            'against their sources before citing them, and fill in any TODO provenance field you can verify.\n' +
            '  This writes the pack\'s own legacy index, not the root registry — the pack isn\'t discoverable ' +
            'via marketplace.json until it\'s also registered through `corpus import --from`.\n',
        );
      }
      process.exit(0);
    });

  corpus
    .command('import')
    .description('Install a marketplace skill (<plugin>@<marketplace>) and register its references in the root corpus registry.')
    .argument('<coordinate>', 'the plugin to install, as <plugin>@<marketplace>')
    .option('--from <path>', 'register an already-fetched local checkout instead of installing one')
    .action(async (coordinate: string, opts: { from?: string }) => {
      const fetcher = createPackFetcher(opts.from ? { from: opts.from } : {});
      const { marketplace, root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);

      try {
        const result = await installPack({ fetcher, coordinate, knowledgeDir, corpusMarketplaceName: marketplace });
        process.stdout.write(
          `corpus import: ${result.written.length} registered, ${result.skipped.length} already registered ` +
            `(untouched) → ${root}/${result.plugin}/\n`,
        );
        if (result.written.length > 0) {
          process.stdout.write(
            '  Newly-registered references are marked not-yet-spot-checked — review them before citing.\n',
          );
        }
        process.exit(0);
      } catch (err) {
        process.stderr.write(`corpus import failed: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  corpus
    .command('interview')
    .description('Register a subject-matter expert interview as a corpus reference, pending their sign-off.')
    .argument('<role>', 'the interviewed expert\'s role (e.g. settlement-desk-lead)')
    .requiredOption('--marketplace <name>', 'the project-local namespace this reference is filed under')
    .requiredOption('--plugin <name>', 'the pack this reference belongs to')
    .requiredOption('--slug <slug>', 'the pack-internal slug for this reference')
    .requiredOption('--title <title>', 'a short title for this reference')
    .requiredOption('--body <text>', 'the captured text')
    .option('--date <date>', 'the interview date (YYYY-MM-DD)')
    .action((role: string, opts: { marketplace: string; plugin: string; slug: string; title: string; body: string; date?: string }) => {
      const { marketplace: corpusMarketplaceName, root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);
      const origin = `interview: ${role}, ${opts.date ?? 'TODO'}`;

      const result = registerDocument({
        knowledgeDir,
        marketplace: opts.marketplace,
        plugin: opts.plugin,
        slug: opts.slug,
        title: opts.title,
        body: opts.body,
        origin,
        status: NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
        corpusMarketplaceName,
      });

      process.stdout.write(`corpus interview: registered ${result.id} → ${root}/${opts.plugin}/\n`);
      process.stdout.write(
        '  Not citable until the expert signs off. The interview discipline itself (running the ' +
          'elicitation) is deferred to TBD-corpus-interview — this only registers the captured text.\n',
      );
      process.exit(0);
    });

  corpus
    .command('source')
    .description('Register a document fetched from an allowlisted authority as a corpus reference, pending confirmation.')
    .argument('<url>', 'the URL the text was fetched from')
    .requiredOption('--marketplace <name>', 'the project-local namespace this reference is filed under')
    .requiredOption('--plugin <name>', 'the pack this reference belongs to')
    .requiredOption('--slug <slug>', 'the pack-internal slug for this reference')
    .requiredOption('--title <title>', 'a short title for this reference')
    .requiredOption('--body <text>', 'the fetched text')
    .option('--date <date>', 'the retrieval date (YYYY-MM-DD)')
    .option('--allow <host>', 'an authority host to allow for this run (the full allowlist is TBD-corpus-authority-allowlist)')
    .action(
      (
        url: string,
        opts: { marketplace: string; plugin: string; slug: string; title: string; body: string; date?: string; allow?: string },
      ) => {
        const host = (() => {
          try {
            return new URL(url).host;
          } catch {
            return null;
          }
        })();

        // Secure-by-default (FR-011): with no allowlist entry matching this
        // origin, refuse outright — never a silent pass. The full authority
        // allowlist is TBD-corpus-authority-allowlist; --allow is this
        // seam's one-shot, per-invocation stand-in for it.
        if (!host || !opts.allow || opts.allow !== host) {
          process.stderr.write(
            `corpus source refused: "${url}" is not on an authority allowlist. ` +
              'No allowlist is configured for this project — pass --allow <host> to permit this run, ' +
              'or wait for TBD-corpus-authority-allowlist.\n',
          );
          process.exit(1);
        }

        const { marketplace: corpusMarketplaceName, root } = resolveCorpusConfig(process.cwd());
        const knowledgeDir = resolve(process.cwd(), root);
        const origin = `${url}, fetched ${opts.date ?? 'TODO'}`;

        const result = registerDocument({
          knowledgeDir,
          marketplace: opts.marketplace,
          plugin: opts.plugin,
          slug: opts.slug,
          title: opts.title,
          body: opts.body,
          origin,
          status: NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
          corpusMarketplaceName,
        });

        process.stdout.write(`corpus source: registered ${result.id} → ${root}/${opts.plugin}/\n`);
        process.stdout.write(
          '  Not citable until a human confirms the ingestion. The fetch-and-draft mechanics and the ' +
            'real authority allowlist are deferred to TBD-corpus-sourcing / TBD-corpus-authority-allowlist ' +
            '— this only registers text already fetched by the caller.\n',
        );
        process.exit(0);
      },
    );

  corpus
    .command('publish')
    .description('Generate or refresh this corpus\'s marketplace.json from its root registry, so it\'s discoverable without a hand-written manifest.')
    .action(() => {
      const { marketplace, root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);

      const result = publishCorpus({ marketplaceName: marketplace, knowledgeDir });
      process.stdout.write(
        `corpus publish: ${result.alreadyExisted ? 'refreshed' : 'generated'} ${root}/marketplace.json ` +
          `(marketplace=${marketplace})\n`,
      );
      process.exit(0);
    });

  corpus
    .command('convert')
    .description(
      'Convert a source document (PDF and other formats the chosen converter supports) into a cited corpus document, via a user-installed converter (MarkItDown by default). No converter is bundled — see --converter.',
    )
    .argument('<file>', 'the source file to convert')
    .option('--pack <name>', 'the pack name under knowledge/ to file the result into (required unless --no-adapt)')
    .option('--converter <name>', 'which converter to invoke: markitdown (default), docling, or marker')
    .option('--no-adapt', 'emit the converted markdown without filing it into any pack')
    .option('--out <path>', 'with --no-adapt, write the markdown here instead of stdout')
    .option('--title <title>', 'set the registered document title (else derived from a heading or the filename)')
    .option('--description <text>', 'set the registered document description (else derived from the first paragraph)')
    .option('--timeout <seconds>', 'override the default 120s child-process timeout')
    .addHelpText(
      'after',
      '\nEach converter is a separate install this tool never bundles. These are CLI\n' +
        'apps — install them isolated with pipx or uv (bare `pip` is blocked on modern\n' +
        'macOS/Homebrew/nix by PEP 668):\n' +
        "  markitdown  pipx install 'markitdown[all]'   (default; [all] adds PDF support)\n" +
        '  docling     pipx install docling\n' +
        '  marker      pipx install marker-pdf\n' +
        '  (uv users: swap `pipx install` for `uv tool install`.)\n',
    )
    .action(async (file: string, opts: { pack?: string; converter?: string; adapt: boolean; out?: string; title?: string; description?: string; timeout?: string }) => {
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

        const { root, marketplace } = resolveCorpusConfig(process.cwd());
        const knowledgeDir = resolve(process.cwd(), root);

        const result = await convertDocument({
          sourceFile,
          runner,
          knowledgeDir,
          pack: opts.pack,
          marketplace,
          corpusMarketplaceName: marketplace,
          ...(opts.converter !== undefined ? { converter: opts.converter } : {}),
          ...(opts.title !== undefined ? { title: opts.title } : {}),
          ...(opts.description !== undefined ? { description: opts.description } : {}),
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
