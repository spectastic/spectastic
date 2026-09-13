/**
 * Profile gating for the plan-stage constraint (spec 114-guardrail-gates,
 * FR-002/FR-006). Mirrors `isQuantifiedNfrGatedTier` in the validate kernel,
 * but the floor is one tier lower: a contradicted decision blocks from the
 * standard profile up, per the human decision that raised it from enterprise.
 *
 * Fail-safe on the antecedent: an absent/unknown tier is not gated, so a
 * project with no profile marker gets no plan-constraint (like the enforce
 * floor) rather than a spurious failure.
 */
const PLAN_CONSTRAINT_GATED_TIERS = new Set(['standard', 'verified', 'enterprise']);

export function isPlanConstraintGatedTier(tier: string | undefined): boolean {
  return tier !== undefined && PLAN_CONSTRAINT_GATED_TIERS.has(tier);
}
