import type { Command } from 'commander';

/**
 * Per FR-003 of specs/012-core-plan/spec.html (post P-6 cascade): auto-re-entry
 * gates on destination `<spec-status>` — Draft (or no existing plan) triggers
 * auto-re-entry / fresh authoring (no flag); past-Draft refuses with a pointer
 * to /spectastic.propose. `--force` bypasses with a warning.
 */
export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Generate plan.html for a spec; auto-re-enter Draft plans in place, refuse past-Draft.')
    .argument('<spec-id>')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(async (specId: string, opts: { force?: boolean; commit?: boolean }) => {
      const [
        { planCommand },
        { createAIProvider },
        { nodeFs },
        { gateOnDestinationState, gateOnQuarantine },
        fs,
        path,
      ] = await Promise.all([
        import('@spectastic/core/commands/plan'),
        import('../ai-factory.js'),
        import('@spectastic/core/providers/node-fs'),
        import('../state-gate.js'),
        import('node:fs/promises'),
        import('node:path'),
      ]);

      // Anti-ship guard (022-explore, FR-006): refuse to advance a quarantined
      // exploration. Fires before any read, since an exploration has no spec.html.
      const quarantine = await gateOnQuarantine(fs, process.cwd(), specId);
      if (quarantine) {
        process.stderr.write(`${quarantine.message}\n`);
        process.exit(2);
      }

      const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
      const planPath = path.resolve(process.cwd(), 'specs', specId, 'plan.html');
      const principlesPath = path.resolve(process.cwd(), 'principles.html');

      const specHtml = await fs.readFile(specPath, 'utf8');

      const decision = await gateOnDestinationState(fs, planPath, { force: opts.force });
      if (decision.kind === 'refuse') {
        process.stderr.write(
          `${planPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to sharpen. Amend via /spectastic.propose against the spec, or pass --force to bypass.\n`,
        );
        process.exit(2);
      }
      let existingPlan: string | undefined;
      if (decision.kind === 'edit-in-place') {
        existingPlan = decision.existing;
        const note =
          opts.force && decision.status !== null && decision.status !== 'draft'
            ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
            : `Auto-re-entering Draft ${planPath} in place per P-6.\n`;
        process.stderr.write(note);
      }

      let principlesHtml: string | undefined;
      try {
        principlesHtml = await fs.readFile(principlesPath, 'utf8');
      } catch {
        // optional
      }

      // Construct AI provider only after the gate decides to proceed — keeps the gate's
      // informative refuse/warn message reachable when ANTHROPIC_API_KEY is missing.
      const ai = await createAIProvider();

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

      // Opt-in git layer (spec 026): commit on the current branch (plan does not branch).
      const { commitVerbAndExit, slugOf } = await import('../git/index.js');
      await commitVerbAndExit({
        verb: 'plan',
        model: ai.model, // Assisted-by (spec 027 FR-005)
        cwd: process.cwd(),
        specId,
        paths: [planPath],
        subject: slugOf(specId),
        ...(opts.commit === undefined ? {} : { commit: opts.commit }),
      });
    });
}
