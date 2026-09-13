import { join } from 'node:path';
import type { Command } from 'commander';

/**
 * Register the `adrs` subcommand (spec 112-guardrail-decision-record → Slice 2).
 * Given code paths, prints the governance decisions that govern them and writes
 * a reproducible retrieval log. Deterministic, no AI — like `order`/`verify`, it
 * runs in CI with no key. The same function backs plan-time and merge-time
 * retrieval; diffing the two logs is how a plan that ignored a decision is
 * caught (later slices).
 */
export function registerAdrs(program: Command): void {
  program
    .command('adrs')
    .description(
      'Find the governance decisions that govern a set of paths, in precedence order, and write a reproducible retrieval log. Deterministic, no AI.',
    )
    .option('--for <paths...>', 'code paths to find governing decisions for')
    .option('--coverage', 'report the proportion of active decisions carrying an executable check')
    .option('--log <path>', 'where to write the retrieval log (relative to cwd)', '.spectastic/adr-retrieval.json')
    .option('--json', 'print the retrieval log as JSON to stdout instead of a human summary')
    .action(async (opts: { for?: string[]; coverage?: boolean; log: string; json?: boolean }) => {
      const [{ adrsCommand, loadDecisions, coverageReport }, { nodeFs }, { resolveProjectConfig }, fsp] =
        await Promise.all([
          import('@spectastic/core/commands/adrs'),
          import('@spectastic/core/providers/node-fs'),
          import('@spectastic/corpus'),
          import('node:fs/promises'),
        ]);

      const cwd = process.cwd();

      // Coverage-report mode (spec 114 FR-005) — the metric surface, distinct
      // from the validate-folded warnings.
      if (opts.coverage) {
        const decisions = await loadDecisions({ cwd, fs: nodeFs });
        const r = coverageReport(decisions, { now: new Date() });
        const pct = Math.round(r.proportion * 100);
        process.stdout.write(
          `decision coverage: ${r.checked}/${r.total} active decisions carry an executable check (${pct}%)\n` +
            `  excused (none-with-reason): ${r.excused}\n` +
            `  uncovered: ${r.uncovered}\n`,
        );
        for (const f of r.findings) process.stdout.write(`  warn: ${f.message}\n`);
        process.exit(0);
      }

      if (!opts.for || opts.for.length === 0) {
        process.stderr.write('adrs: pass --for <paths...> to retrieve, or --coverage to report.\n');
        process.exit(2);
      }

      const { project } = resolveProjectConfig(cwd);
      const paths = opts.for;
      const result = await adrsCommand({ paths, project, now: new Date() }, { cwd, fs: nodeFs });

      // Write the log artifact (retrieval is "logged"; the verdict reconstructs from disk).
      const logPath = join(cwd, opts.log);
      await fsp.mkdir(join(cwd, opts.log, '..'), { recursive: true }).catch(() => {});
      await fsp.writeFile(logPath, result.logText, 'utf8');

      if (opts.json) {
        process.stdout.write(result.logText);
      } else if (result.matches.length === 0) {
        process.stdout.write('No governance decisions govern the given paths.\n');
      } else {
        for (const m of result.matches) {
          const enf = m.decision.enforcement;
          const check = enf?.none
            ? `none (${enf.none.reason})`
            : (enf?.rules ?? []).map((r) => `${r.tool}:${r.id}`).join(', ') || '(no check)';
          process.stdout.write(
            `${m.decision.specId}/${m.decision.id}  [${m.decision.posture ?? 'block'}]  ${check}\n` +
              `  governs: ${m.matchedPaths.join(', ')}\n`,
          );
        }
      }
      process.stderr.write(`Wrote ${opts.log}\n`);
      process.exit(0);
    });
}
