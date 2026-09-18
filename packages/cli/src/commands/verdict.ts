import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `verdict` subcommand (spec 115-guardrail-verdict). Given the
 * changed paths (explicit `--changed`, else `git diff --cached HEAD`), produce
 * the merge verdict and persist it; exit non-zero on any violation.
 *
 * Reading git is deliberately HERE, at the edge — the verdict KERNEL takes paths
 * as data and imports no child_process, so the no-exec guarantee (SC-003) holds
 * for the composition. This command runs git (a read), never an enforcer's
 * `run=` (deferred, guarded).
 */
export function registerVerdict(program: Command): void {
  program
    .command('verdict')
    .description(
      'Judge the changed paths against the governance decisions: write a reconstructable verdict and exit non-zero on any violation. Deterministic, no AI, no foreign execution.',
    )
    .option('--changed <paths...>', 'the changed paths to judge (else: git diff --cached HEAD)')
    .option('--enforcer-output <path>', 'an ecosystem enforcer SARIF file to ingest (never executed)')
    .option('--out <path>', 'where to write the verdict artifact (relative to cwd)', '.spectastic/verdict.json')
    .option('--json', 'print the verdict JSON to stdout')
    .option('--teach', 'after the verdict, add one Socratic follow-up question per violation (advisory, output-only)')
    .option(
      '--explain',
      'after the verdict, show each violation reviewer-grade: the offending code, the decision, and the sanctioned path (advisory, output-only)',
    )
    .action(
      async (opts: {
        changed?: string[];
        enforcerOutput?: string;
        out: string;
        json?: boolean;
        teach?: boolean;
        explain?: boolean;
      }) => {
        const [
          { verdictCommand, shifuQuestions, explainViolations, renderExplanations, loadDecisions },
          { nodeFs },
          fsp,
        ] = await Promise.all([
          import('@spectastic/core/commands/verdict'),
          import('@spectastic/core/providers/node-fs'),
          import('node:fs/promises'),
        ]);
        const cwd = process.cwd();

        // Changed paths: explicit, else the drain hook's diff (worktree.ts:79).
        let changed = opts.changed;
        if (!changed || changed.length === 0) {
          try {
            const out = execFileSync('git', ['diff', '--cached', '--name-only', 'HEAD'], { cwd, encoding: 'utf8' });
            changed = out
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
          } catch {
            process.stderr.write('verdict: no --changed given and `git diff` failed. Pass --changed <paths...>.\n');
            process.exit(2);
          }
        }

        let sarif: unknown;
        if (opts.enforcerOutput) {
          // resolve, not join: an absolute path — what every CI runner and
          // mktemp hand over — must not be nested under the cwd (inbox I-092).
          // Read and parse fail separately so a typo in the path and a
          // malformed SARIF are told apart.
          const enforcerPath = resolve(cwd, opts.enforcerOutput);
          let raw: string;
          try {
            raw = await fsp.readFile(enforcerPath, 'utf8');
          } catch {
            process.stderr.write(`verdict: could not read enforcer output ${enforcerPath}.\n`);
            process.exit(2);
          }
          try {
            sarif = JSON.parse(raw);
          } catch {
            process.stderr.write(`verdict: could not parse enforcer output ${enforcerPath} as JSON.\n`);
            process.exit(2);
          }
        }

        // Resolve the current project identity at the edge (spec 119) so the pure
        // kernel reads no config — it drives a resource-scoped decision's owner
        // comparison, and is reused by --explain below for the coordinate.
        const { resolveProjectConfig } = await import('@spectastic/corpus');
        const { project } = resolveProjectConfig(cwd);

        const result = await verdictCommand(
          { changed, now: new Date(), currentProject: project, ...(sarif !== undefined ? { sarif } : {}) },
          { cwd, fs: nodeFs },
        );

        // Same resolve-not-join as --enforcer-output above: an absolute --out
        // must land where it says, not under the cwd.
        const outPath = resolve(cwd, opts.out);
        await fsp.mkdir(resolve(outPath, '..'), { recursive: true }).catch(() => {});
        await fsp.writeFile(outPath, result.verdictText, 'utf8');

        // Scope-honesty (TBD-verdict-scope-honesty): the verdict judged this
        // checkout against the decisions PRESENT in it. A decision not present here
        // is not evaluated — including one that lives in another repository (119
        // triage T-002: a decision owned elsewhere but COPIED into this checkout is
        // present, so it IS evaluated; the true invariant is presence, not owner).
        // A clean verdict is a repo-local clean — and says so, in the human output
        // and (as `scope`/`decisionsEvaluated`) in the artifact. --json stays pure.
        const n = result.verdict.decisionsEvaluated;
        const scopeNote =
          `Scope: repo-local — evaluated ${n} decision${n === 1 ? '' : 's'} from this checkout. ` +
          'A decision not present in this checkout is not evaluated.';

        if (opts.json) {
          process.stdout.write(result.verdictText);
        } else if (!result.hasViolation) {
          process.stdout.write(`verdict: no governance violations in the changed paths.\n${scopeNote}\n`);
        } else {
          for (const v of result.verdict.violations) {
            const loc = v.line !== undefined ? `${v.file}:${v.line}` : v.file;
            process.stdout.write(
              `VIOLATION ${v.specId}/${v.decisionId} [${v.ruleId}] at ${loc}\n` +
                `  ${v.source ?? ''} → ${v.target ?? ''}\n` +
                `  ${v.reason}\n`,
            );
          }
          process.stdout.write(`${scopeNote}\n`);
        }
        // Reviewer-grade explanation (118) — output-only, before the teaching
        // question; the exit code and artifact are unchanged.
        if (opts.explain && result.hasViolation) {
          const decisions = await loadDecisions({ cwd, fs: nodeFs });
          const normal = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
          const explained = explainViolations({
            verdict: result.verdict,
            decisions,
            project,
            readFile: (p) => result.contents.get(normal(p)) ?? null,
          });
          process.stdout.write(`\n${renderExplanations(explained)}\n`);
        }

        // Advisory teaching follow-up (117) — output-only, after the verdict; the
        // exit code is unchanged.
        if (opts.teach && result.hasViolation) {
          process.stdout.write('\nTeaching follow-up (advisory — reason for yourself, this is not a fix):\n');
          for (const q of shifuQuestions(result.verdict)) process.stdout.write(`  · ${q}\n`);
        }
        // A join that dropped every enforcer result used to read as a clean
        // verdict (I-091). Advisory — the exit code is unchanged — but never silent.
        const unmatched = result.verdict.enforcerResultsUnmatched;
        if (unmatched !== undefined && unmatched > 0) {
          process.stderr.write(
            `${unmatched} enforcer result(s) matched no decision's rule — an enforcer's own concern, not a governance violation; check the rule ids if you expected a join.\n`,
          );
        }
        process.stderr.write(`Wrote ${opts.out}\n`);
        process.exit(result.hasViolation ? 1 : 0);
      },
    );
}
