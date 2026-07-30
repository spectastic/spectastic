import { basename, dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { Command } from 'commander';
import {
  adaptCorpus,
  installPack,
  migratePack,
  publishCorpus,
  registerDocument,
  NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
  NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
} from '../knowledge/index.js';
import { createPackFetcher } from '../pack-fetcher-factory.js';
import { resolveCorpusConfig } from '../config.js';

/**
 * The standalone binary's curation verbs (064-corpus-package-extraction, FR-004, US2) —
 * adapt/import/interview/source/publish. Mirrors @spectastic/cli's `corpus` command group
 * (packages/cli/src/commands/corpus.ts) action-for-action, including the pack-fetcher
 * selection (env-stub → --from local checkout → real fetcher), now that createPackFetcher
 * itself lives in corpus (it had zero CLI-specific dependencies once RealPackFetcher/
 * StubPackFetcher/PackFetcher all moved here — the same "shared floor" pattern as fence.ts
 * and config.ts).
 */
export function registerCurate(program: Command): void {
  program
    .command('adapt')
    .description('Adapt an existing corpus shape (a markdown folder, or an llms.txt) into the spectastic knowledge/ convention.')
    .argument('<path>', 'a folder of markdown files, or an llms.txt file')
    .option('--pack <name>', 'the pack name under knowledge/ (default: the source folder/parent-folder\'s name)')
    .action((path: string, opts: { pack?: string }) => {
      const target = resolve(process.cwd(), path);
      const isDir = statSync(target).isDirectory();
      const pack = opts.pack ?? basename(isDir ? target : dirname(target));
      const { marketplace, root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);

      const result = adaptCorpus({ target, knowledgeDir, pack, marketplace, corpusMarketplaceName: marketplace });

      process.stdout.write(
        `corpus adapt: ${result.written.length} written, ${result.skipped.length} already registered (untouched), ` +
          `${result.registryRows} registry row(s) → ${root}/${pack}/\n`,
      );
      if (result.written.length > 0) {
        process.stdout.write(
          '  Adaptation is lossy and its losses are silent — spot-check the newly-written documents ' +
            'against their sources before citing them, and fill in any TODO provenance field you can verify.\n',
        );
      }
      process.exit(0);
    });

  program
    .command('migrate')
    .description(
      'Migrate an existing single-layer pack (a document id: field + a pack-local index.md) to the two-layer convention (slug: + a root registry row) in place. Idempotent — safe to re-run, and a no-op on an already-migrated pack.',
    )
    .argument('<pack>', 'the pack name under knowledge/ to migrate')
    .action((pack: string) => {
      const { marketplace, root } = resolveCorpusConfig(process.cwd());
      const knowledgeDir = resolve(process.cwd(), root);

      const result = migratePack({ knowledgeDir, pack, marketplace, corpusMarketplaceName: marketplace });

      process.stdout.write(
        `corpus migrate: ${result.migrated.length} document(s) migrated, ${result.skipped.length} already two-layer ` +
          `(untouched) → ${root}/${pack}/\n`,
      );
      process.exit(0);
    });

  program
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

  program
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
      process.stdout.write('  Not citable until the expert signs off.\n');
      process.exit(0);
    });

  program
    .command('source')
    .description('Register a document fetched from an allowlisted authority as a corpus reference, pending confirmation.')
    .argument('<url>', 'the URL the text was fetched from')
    .requiredOption('--marketplace <name>', 'the project-local namespace this reference is filed under')
    .requiredOption('--plugin <name>', 'the pack this reference belongs to')
    .requiredOption('--slug <slug>', 'the pack-internal slug for this reference')
    .requiredOption('--title <title>', 'a short title for this reference')
    .requiredOption('--body <text>', 'the fetched text')
    .option('--date <date>', 'the retrieval date (YYYY-MM-DD)')
    .option('--allow <host>', 'an authority host to allow for this run')
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

        if (!host || !opts.allow || opts.allow !== host) {
          process.stderr.write(
            `corpus source refused: "${url}" is not on an authority allowlist. ` +
              'Pass --allow <host> to permit this run.\n',
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
        process.stdout.write('  Not citable until a human confirms the ingestion.\n');
        process.exit(0);
      },
    );

  program
    .command('publish')
    .description('Generate or refresh this corpus\'s marketplace.json from its root registry.')
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
}
