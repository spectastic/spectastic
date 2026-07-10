import type { EnforceGate, EnforcementCategory } from './types.js';

/**
 * The pure enforcement policy diff (spec 042, D-003) — moved to core from the
 * CLI so the deterministic guarantee lives in the kernel (triage 042/T-001).
 * No I/O; unit-testable.
 */

export interface EnforceEvaluation {
  missing: EnforcementCategory[];
  covered: EnforcementCategory[];
  exitCode: 0 | 1;
}

/** Diff required vs covered categories, gated by severity. */
export function evaluateEnforcement(
  required: readonly EnforcementCategory[],
  covered: ReadonlySet<EnforcementCategory>,
  gate: EnforceGate,
): EnforceEvaluation {
  const missing = required.filter((c) => !covered.has(c));
  const exitCode: 0 | 1 = gate === 'hard' && missing.length > 0 ? 1 : 0;
  return { missing, covered: [...covered], exitCode };
}
