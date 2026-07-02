/**
 * The split / don't-split verdict (spec 029, FR-007). Pure. "Don't split" is a
 * first-class outcome — returned, with reasons, when the partition fails, there
 * are too few children to split, or a child is itself still over budget (a
 * recursive-split risk). Never a forced cut.
 */

import type { CandidateChild, CoverageReport, Verdict } from './types.js';

/** Requirement-count proxy for "still over budget" — the standard per-spec budget. */
export const REQ_BUDGET = 20;

/** The child spec ids whose own assigned requirement count still exceeds budget. */
export function overBudgetChildren(children: readonly CandidateChild[]): string[] {
  return children.filter((c) => c.assignedRequirementIds.length > REQ_BUDGET).map((c) => c.specId);
}

export interface VerdictInput {
  coverage: CoverageReport;
  children: readonly CandidateChild[];
  overBudget: readonly string[];
}

export function decideVerdict({ coverage, children, overBudget }: VerdictInput): Verdict {
  const reasons: string[] = [];
  if (children.length < 2) {
    reasons.push('fewer than two candidate children — nothing to split');
  }
  if (coverage.unassigned.length > 0) {
    reasons.push(`requirements covered by no child: ${coverage.unassigned.join(', ')}`);
  }
  if (coverage.duplicated.length > 0) {
    reasons.push(`requirements covered by more than one child: ${coverage.duplicated.join(', ')}`);
  }
  if (overBudget.length > 0) {
    reasons.push(`children still over budget (recursive-split risk): ${overBudget.join(', ')}`);
  }
  return reasons.length > 0 ? { kind: 'dont-split', reasons } : { kind: 'split' };
}
