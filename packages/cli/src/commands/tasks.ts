import type { Command } from 'commander';
import type { GraduationClass } from '@spectastic/core';

/**
 * Register the `tasks` subcommand. Reads spec.html + plan.html for the
 * named slice; calls @spectastic/core/commands/tasks; writes the result
 * to specs/<id>/tasks.html. Per FR-012 of specs/009-core-tasks/spec.html
 * (post P-6 cascade): destination state gates the write — Draft accepts
 * in-place edit; past-Draft refuses with a pointer to /spectastic.propose.
 *
 * Restore mode (spec 024-explore-restore): a graduated exploration's archived
 * marker carries the frozen classify. `--restore` forces restore-shaped tasks;
 * absent the flag, a detected marker prompts on a TTY and refuses when piped —
 * never a silent wrong shape (SC-001).
 */
export function registerTasks(program: Command): void {
  program
    .command('tasks')
    .description('Generate tasks.html for an existing spec slice; edit Draft in place, refuse past-Draft.')
    .argument('<spec-id>', 'spec ID, e.g. 001-auth-service')
    .option('--force', 'bypass the past-Draft refuse with a warning')
    .option(
      '--restore',
      'generate path-appropriate restore tasks for a graduated exploration; else a graduated marker prompts (TTY) or refuses (piped)',
    )
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(async (specId: string, opts: { force?: boolean; restore?: boolean; commit?: boolean }) => {
      const [
        { tasksCommand },
        { readArchivedClassify },
        { createAIProvider },
        { nodeFs },
        { gateOnDestinationState, gateOnQuarantine },
        fs,
        path,
      ] = await Promise.all([
        import('@spectastic/core/commands/tasks'),
        import('@spectastic/core/commands/restore-marker'),
        import('../ai-factory.js'),
        import('@spectastic/core/providers/node-fs'),
        import('../state-gate.js'),
        import('node:fs/promises'),
        import('node:path'),
      ]);

      // Anti-ship guard (022-explore, FR-006): refuse to advance a quarantined exploration.
      const quarantine = await gateOnQuarantine(fs, process.cwd(), specId);
      if (quarantine) {
        process.stderr.write(`${quarantine.message}\n`);
        process.exit(2);
      }

      const specPath = path.resolve(process.cwd(), 'specs', specId, 'spec.html');
      const planPath = path.resolve(process.cwd(), 'specs', specId, 'plan.html');
      const tasksPath = path.resolve(process.cwd(), 'specs', specId, 'tasks.html');

      const decision = await gateOnDestinationState(fs, tasksPath, { force: opts.force });
      if (decision.kind === 'refuse') {
        process.stderr.write(
          `${tasksPath} exists in <spec-status value="${decision.status}"> — past-Draft per P-6 of principles.html.\nRefusing to overwrite. Amend via /spectastic.propose against the parent spec, or pass --force to bypass.\n`,
        );
        process.exit(2);
      }
      if (decision.kind === 'edit-in-place') {
        const note =
          opts.force && decision.status !== null && decision.status !== 'draft'
            ? `warn: bypassing change-management surface (status was ${decision.status}); --force in effect.\n`
            : `Editing Draft ${tasksPath} in place per P-6.\n`;
        process.stderr.write(note);
      }

      // Restore-mode trigger (024-explore-restore, FR-001 / D-002): --restore forces,
      // a graduated marker prompts (TTY) or refuses (piped) — never a silent shape.
      const classify = await readArchivedClassify(nodeFs, process.cwd(), specId);
      const restore = await resolveRestoreMode(specId, classify, opts.restore === true);

      const ai = await createAIProvider({ verb: 'tasks' });
      const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

      const result = await tasksCommand(
        { specPath, planPath, ...(restore ? { restore } : {}) },
        ctx,
      );
      await fs.writeFile(tasksPath, result.html, 'utf8');
      const suffix = restore ? `, ${restore.classification} restore` : '';
      process.stdout.write(
        `Wrote ${tasksPath} (${result.totalTasks} tasks, ${result.parallelTasks} parallel${suffix}).\n`,
      );

      // Opt-in git layer (spec 026): commit on the current branch (tasks does not branch).
      const { commitVerbAndExit, slugOf } = await import('../git/index.js');
      await commitVerbAndExit({
        verb: 'tasks',
        model: ai.model, // Assisted-by (spec 027 FR-005)
        cwd: process.cwd(),
        specId,
        paths: [tasksPath],
        subject: slugOf(specId),
        ...(opts.commit === undefined ? {} : { commit: opts.commit }),
      });
    });
}

const archiveOf = (id: string): string => `explorations/archive/${id}`;

type RestoreMode = { classification: GraduationClass; sourceArchive: string } | undefined;

/**
 * Resolve restore mode from the archived classify + the --restore flag (FR-001 /
 * D-002 / SC-001). `--restore` forces it (and refuses if the id never graduated);
 * absent the flag, a graduated marker triggers the announced TTY prompt and a
 * refuse-with-hint when piped/CI — never a silent wrong shape. Exits the process
 * on a refusal, exactly as the surrounding gates do.
 */
async function resolveRestoreMode(
  specId: string,
  classify: GraduationClass | null,
  forced: boolean,
): Promise<RestoreMode> {
  if (forced) {
    if (!classify) {
      process.stderr.write(
        `tasks --restore: ${specId} is not a graduated exploration (no ${archiveOf(specId)}/quarantine.json). Nothing to restore.\n`,
      );
      process.exit(2);
    }
    return { classification: classify, sourceArchive: archiveOf(specId) };
  }
  if (!classify) return undefined;
  if (process.stdin.isTTY) {
    return (await promptRestore(specId, classify))
      ? { classification: classify, sourceArchive: archiveOf(specId) }
      : undefined;
  }
  const kind = classify === 'tracer-bullet' ? 'refactor-to-comply' : 'clean-rebuild';
  process.stderr.write(
    `tasks: ${specId} graduated as ${classify} — pass --restore to generate ${kind} restore tasks (or run in a terminal to choose). Refusing to guess the task shape.\n`,
  );
  process.exit(2);
}

/**
 * The announced restore-vs-normal prompt (TTY only — the caller guards on
 * `process.stdin.isTTY`). Mirrors the `confirmStdin` readline pattern in
 * implement.ts; defaults to restore on an empty answer.
 */
async function promptRestore(specId: string, classify: GraduationClass): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const kind = classify === 'tracer-bullet' ? 'refactor-to-comply' : 'clean-rebuild';
  return new Promise((resolve) => {
    rl.question(
      `${specId} graduated as ${classify}. Generate ${kind} restore tasks, or a normal breakdown? [R/n] `,
      (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        resolve(a === '' || a === 'r' || a === 'restore' || a === 'y' || a === 'yes');
      },
    );
  });
}
