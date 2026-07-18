import type { Command } from 'commander';
import { getDiff } from '@spectastic/core/change-risk/diff';
import { scan } from '@spectastic/core/change-risk/scan';
import { score } from '@spectastic/core/change-risk/score';
import { loadChangeRiskConfig } from '@spectastic/core/change-risk/config';

/**
 * `spectastic change-risk [--range <base..head>]` — the enforcement half of
 * principles.html P-12 (spec 049, FR-001/FR-006/FR-008/FR-009). Thin CLI over
 * the core diff → scan → score pipeline (`@spectastic/core/change-risk/*`),
 * mirroring `enforce.ts`'s shape.
 *
 * Default scope is the uncommitted local diff (working tree + staged);
 * `--range` diffs two fixed commits instead (the CI shape, US2). Advisory by
 * default (FR-006): reports findings, a score, and a band, and exits 0
 * regardless of the result. It surfaces risk to force a human look — it
 * never claims to detect or certify the absence of malice (FR-001, P-12).
 */

export function registerChangeRisk(program: Command): void {
  program
    .command('change-risk')
    .description(
      "Scan a diff for capability/scope red flags — a binary blob, a build-script edit, an install hook, a high-entropy payload, a new dependency — and report a score. Surfaces risk for review; does not detect or certify safety.",
    )
    .argument('[path]', 'project root to scan', '.')
    .option('--range <base..head>', 'diff an explicit commit range instead of the default uncommitted diff')
    .action(async (path: string, options: { range?: string }) => {
      const cwd = path;
      const config = loadChangeRiskConfig(cwd);

      let diff: Awaited<ReturnType<typeof getDiff>>;
      try {
        diff = await getDiff(cwd, options.range);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${message}\n`);
        process.exit(1);
      }

      const findings = scan(diff);
      const { score: total, band } = score(findings, config);

      process.stdout.write(`change-risk: score ${total}/100 [${band}]\n`);
      if (findings.length === 0) {
        process.stdout.write('  ✓ no findings.\n');
      } else {
        for (const f of findings) {
          process.stdout.write(`  ⚠ ${f.weight.padEnd(6)} ${f.category.padEnd(18)} ${f.file} — ${f.evidence}\n`);
        }
      }
      process.stdout.write(
        'change-risk surfaces risk for review; it does not detect or certify the absence of malice.\n',
      );

      // Advisory by default (FR-006): exit 0 regardless of the score unless
      // an opt-in failAt threshold is configured and met (FR-007).
      const gated = config.failAt !== undefined && total >= config.failAt;
      if (gated) {
        process.stderr.write(`change-risk: score ${total} meets the configured failAt (${config.failAt})\n`);
      }
      process.exit(gated ? 1 : 0);
    });
}
