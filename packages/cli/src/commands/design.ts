import type { Command } from 'commander';

/**
 * Per FR-003 of specs/012-core-plan/spec.html (post P-6 cascade): auto-re-entry
 * gates on destination `<spec-status>` — Draft (or no existing design) triggers
 * auto-re-entry / fresh authoring (no flag); past-Draft refuses with a pointer
 * to /spectastic.propose. `--force` bypasses with a warning.
 */
export function registerDesign(program: Command): void {
  program
    .command('design')
    .description('Generate design.html for a spec; auto-re-enter Draft designs in place, refuse past-Draft.')
    .argument('<spec-id>')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .option(
      '--visuals <export>',
      'land a design export in this same run — import, render and materialise its embedded view, all three by delegation',
    )
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(async (specId: string, opts: { force?: boolean; visuals?: string; commit?: boolean }) => {
      const [
        { designCommand },
        { createAIProvider },
        { nodeFs },
        { gateOnDestinationState, gateOnQuarantine },
        fs,
        path,
      ] = await Promise.all([
        import('@spectastic/core/commands/design'),
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
      const designPath = path.resolve(process.cwd(), 'specs', specId, 'design.html');
      const principlesPath = path.resolve(process.cwd(), 'principles.html');

      const specHtml = await fs.readFile(specPath, 'utf8');

      const decision = await gateOnDestinationState(fs, designPath, {
        force: opts.force,
      });
      if (decision.kind === 'refuse') {
        process.stderr.write(
          `${designPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to sharpen. Amend via /spectastic.propose against the spec, or pass --force to bypass.\n`,
        );
        process.exit(2);
      }
      let existingDesign: string | undefined;
      if (decision.kind === 'edit-in-place') {
        existingDesign = decision.existing;
        const note =
          opts.force && decision.status !== null && decision.status !== 'draft'
            ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
            : `Auto-re-entering Draft ${designPath} in place per P-6.\n`;
        process.stderr.write(note);
      }

      let principlesHtml: string | undefined;
      try {
        principlesHtml = await fs.readFile(principlesPath, 'utf8');
      } catch {
        // optional
      }

      // --visuals preflight (110-visual-one-step, T-210 / FR-003 / NFR-001):
      // before the model call, which is the expensive one. A bad export path
      // must cost a second, not a design generation — checked here, before
      // createAIProvider is even constructed, so a refusal never reaches the
      // "no AI provider" message either.
      if (opts.visuals !== undefined) {
        const { checkVisualsExport } = await import('@spectastic/core/visual/one-step');
        try {
          await checkVisualsExport(opts.visuals, { cwd: process.cwd(), fs: nodeFs });
        } catch (err) {
          process.stderr.write(`${(err as Error).message}\n`);
          process.exit(2);
        }
      }

      // Construct AI provider only after the gate decides to proceed — keeps the gate's
      // informative refuse/warn message reachable when ANTHROPIC_API_KEY is missing.
      const ai = await createAIProvider({ verb: 'design' });

      const result = await designCommand(
        {
          specId,
          specHtml,
          ...(existingDesign ? { existingDesign } : {}),
          ...(principlesHtml ? { principlesHtml } : {}),
        },
        { cwd: process.cwd(), fs: nodeFs, ai },
      );

      if (result.estimabilityBlockers.length > 0) {
        process.stderr.write(
          `design refused — estimability blockers in ${specId}:\n  - ${result.estimabilityBlockers.join('\n  - ')}\n`,
        );
        process.exit(2);
      }
      await fs.writeFile(designPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${designPath} (${result.decisionsCount} ADRs; principles: ${result.principlesCheck.ok} OK / ${result.principlesCheck.exceptions} exc).\n`,
      );
      const { showCorpusHintOnce } = await import('../knowledge/corpus-hint-marker.js');
      await showCorpusHintOnce(process.cwd(), result.corpusHint);

      // --visuals (110-visual-one-step, T-112): AFTER the design generation
      // has already succeeded. The export was already confirmed readable
      // above, before the model call — this is the happy path, not the
      // preflight.
      const commitPaths = [designPath];
      if (opts.visuals !== undefined) {
        const { runOneStepVisuals } = await import('./visual.js');
        const report = await runOneStepVisuals({ specId, from: opts.visuals }, { cwd: process.cwd(), fs: nodeFs });
        for (const { step, outcome } of report) {
          process.stdout.write(
            outcome.kind === 'completed' ? `${step}: completed\n` : `${step}: not attempted — ${outcome.reason}\n`,
          );
        }
        // The whole sidecar, not an enumeration of every file import/render
        // may have written — `git add` stages a directory recursively (D-001
        // consequence: "the paths array is also where the visual artifacts
        // must be added, or they land uncommitted").
        commitPaths.push(path.resolve(process.cwd(), 'specs', specId, 'visual'));
      }

      // Opt-in git layer (spec 026): commit on the current branch (design does not branch).
      const { commitVerbAndExit, slugOf } = await import('../git/index.js');
      await commitVerbAndExit({
        verb: 'design',
        model: ai.model, // Assisted-by (spec 027 FR-005)
        cwd: process.cwd(),
        specId,
        paths: commitPaths,
        subject: slugOf(specId),
        ...(opts.commit === undefined ? {} : { commit: opts.commit }),
      });
    });
}
