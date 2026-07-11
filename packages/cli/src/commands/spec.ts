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
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .option('--split', 'run the value-ranked slicer: append a <spec-split> proposal to an over-budget Draft spec')
    .action(async (description: string, opts: { reentry?: string; force?: boolean; commit?: boolean; split?: boolean }) => {
      const [
        { specCommand },
        { createAIProvider },
        { nodeFs },
        { gateOnDestinationState, gateOnQuarantine },
        { commitForVerb, reportGitOutcome, effectiveAuto, parseCommitOverride },
        { loadGitConfig },
        { resolveNextSpecId },
        { gitRunner },
        fs,
        path,
      ] = await Promise.all([
          import('@spectastic/core/commands/spec'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('../state-gate.js'),
          import('../git/index.js'),
          import('../git/config.js'),
          import('../git/allocate.js'),
          import('../git/run.js'),
          import('node:fs/promises'),
          import('node:path'),
        ]);

      // The per-invocation git override (FR-004): --commit → force, --no-commit → skip.
      const gitOverride = parseCommitOverride(opts.commit);

      const cwd = process.cwd();

      // Split-mode (spec 029, FR-001): append a <spec-split> proposal to a Draft parent.
      if (opts.split) {
        await handleSplitMode(opts.reentry ?? description, opts, cwd);
      }

      // If --reentry given, resolve to its known path; otherwise the kernel decides the ID.
      const reentryPath = opts.reentry
        ? path.resolve(cwd, 'specs', opts.reentry, 'spec.html')
        : null;

      // Branch reservation (FR-006/D-004): under branch+commit, fresh authoring
      // allocates an origin-aware NNN so the new NNN-slug branch is the claim.
      const gitAuto = effectiveAuto(loadGitConfig(cwd).auto, gitOverride);
      let allocatedId: string | undefined;
      if (!reentryPath && gitAuto === 'branch+commit') {
        allocatedId = await resolveNextSpecId(cwd, description, { runner: gitRunner(cwd) });
      }

      let existingSpec: string | undefined;
      if (reentryPath && opts.reentry) {
        // Anti-ship guard (022-explore, FR-006): refuse to sharpen a quarantined
        // exploration's id. (Fresh authoring picks a new id, so there is nothing
        // to gate there.)
        const quarantine = await gateOnQuarantine(fs, process.cwd(), opts.reentry);
        if (quarantine) {
          process.stderr.write(`${quarantine.message}\n`);
          process.exit(2);
        }
      }
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
      const ai = await createAIProvider({ verb: 'spec' });

      const specIdInput = opts.reentry ?? allocatedId;
      const input = {
        description,
        ...(specIdInput ? { specId: specIdInput } : {}),
        ...(existingSpec ? { existingSpec } : {}),
      };
      const result = await specCommand(input, { cwd, fs: nodeFs, ai });
      const outPath = path.resolve(cwd, 'specs', result.specId, 'spec.html');

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

      // Opt-in git layer (spec 026): branch + commit the artifact when git.auto is on.
      const outcome = await commitForVerb({
        verb: 'spec',
        model: ai.model, // Assisted-by (spec 027 FR-005)
        cwd,
        specId: result.specId,
        paths: [outPath],
        subject: description,
        newSlice: !reentryPath,
        ...(gitOverride ? { override: gitOverride } : {}),
      });
      process.exit(reportGitOutcome(outcome));
    });
}

/**
 * Split-mode handler (spec 029, FR-001): read the parent, enforce the Draft-only
 * P-6 guard (FR-008), run the slicer through `specCommand`, write the appended
 * proposal back, and commit. Always exits the process.
 */
async function handleSplitMode(
  splitSpecId: string,
  opts: { force?: boolean; commit?: boolean },
  cwd: string,
): Promise<never> {
  const [
    { specCommand },
    { createAIProvider },
    { nodeFs },
    { extractSpecStatus },
    { commitForVerb, reportGitOutcome, parseCommitOverride },
    fs,
    path,
  ] = await Promise.all([
    import('@spectastic/core/commands/spec'),
    import('../ai-factory.js'),
    import('@spectastic/core/providers/node-fs'),
    import('@spectastic/schema'),
    import('../git/index.js'),
    import('node:fs/promises'),
    import('node:path'),
  ]);

  const parentPath = path.resolve(cwd, 'specs', splitSpecId, 'spec.html');
  let parentHtml: string;
  try {
    parentHtml = await fs.readFile(parentPath, 'utf8');
  } catch {
    process.stderr.write(`spec --split: no spec found at ${parentPath}\n`);
    process.exit(2);
  }

  const status = extractSpecStatus(parentHtml);
  if (status !== 'draft' && !opts.force) {
    process.stderr.write(
      `${parentPath} is <spec-status value="${status ?? 'unknown'}"> — past-Draft per P-6. The slicer appends only to a Draft parent; author the split via /spectastic.propose, or pass --force.\n`,
    );
    process.exit(2);
  }

  const ai = await createAIProvider({ verb: 'spec' });
  const result = await specCommand(
    { description: splitSpecId, specId: splitSpecId, existingSpec: parentHtml, split: true },
    { cwd, fs: nodeFs, ai },
  );
  await fs.writeFile(parentPath, result.html, 'utf8');

  const warnSuffix = result.warnings.length > 0 ? `; ${result.warnings.length} warning(s)` : '';
  process.stdout.write(
    `Appended <spec-split> to specs/${splitSpecId}/spec.html (${result.requirementsCount} candidate children${warnSuffix}).\n`,
  );
  for (const w of result.warnings) process.stderr.write(`  warn: ${w}\n`);

  const override = parseCommitOverride(opts.commit);
  const outcome = await commitForVerb({
    verb: 'spec',
    model: ai.model,
    cwd,
    specId: splitSpecId,
    paths: [parentPath],
    subject: `append split proposal to ${splitSpecId}`,
    newSlice: false,
    ...(override ? { override } : {}),
  });
  process.exit(reportGitOutcome(outcome));
}
