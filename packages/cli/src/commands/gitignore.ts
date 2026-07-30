import { detectEcosystems } from '@spectastic/core/enforce/detect';
import { applyGitignore } from '@spectastic/core/gitignore/apply';
import { BASE_ENTRIES, stackEntries } from '@spectastic/core/gitignore/entries';
import type { Command } from 'commander';

/**
 * `spectastic gitignore [path] [--stack]` — scaffold/merge the spectastic-managed
 * .gitignore block (spec 043). Base entries always; with --stack, also the
 * detected ecosystems' build-artifact ignores. The deterministic home for the
 * plan-phase stack append (D-005 / P-8) — the write is code, not plan prose.
 * Filesystem-only, no model.
 */
export function registerGitignore(program: Command): void {
  program
    .command('gitignore')
    .description(
      "Write/merge spectastic's managed .gitignore block (base ephemera; --stack also adds the detected stack's build-artifact ignores).",
    )
    .argument('[path]', 'project root', '.')
    .option('--stack', 'also append the detected ecosystem(s) build-artifact ignores')
    .action(async (path: string, opts: { stack?: boolean }) => {
      const entries = [...BASE_ENTRIES];
      let stacks: string[] = [];
      if (opts.stack) {
        stacks = [...detectEcosystems(path)];
        entries.push(...stackEntries(stacks));
      }
      const changed = await applyGitignore(path, entries);
      const detail = opts.stack
        ? ` (base + stack: ${stacks.length > 0 ? stacks.sort().join(', ') : 'none detected'})`
        : ' (base)';
      process.stdout.write(`gitignore: ${changed ? 'updated' : 'already current'} .gitignore${detail}\n`);
      process.exit(0);
    });
}
