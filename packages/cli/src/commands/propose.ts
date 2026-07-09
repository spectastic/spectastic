import type { Command } from 'commander';

export function registerPropose(program: Command): void {
  program
    .command('propose')
    .description('Author a change proposal against an existing spec.')
    .argument('<spec-id>')
    .argument('<description>', 'one-line change description')
    .option('--adversarial', 'force adversarial pass on (overrides heuristic)')
    .option('--no-adversarial', 'force adversarial pass off')
    .option('--decider <role>', 'adversarial checkpoint decider: human | agent | panel (spec 033)')
    .option('--effort <level>', 'panel depth: low | medium | high | xhigh | max (spec 033)')
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(
      async (
        specId: string,
        description: string,
        opts: {
          adversarial?: boolean;
          decider?: 'human' | 'agent' | 'panel';
          effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
          commit?: boolean;
        },
      ) => {
        const [{ proposeCommand }, { createAIProvider }, { nodeFs }, { gateOnQuarantine }, fs, path] =
          await Promise.all([
            import('@spectastic/core/commands/propose'),
            import('../ai-factory.js'),
            import('@spectastic/core/providers/node-fs'),
            import('../state-gate.js'),
            import('node:fs/promises'),
            import('node:path'),
          ]);

        // Anti-ship guard (022-explore, FR-006): refuse to advance a quarantined
        // exploration — before constructing the AI provider, so the refusal is
        // reachable without an API key.
        const quarantine = await gateOnQuarantine(fs, process.cwd(), specId);
        if (quarantine) {
          process.stderr.write(`${quarantine.message}\n`);
          process.exit(2);
        }

        // Resolve the decider by precedence: per-run flag > project config
        // (spectastic.json) — the core applies the 'agent' checkpoint-default and
        // 'medium' effort fallback (spec 033 FR-002 / D-002).
        const { loadDeciderConfig } = await import('../config/decider.js');
        const projectDecider = loadDeciderConfig(process.cwd());
        const role = opts.decider ?? projectDecider.role;
        const effort = opts.effort ?? projectDecider.effort;
        if (opts.decider && !['human', 'agent', 'panel'].includes(opts.decider)) {
          process.stderr.write('propose: --decider must be human | agent | panel.\n');
          process.exit(2);
        }
        if (opts.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(opts.effort)) {
          process.stderr.write('propose: --effort must be low | medium | high | xhigh | max.\n');
          process.exit(2);
        }

        const ai = await createAIProvider();
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
            ...(role ? { decider: role } : {}),
            ...(effort ? { effort } : {}),
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

        // Opt-in git layer (spec 026): scoped to the parent spec; stage the change dir.
        const { commitVerbAndExit } = await import('../git/index.js');
        await commitVerbAndExit({
          verb: 'propose',
          model: ai.model, // Assisted-by (spec 027 FR-005)
          cwd: process.cwd(),
          specId,
          paths: [dir],
          subject: description,
          ...(opts.commit === undefined ? {} : { commit: opts.commit }),
        });
      },
    );
}
