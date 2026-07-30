import { join } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `order` subcommand (spec 028-dependency-ordering). Reads the spec
 * corpus, infers the reciprocity DAG, and emits the dependency-respecting,
 * value-ranked order two ways (FR-007): the ordered ids on stdout and a
 * self-contained roadmap.html on disk.
 *
 * Deterministic — like `verify`, no AIProvider, so it runs in CI with no key.
 * A precedence cycle exits non-zero with the named loop (FR-005).
 */
export function registerOrder(program: Command): void {
  program
    .command('order')
    .description(
      'Order the spec corpus by dependency-respecting value: print the ordered spec ids and write a roadmap.html view. Deterministic, no AI.',
    )
    .option('-o, --out <path>', 'where to write the roadmap view (relative to cwd)', 'roadmap.html')
    .option('--json', 'print the ordered ids as a JSON array instead of newline-delimited')
    .action(async (opts: { out: string; json?: boolean }) => {
      const [{ orderCommand }, { nodeFs }, fsp] = await Promise.all([
        import('@spectastic/core/commands/order'),
        import('@spectastic/core/providers/node-fs'),
        import('node:fs/promises'),
      ]);

      const cwd = process.cwd();
      // Asset links resolve relative to the output file's directory.
      const depth = opts.out.split('/').length - 1;
      const assetsPrefix = depth > 0 ? `${'../'.repeat(depth)}assets` : './assets';

      try {
        const result = await orderCommand({ assetsPrefix }, { cwd, fs: nodeFs });
        await fsp.writeFile(join(cwd, opts.out), result.html, 'utf8');
        process.stdout.write(opts.json ? `${JSON.stringify(result.ids)}\n` : `${result.ids.join('\n')}\n`);
        process.stderr.write(`Wrote ${opts.out}\n`);
        process.exit(0);
      } catch (err) {
        if (err instanceof Error && err.name === 'CycleError') {
          process.stderr.write(`order: ${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });
}
