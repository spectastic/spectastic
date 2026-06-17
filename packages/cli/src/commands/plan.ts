import type { Command } from 'commander';

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Generate plan.html for an existing spec slice.')
    .argument('<spec-id>')
    .action(async (specId: string) => {
      const [{ planCommand }, { ClaudeProvider }, { nodeFs }, fs, path] = await Promise.all([
        import('@spectastic/core/commands/plan'),
        import('@spectastic/core/providers/claude'),
        import('@spectastic/core/providers/node-fs'),
        import('node:fs/promises'),
        import('node:path'),
      ]);

      const ai = new ClaudeProvider();
      const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
      const planPath = path.resolve(process.cwd(), 'specs', specId, 'plan.html');
      const principlesPath = path.resolve(process.cwd(), 'principles.html');

      const specHtml = await fs.readFile(specPath, 'utf8');
      let existingPlan: string | undefined;
      try {
        existingPlan = await fs.readFile(planPath, 'utf8');
      } catch {
        // fresh
      }
      let principlesHtml: string | undefined;
      try {
        principlesHtml = await fs.readFile(principlesPath, 'utf8');
      } catch {
        // optional
      }

      const result = await planCommand(
        {
          specId,
          specHtml,
          ...(existingPlan ? { existingPlan } : {}),
          ...(principlesHtml ? { principlesHtml } : {}),
        },
        { cwd: process.cwd(), fs: nodeFs, ai },
      );

      if (result.estimabilityBlockers.length > 0) {
        process.stderr.write(
          `plan refused — estimability blockers in ${specId}:\n  - ${result.estimabilityBlockers.join('\n  - ')}\n`,
        );
        process.exit(2);
      }
      await fs.writeFile(planPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${planPath} (${result.decisionsCount} ADRs; principles: ${result.principlesCheck.ok} OK / ${result.principlesCheck.exceptions} exc).\n`,
      );
      process.exit(0);
    });
}
