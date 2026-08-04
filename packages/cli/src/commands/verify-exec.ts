import type { Command } from 'commander';
import { readConfigFile } from '@spectastic/schema/config';

/**
 * Register `verify:exec` (spec 085-verify-command-execution).
 *
 * Runs a spec's recorded commands and fails when one no longer works — the only
 * check that distinguishes a command from a sentence about a command, and the
 * only one that notices a true claim that quietly stopped being true.
 *
 * Off unless the project asks. Executing recorded commands is an exception to
 * P-11, bounded to the case where the author of the artifact and the party
 * running it are the same: a first-party check on a project's own committed
 * work. An artifact under a dependency directory is refused with no setting
 * able to permit it, because that is the boundary the principle protects.
 *
 * Thin by convention (P-14): the guards, the plan and the verdict are all in
 * `@spectastic/core/execcheck/*`; this parses arguments and prints.
 */
export function registerVerifyExec(program: Command): void {
  program
    .command('verify:exec')
    .description(
      'Run a spec\'s recorded commands and fail if one no longer works. Off unless enabled in this project, and never runs an artifact from a dependency. Prose fields are never executed.',
    )
    .argument('<spec>', 'the spec whose recorded commands should be run')
    .argument('[path]', 'project root', '.')
    .option('--timeout <ms>', 'per-command limit in milliseconds')
    .action(async (spec: string, path: string, opts: { timeout?: string }) => {
      const [{ checkSpec, formatVerdict, DEFAULT_TIMEOUT_MS }] = await Promise.all([
        import('@spectastic/core/execcheck/run'),
      ]);
      const { readFileSync, existsSync, readdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { exec } = await import('node:child_process');

      const specNum = /^(\d{3,})/.exec(spec)?.[1];
      const specsDir = join(path, 'specs');
      const dir =
        specNum !== undefined && existsSync(specsDir)
          ? readdirSync(specsDir).find((d) => d.startsWith(specNum))
          : undefined;
      if (dir === undefined) {
        process.stderr.write(`verify:exec: no spec directory matching "${spec}".\n`);
        process.exit(1);
      }
      const artifactPath = join('specs', dir, 'verify.html');

      // Consent is a property of the invoking project, never of the artifact —
      // an artifact cannot consent on a reader's behalf.
      let consented = false;
      const cfgPath = join(path, 'spectastic.json');
      if (existsSync(cfgPath)) {
        try {
          const cfg: unknown = readConfigFile(path);
          consented = (cfg as { verify?: { executeCapturedCommands?: unknown } }).verify?.executeCapturedCommands === true;
        } catch {
          // A malformed config is not consent.
        }
      }

      // Parse the captured commands out of the rendered block.
      const full = join(path, artifactPath);
      const html = existsSync(full) ? readFileSync(full, 'utf8') : '';
      const field = (tag: string): string | undefined => {
        const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(html);
        const v = m?.[1]
          ?.replace(/<[^>]+>/g, '')
          .replaceAll('&amp;', '&')
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .trim();
        return v === undefined || v === '' ? undefined : v;
      };
      // Built by assignment rather than as a literal: under
      // `exactOptionalPropertyTypes` an optional property must be *absent*, not
      // present-and-undefined, and a literal cannot express that.
      // Structural, and local: CapturedRun is not reachable as a type from this
      // package (core exports no ./types subpath), and the call site below
      // checks it against the real one anyway.
      const captured: { run?: string; exercise?: string; tests?: string; verified?: boolean } = {};
      const run = field('spec-run');
      if (run !== undefined) captured.run = run;
      const exercise = field('spec-exercise');
      if (exercise !== undefined) captured.exercise = exercise;
      const tests = field('spec-tests');
      if (tests !== undefined) captured.tests = tests;
      if (/<spec-runblock[^>]*data-status="suggested"/.test(html)) captured.verified = false;

      const runner = (command: string, o: { cwd: string; timeoutMs: number }): Promise<{ exitCode: number; output: string; timedOut: boolean }> =>
        new Promise((resolveRun) => {
          exec(
            command,
            { cwd: o.cwd, timeout: o.timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, SPECTASTIC_EXEC_ACTIVE: '1' } },
            (err, stdout, stderr) => {
            const e = err as (Error & { code?: number; killed?: boolean; signal?: string }) | null;
            resolveRun({
              exitCode: e?.code ?? (e === null ? 0 : 1),
              output: `${stdout}${stderr}`.trim(),
              timedOut: e?.killed === true || e?.signal === 'SIGTERM',
            });
            },
          );
        });

      const out = await checkSpec({
        // Set by this command in the child environment below. Without it, a
        // captured entry point that invokes verify:exec recurses forever —
        // found by running it against this spec's own view.
        reentrant: process.env.SPECTASTIC_EXEC_ACTIVE === '1',
        specId: dir,
        artifactPath,
        projectRoot: path,
        consented,
        captured,
        runner,
        ...(opts.timeout !== undefined ? { timeoutMs: Number(opts.timeout) } : { timeoutMs: DEFAULT_TIMEOUT_MS }),
      });

      const write = (l: string): void => void process.stdout.write(`${l}\n`);
      if ('refusal' in out) {
        // A refusal is not a passing check — it is a check that did not happen.
        write(`verify:exec refused (${out.refusal.kind})`);
        write(`  ${out.refusal.message}`);
        process.exit(2);
      }

      write(`verify:exec ${out.verdict.specId} — ${out.verdict.ok ? 'ok' : 'FAILED'}`);
      for (const line of formatVerdict(out.verdict)) write(line);
      for (const r of out.verdict.results) {
        if ((r.outcome === 'failed' || r.outcome === 'timed-out') && r.output !== undefined && r.output !== '') {
          write(`  ── output of ${r.field} ──`);
          for (const l of r.output.split('\n').slice(-15)) write(`     ${l}`);
        }
      }
      process.exit(out.verdict.ok ? 0 : 1);
    });
}
