import type { Finding } from '@spectastic/schema';
import type { GovernanceDecision } from './types.js';

/**
 * Decision-coverage report (spec 114-guardrail-gates, FR-005). Over all ACTIVE
 * (accepted) decisions: how many carry an executable check (≥1 rule), how many
 * are excused (a none-with-reason), and how many are neither. The proportion is
 * the reported metric; the warnings are the actionable findings.
 *
 * Coverage never blocks (warnings only) — blocking a contradicted decision is
 * the plan-constraint's and the merge verdict's job, not coverage's. Pure given
 * an injected clock (`now`) for the review-by comparison, so fixtures pin it.
 *
 * The population is active decisions THAT GOVERN CODE — i.e. carry a scope.
 * An unscoped methodology/judgment decision ("use TDD", "every check is
 * conditional") governs no path and so cannot carry an executable check;
 * counting it as "uncovered" is noise. Dogfooding surfaced this: two unscoped
 * `posture="warn"` decisions in the guardrail specs were flagged as blind spots
 * when they were nothing of the sort.
 */

export interface CoverageReport {
  total: number;
  checked: number;
  excused: number;
  uncovered: number;
  /** checked / total, or 1 when there are no active decisions (vacuously covered). */
  proportion: number;
  findings: Finding[];
}

function warn(file: string, message: string, fixHint: string): Finding {
  return { file, line: 1, column: 1, rule: 'decision-coverage', severity: 'warning', message, fixHint };
}

export function coverageReport(
  decisions: readonly GovernanceDecision[],
  opts: { now: Date; fileOf?: (d: GovernanceDecision) => string },
): CoverageReport {
  const fileOf = opts.fileOf ?? ((d) => `specs/${d.specId}/design.html`);
  const active = decisions.filter((d) => d.status === 'accepted' && d.paths.length > 0);
  const findings: Finding[] = [];
  let checked = 0;
  let excused = 0;
  let uncovered = 0;

  for (const d of active) {
    const hasRule = (d.enforcement?.rules?.length ?? 0) > 0;
    const hasExcuse = d.enforcement?.none !== undefined;
    if (hasRule) checked++;
    else if (hasExcuse) excused++;
    else {
      uncovered++;
      findings.push(
        warn(
          fileOf(d),
          `active decision ${d.specId}/${d.id} carries no executable check and no <spec-none reason=> — it is silently unenforced`,
          `Add a <spec-rule tool="…" id="…"/>, or an explicit <spec-none reason="…"/> saying why it has no check.`,
        ),
      );
    }
    if (d.reviewBy) {
      const due = new Date(d.reviewBy);
      if (!Number.isNaN(due.getTime()) && due.getTime() < opts.now.getTime()) {
        findings.push(
          warn(
            fileOf(d),
            `decision ${d.specId}/${d.id} is past its review-by date (${d.reviewBy})`,
            'Review the decision and update or extend its review-by, or retire it.',
          ),
        );
      }
    }
  }

  const total = active.length;
  const proportion = total === 0 ? 1 : checked / total;
  return { total, checked, excused, uncovered, proportion, findings };
}
