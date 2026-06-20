import { join } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `course` subcommand (spec 019-explain-course). Reads an
 * agent-drafted course as JSON on stdin, runs the kernel's verification
 * (reference existence FR-003, blind guessability FR-004), and on a clean
 * draft assembles + writes course.html under .spectastic/courses/<date>-<slug>/
 * (git-ignored by default; --keep retains). On any per-item failure it reports
 * them and exits non-zero so the agent's regenerate-or-drop loop can react.
 *
 * Hybrid surface per plan D-001: the slash command (commands/spectastic.explain.md
 * --course) drafts and owns the loop; this is the deterministic, stub-testable
 * engine.
 */
export function registerCourse(program: Command): void {
  program
    .command('course')
    .description(
      'Verify + assemble a drafted course (JSON on stdin) and write it under .spectastic/courses/. Reports per-item failures for regeneration.',
    )
    .requiredOption('--target <target>', 'the repo-anchored target the course teaches')
    .option('--keep', 'retain (track) this course instead of git-ignoring it')
    .action(async (opts: { target: string; keep?: boolean }) => {
      const [{ courseCommand, CourseDraftError }, { createAIProvider }, { nodeFs }, fsp] =
        await Promise.all([
          import('@spectastic/core/commands/course'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('node:fs/promises'),
        ]);

      const raw = await readStdin();
      let draft: Record<string, unknown>;
      try {
        draft = JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        process.stderr.write(
          `course: stdin is not valid JSON — ${(err as Error).message}\n`,
        );
        process.exit(2);
      }
      if (typeof draft.target !== 'string' || draft.target.trim() === '') {
        draft.target = opts.target;
      }

      const cwd = process.cwd();
      const ai = await createAIProvider();
      const ctx = { cwd, fs: nodeFs, ai };

      let result;
      try {
        result = await courseCommand({ draft: draft as never }, ctx);
      } catch (err) {
        if (err instanceof CourseDraftError) {
          process.stderr.write(`course: invalid draft — ${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }

      if (result.failures.length > 0) {
        for (const f of result.failures) {
          const where = f.objectiveIndex < 0 ? 'target' : `objective ${f.objectiveIndex + 1}`;
          process.stderr.write(`course: ${where} — ${f.kind}: ${f.detail}\n`);
        }
        process.stderr.write(
          `course: ${result.failures.length} item(s) failed verification; regenerate or drop them and re-run.\n`,
        );
        process.exit(1);
      }

      const dir = join(cwd, '.spectastic', 'courses', result.slug);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(join(dir, 'course.html'), result.html ?? '', 'utf8');
      await ensureGitignore(fsp, cwd, opts.keep ?? false, result.slug);

      process.stdout.write(
        `Wrote .spectastic/courses/${result.slug}/course.html (${result.objectivesCount} objectives) — ${
          opts.keep ? 'kept (tracked)' : 'git-ignored'
        }.\n`,
      );
      process.exit(0);
    });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Ensure `.spectastic/.gitignore` exists ignoring everything by default
 * (courses are ephemeral, D-008/FR-001). With --keep, un-ignore the named
 * course so it can be tracked.
 */
async function ensureGitignore(
  fsp: typeof import('node:fs/promises'),
  cwd: string,
  keep: boolean,
  slug: string,
): Promise<void> {
  const path = join(cwd, '.spectastic', '.gitignore');
  let content: string;
  try {
    content = await fsp.readFile(path, 'utf8');
  } catch {
    content = '# spectastic courses are ephemeral by default — regenerate, don\'t track.\n*\n!.gitignore\n';
  }
  if (keep) {
    const marker = `!courses/${slug}/`;
    if (!content.includes(marker)) {
      content += `!courses/\n!courses/${slug}/\n!courses/${slug}/**\n`;
    }
  }
  await fsp.writeFile(path, content, 'utf8');
}
