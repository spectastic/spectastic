import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import type { Verdict } from '@spectastic/core/commands/verdict';
import { resolveDecisionSources } from './decision-sources.js';

/** Explicit `--changed`, else `git diff --cached HEAD` (the drain hook's
 *  own diff, worktree.ts:79). Exits 2 on the fallback's own failure — there
 *  is nothing else to try. */
function resolveChangedPaths(cwd: string, explicit: string[] | undefined): string[] {
  if (explicit && explicit.length > 0) return explicit;
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', 'HEAD'], { cwd, encoding: 'utf8' });
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    process.stderr.write('verdict: no --changed given and `git diff` failed. Pass --changed <paths...>.\n');
    process.exit(2);
  }
}

/** Read and parse `--enforcer-output`, or return undefined when the flag is
 *  absent. Read and parse fail separately so a typo in the path and a
 *  malformed SARIF are told apart (both exit 2). */
async function resolveEnforcerSarif(cwd: string, enforcerOutput: string | undefined): Promise<unknown> {
  if (!enforcerOutput) return undefined;
  // resolve, not join: an absolute path — what every CI runner and mktemp
  // hand over — must not be nested under the cwd (inbox I-092).
  const enforcerPath = resolve(cwd, enforcerOutput);
  let raw: string;
  try {
    raw = await readFile(enforcerPath, 'utf8');
  } catch {
    process.stderr.write(`verdict: could not read enforcer output ${enforcerPath}.\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch {
    process.stderr.write(`verdict: could not parse enforcer output ${enforcerPath} as JSON.\n`);
    process.exit(2);
  }
}

/** Print the human (or `--json`) verdict summary — the branch on `opts.json`
 *  / `hasViolation` factored out so the action handler's own complexity
 *  stays about wiring, not formatting. */
function printVerdictSummary(
  result: { verdict: Verdict; verdictText: string; hasViolation: boolean },
  json: boolean | undefined,
  scopeNote: string,
): void {
  if (json) {
    process.stdout.write(result.verdictText);
    return;
  }
  if (!result.hasViolation) {
    process.stdout.write(`verdict: no governance violations in the changed paths.\n${scopeNote}\n`);
    return;
  }
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

/**
 * Scope-honesty (TBD-verdict-scope-honesty, widened federated per spec 122):
 * the verdict judged this checkout against the decisions PRESENT in it — a
 * decision not present here is not evaluated, including one that lives in
 * another repository (119 triage T-002: a decision owned elsewhere but
 * COPIED into this checkout is present, so it IS evaluated; the true
 * invariant is presence, not owner). When any source is declared, the note
 * names the federated scope instead — evaluated from THIS checkout, plus
 * each source's vendored copy, entirely from disk (never a network read
 * here). A clean verdict says so in the human output and (as
 * `scope`/`decisionsEvaluated`/`sources`) in the artifact; `--json` stays pure.
 */
function scopeNoteFor(verdict: Verdict): string {
  const n = verdict.decisionsEvaluated;
  if (verdict.scope === 'federated') {
    const sourceCount = verdict.sources?.length ?? 0;
    return (
      `Scope: federated — evaluated ${n} decision${n === 1 ? '' : 's'} from this checkout, ` +
      `plus ${sourceCount} declared source${sourceCount === 1 ? '' : 's'} read from their vendored copies on disk.`
    );
  }
  return (
    `Scope: repo-local — evaluated ${n} decision${n === 1 ? '' : 's'} from this checkout. ` +
    'A decision not present in this checkout is not evaluated.'
  );
}

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

        const changed = resolveChangedPaths(cwd, opts.changed);
        const sarif = await resolveEnforcerSarif(cwd, opts.enforcerOutput);

        // Resolve the current project identity at the edge (spec 119) so the pure
        // kernel reads no config — it drives a resource-scoped decision's owner
        // comparison, and is reused by --explain below for the coordinate.
        const { resolveProjectConfig } = await import('@spectastic/corpus');
        const { project } = resolveProjectConfig(cwd);

        // Federation (spec 122, D-001/D-004): decisions.sources[] is resolved
        // HERE, at the edge, and passed into verdictCommand as data — the
        // kernel itself reads no config. Empty when the project declares none.
        const sources = resolveDecisionSources(cwd, project, 'verdict');

        let result: Awaited<ReturnType<typeof verdictCommand>>;
        try {
          result = await verdictCommand(
            {
              changed,
              now: new Date(),
              currentProject: project,
              ...(sarif !== undefined ? { sarif } : {}),
              ...(sources.length > 0 ? { sources } : {}),
            },
            { cwd, fs: nodeFs },
          );
        } catch (err) {
          // FR-008: a missing/invalid/mismatched-pin source stops the verdict
          // with the source named — never a green verdict that silently
          // skipped it. verdictCommand's error message already names it.
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(2);
        }

        // Same resolve-not-join as --enforcer-output above: an absolute --out
        // must land where it says, not under the cwd.
        const outPath = resolve(cwd, opts.out);
        await fsp.mkdir(resolve(outPath, '..'), { recursive: true }).catch(() => {});
        await fsp.writeFile(outPath, result.verdictText, 'utf8');

        printVerdictSummary(result, opts.json, scopeNoteFor(result.verdict));
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
