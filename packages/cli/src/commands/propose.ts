import type { Command } from 'commander';

export function registerPropose(program: Command): void {
  program
    .command('propose')
    .description('Author a change proposal against an existing spec.')
    .argument('<spec-id>')
    .argument('<description>', 'one-line change description')
    .option('--adversarial', 'force adversarial pass on (overrides heuristic)')
    .option('--no-adversarial', 'force adversarial pass off')
    .action(
      async (
        specId: string,
        description: string,
        opts: { adversarial?: boolean },
      ) => {
        const [{ proposeCommand }, { ClaudeProvider }, { nodeFs }, fs, path] = await Promise.all([
          import('@spectastic/core/commands/propose'),
          import('@spectastic/core/providers/claude'),
          import('@spectastic/core/providers/node-fs'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

        const ai = new ClaudeProvider();
        const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
        const specHtml = await fs.readFile(specPath, 'utf8');

        const result = await proposeCommand(
          {
            specId,
            description,
            specHtml,
            ...(opts.adversarial === false
              ? { adversarial: false as const }
              : opts.adversarial === true
                ? { adversarial: true as const }
                : { adversarial: 'auto' as const }),
          },
          { cwd: process.cwd(), fs: nodeFs, ai },
        );

        const today = new Date().toISOString().slice(0, 10);
        const slug = `${today}-${description.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40)}`;
        const dir = path.resolve(process.cwd(), 'specs', specId, 'changes', slug);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'proposal.html'), result.html, 'utf8');
        process.stdout.write(
          `Wrote ${path.join(dir, 'proposal.html')} (${result.deltasCount} deltas${result.risks.length ? `; ${result.risks.length} risks identified` : ''}).\n`,
        );
        process.exit(0);
      },
    );
}
