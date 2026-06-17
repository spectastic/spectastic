import type { Command } from 'commander';

/**
 * Per FR-003 of specs/011-core-spec/spec.html (post P-6 cascade): the
 * destination's `<spec-status>` is the gate, not the argument shape.
 * Both invocation forms (description-string or existing spec-id) honour:
 * fresh path / Draft destination → write or sharpen in place; past-Draft
 * destination → refuse with pointer to /spectastic.propose. `--force`
 * bypasses with a warning. Argument shape remains a prompt-construction
 * hint (Sharpen-vs-Author) but no longer gates overwriting.
 */
export function registerSpec(program: Command): void {
  program
    .command('spec')
    .description('Author a fresh spec.html or sharpen a Draft one in place; past-Draft destinations refuse.')
    .argument('<description>', 'feature description or spec ID for re-entry')
    .option('--reentry <spec-id>', 'sharpen the existing spec at this ID (hints Sharpen-vs-Author phrasing)')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .action(async (description: string, opts: { reentry?: string; force?: boolean }) => {
      const [{ specCommand }, { createAIProvider }, { nodeFs }, { gateOnDestinationState }, fs, path] =
        await Promise.all([
          import('@spectastic/core/commands/spec'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('../state-gate.js'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

      // If --reentry given, resolve to its known path; otherwise the kernel decides the ID.
      const reentryPath = opts.reentry
        ? path.resolve(process.cwd(), 'specs', opts.reentry, 'spec.html')
        : null;

      let existingSpec: string | undefined;
      if (reentryPath) {
        const decision = await gateOnDestinationState(fs, reentryPath, { force: opts.force });
        if (decision.kind === 'refuse') {
          process.stderr.write(
            `${reentryPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to sharpen. Amend via /spectastic.propose against the spec, or pass --force to bypass.\n`,
          );
          process.exit(2);
        }
        if (decision.kind === 'edit-in-place') {
          existingSpec = decision.existing;
          const note =
            opts.force && decision.status !== null && decision.status !== 'draft'
              ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
              : `Sharpening Draft ${reentryPath} in place per P-6.\n`;
          process.stderr.write(note);
        }
      }

      // Construct AI provider only after the gate decides to proceed — keeps the gate's
      // informative refuse/warn message reachable when ANTHROPIC_API_KEY is missing.
      const ai = await createAIProvider();

      const input = {
        description,
        ...(opts.reentry ? { specId: opts.reentry } : {}),
        ...(existingSpec ? { existingSpec } : {}),
      };
      const result = await specCommand(input, { cwd: process.cwd(), fs: nodeFs, ai });
      const outPath = path.resolve(process.cwd(), 'specs', result.specId, 'spec.html');

      // Fresh-authoring path: gate the resolved output too, in case the kernel
      // chose a spec ID that collides with an existing past-Draft artifact.
      if (!reentryPath) {
        const decision = await gateOnDestinationState(fs, outPath, { force: opts.force });
        if (decision.kind === 'refuse') {
          process.stderr.write(
            `${outPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to overwrite. Pick a different spec ID, amend via /spectastic.propose, or pass --force.\n`,
          );
          process.exit(2);
        }
        if (decision.kind === 'edit-in-place' && decision.status === 'draft') {
          process.stderr.write(`Overwriting Draft ${outPath} in place per P-6.\n`);
        }
      }

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, result.html, 'utf8');
      process.stdout.write(
        `Wrote ${outPath} (${result.requirementsCount} reqs${result.warnings.length ? `; ${result.warnings.length} warning(s)` : ''}).\n`,
      );
      for (const w of result.warnings) process.stderr.write(`  warn: ${w}\n`);
      process.exit(0);
    });
}
