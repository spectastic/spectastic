import type { Command } from 'commander';

export function registerSpec(program: Command): void {
  program
    .command('spec')
    .description('Author a fresh spec.html (or re-enter an existing one).')
    .argument('<description>', 'feature description or spec ID for re-entry')
    .option('--reentry <spec-id>', 'sharpen the existing spec at this ID')
    .action(async (description: string, opts: { reentry?: string }) => {
      const [{ specCommand }, { ClaudeProvider }, { nodeFs }, fs, path] = await Promise.all([
        import('@spectastic/core/commands/spec'),
        import('@spectastic/core/providers/claude'),
        import('@spectastic/core/providers/node-fs'),
        import('node:fs/promises'),
        import('node:path'),
      ]);

      const ai = new ClaudeProvider();
      let existingSpec: string | undefined;
      let specId: string | undefined;
      if (opts.reentry) {
        specId = opts.reentry;
        existingSpec = await fs.readFile(
          path.resolve(process.cwd(), 'specs', specId, 'spec.html'),
          'utf8',
        );
      }
      const input = {
        description,
        ...(specId ? { specId } : {}),
        ...(existingSpec ? { existingSpec } : {}),
      };
      const result = await specCommand(input, { cwd: process.cwd(), fs: nodeFs, ai });
      const outPath = path.resolve(process.cwd(), 'specs', result.specId, 'spec.html');
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${outPath} (${result.requirementsCount} reqs${result.warnings.length ? `; ${result.warnings.length} warning(s)` : ''}).\n`,
      );
      for (const w of result.warnings) process.stderr.write(`  warn: ${w}\n`);
      process.exit(0);
    });
}
