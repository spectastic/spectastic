import type { Verdict } from './types.js';

/**
 * The teaching follow-up (spec 117-guardrail-shifu). Given a merge verdict,
 * compose one Socratic question per violation from the decision's own reason and
 * the offending source→target — a question that prompts the developer to reason
 * toward the sanctioned path, never a fix.
 *
 * Deterministic and pure: a templated composition over 115's Verdict, no model,
 * no network. Strictly post-verdict and output-only — it reads a verdict and
 * returns strings; it never changes a gate result (P-8). The brief imagined an
 * LLM hook; a template meets "one question, never a fix" without the
 * non-determinism.
 */
export function shifuQuestions(verdict: Verdict): string[] {
  return verdict.violations.map((v) => {
    const reason = v.reason?.trim() || 'the boundary it governs';
    if (v.source && v.target) {
      return `Decision ${v.specId}/${v.decisionId} exists so that: ${reason} — this change has ${v.source} reaching ${v.target}. What makes that necessary here, rather than the path the decision intends?`;
    }
    return `Decision ${v.specId}/${v.decisionId} exists so that: ${reason}. What in this change makes crossing that boundary necessary?`;
  });
}
