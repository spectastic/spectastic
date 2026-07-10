import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `explore` subcommand (spec 022-explore, front half). Resolves the
 * next `NNN-kebab` id, reads `templates/explore.html`, and writes the two
 * artifacts under `explorations/<id>/`: the git-ignored `explore.html` ledger and
 * the tracked `quarantine.json` marker (D-002 / FR-002,003,004).
 *
 * The deterministic engine lives in `@spectastic/core/commands/explore`; this is
 * the thin wrapper (plan D-001). It does not touch the core eight verbs (FR-001).
 * `explore` needs no AIProvider — scaffolding is pure (the verify pattern).
 */
export function registerExplore(program: Command): void {
  program
    .command('explore')
    .description(
      'Scaffold a quarantined exploration under explorations/<id>/ (a git-ignored ledger + a tracked quarantine marker) to build loosely. Graduate or delete — nothing ships un-graduated.',
    )
    .argument('[intent]', 'a one-line description of what you want to find out (scaffold mode)')
    .option(
      '--graduate <id>',
      'graduate an existing quarantined exploration into a spec instead of scaffolding (spec 023)',
    )
    .option('--classify <kind>', 'spike | tracer-bullet (required with --graduate)')
    .action(async (intent: string | undefined, opts: { graduate?: string; classify?: string }) => {
      // Mode select: exactly one of <intent> (scaffold) or --graduate <id>.
      if (opts.graduate) {
        if (intent) {
          process.stderr.write('explore: pass either <intent> (scaffold) or --graduate <id>, not both.\n');
          process.exit(2);
        }
        await runGraduate(opts.graduate, opts.classify);
        return;
      }
      if (!intent) {
        process.stderr.write('explore: needs an <intent> to scaffold, or --graduate <id> to graduate one.\n');
        process.exit(2);
      }

      const { exploreScaffold } = await import('@spectastic/core/commands/explore');

      const cwd = process.cwd();
      const id = await resolveNextId(cwd, intent);

      const templatePath = resolve(cwd, 'templates', 'explore.html');
      let template: string;
      try {
        template = await readFile(templatePath, 'utf8');
      } catch {
        process.stderr.write(
          `explore: cannot read ${templatePath} — the thin-floor ledger template is required.\n`,
        );
        process.exit(2);
      }

      const created = new Date().toISOString().slice(0, 10);
      const result = exploreScaffold({ id, intent, created, template });

      const dir = join(cwd, 'explorations', id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'explore.html'), result.ledgerHtml, 'utf8');
      await writeFile(
        join(dir, 'quarantine.json'),
        `${JSON.stringify(result.marker, null, 2)}\n`,
        'utf8',
      );

      process.stdout.write(
        `Wrote explorations/${id}/explore.html (git-ignored ledger) + quarantine.json (tracked marker).\n` +
          `Build loosely inside explorations/${id}/. Quarantined — \`spectastic validate\` will error until you graduate or delete it.\n`,
      );
      process.exit(0);
    });
}

const ID_PREFIX = /^(\d{3})-/;

/**
 * Resolve the next `NNN-kebab` id. Explorations share the numbering scheme with
 * specs (so graduation can reuse the id), so scan BOTH `specs/` and
 * `explorations/` for the highest `NNN` and increment.
 */
async function resolveNextId(cwd: string, intent: string): Promise<string> {
  const highest = Math.max(
    0,
    ...(await Promise.all([
      highestNumberIn(join(cwd, 'specs')),
      highestNumberIn(join(cwd, 'explorations')),
    ])),
  );
  const num = String(highest + 1).padStart(3, '0');
  return `${num}-${slugify(intent)}`;
}

/** The highest `NNN` prefix among the directories under `dir`, or 0 if none. */
async function highestNumberIn(dir: string): Promise<number> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let max = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = ID_PREFIX.exec(e.name);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Kebab-case slug from the intent: lowercased, alnum-only, ≤6 words. */
function slugify(intent: string): string {
  const slug = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
  return slug || 'exploration';
}

/**
 * Graduate mode (spec 023-explore-graduation): read the exploration ledger,
 * AI-extract a Draft spec + plan, then run the deterministic transaction (write
 * bundle, lift quarantine, archive). The CLI path uses the AIProvider factory;
 * the slash-command path orchestrates the same legs in-host (keyless).
 */
async function runGraduate(id: string, classify: string | undefined): Promise<void> {
  if (classify !== 'spike' && classify !== 'tracer-bullet') {
    process.stderr.write('explore --graduate requires --classify <spike|tracer-bullet>.\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  let ledger: string;
  try {
    ledger = await readFile(join(cwd, 'explorations', id, 'explore.html'), 'utf8');
  } catch {
    process.stderr.write(`explore --graduate ${id}: no explorations/${id}/explore.html ledger found.\n`);
    process.exit(2);
  }
  try {
    const [{ graduateExtract, graduateTransaction }, { nodeFs }, { createAIProvider }] = await Promise.all([
      import('@spectastic/core/commands/graduate'),
      import('@spectastic/core/providers/node-fs'),
      import('../ai-factory.js'),
    ]);
    const ai = await createAIProvider({ verb: 'explore' });
    const extract = await graduateExtract({ specId: id, classification: classify, ledger }, { cwd, ai });
    const date = new Date().toISOString().slice(0, 10);
    const result = await graduateTransaction(
      { specId: id, classification: classify, extract, date },
      { cwd, fs: nodeFs },
    );
    process.stdout.write(
      `Graduated ${id} (${classify}) → ${result.specPath}\n` +
        `  exploration archived → ${result.archivedPath} (frozen)\n` +
        `  Next: review the Draft spec + plan, then /spectastic.tasks. Restore-scaffold: TBD-explore-restore.\n`,
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`explore --graduate ${id}: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
