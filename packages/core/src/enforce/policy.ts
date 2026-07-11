import type { EnforceGate, EnforcementCategory } from './types.js';

/**
 * The pure enforcement policy diff (spec 042, D-003) — moved to core from the
 * CLI so the deterministic guarantee lives in the kernel (triage 042/T-001).
 * No I/O; unit-testable.
 */

export interface EnforceEvaluation {
  /** Required, uncovered, and NOT structurally undetectable — these gate. */
  missing: EnforcementCategory[];
  /** Required, uncovered, but structurally undetectable in every detected
   *  ecosystem — demoted from a hard failure to a warning (FR-010). */
  warned: EnforcementCategory[];
  covered: EnforcementCategory[];
  exitCode: 0 | 1;
}

/**
 * Categories that have no config-file surface in certain ecosystems — the
 * category is real but statically undetectable there (spec 042, FR-010).
 * Coverage in Go is the founding case: `go test -cover` is a flag, not a
 * config file, so presence-detection can never see it. Extensible as new
 * category/ecosystem gaps surface; never used to suppress a category that
 * genuinely has a detectable signal in the project's stack.
 */
export const STRUCTURALLY_UNDETECTABLE: Readonly<
  Partial<Record<EnforcementCategory, readonly string[]>>
> = {
  coverage: ['go'],
  // Swift and C++ have no standard metrics-exporter-in-manifest convention the
  // way Java/Go/JS/Python/Rust do, so an observability exporter can't be
  // presence-detected there — warn rather than false-fail a hard gate.
  observability: ['swift', 'cpp'],
};

/**
 * Diff required vs covered categories, gated by severity.
 *
 * A required-but-uncovered category demotes from `missing` to `warned` when
 * it is structurally undetectable (per `undetectable`) in *every* one of the
 * project's detected `ecosystems` (FR-010) — so a hard gate never
 * false-fails a floor the ecosystem cannot express (e.g. coverage on a
 * Go-only project). A category still counts as `missing` if the project is
 * polyglot and the category is detectable in at least one of its other
 * ecosystems, or if no ecosystems were supplied (callers that don't pass
 * `ecosystems` get the pre-FR-010 behavior: every gap is `missing`).
 */
export function evaluateEnforcement(
  required: readonly EnforcementCategory[],
  covered: ReadonlySet<EnforcementCategory>,
  gate: EnforceGate,
  ecosystems: ReadonlySet<string> = new Set(),
  undetectable: Readonly<Partial<Record<EnforcementCategory, readonly string[]>>> = STRUCTURALLY_UNDETECTABLE,
): EnforceEvaluation {
  const gaps = required.filter((c) => !covered.has(c));
  const missing: EnforcementCategory[] = [];
  const warned: EnforcementCategory[] = [];
  for (const category of gaps) {
    const undetectableIn = undetectable[category];
    const isStructurallyUndetectable =
      undetectableIn !== undefined &&
      ecosystems.size > 0 &&
      [...ecosystems].every((eco) => undetectableIn.includes(eco));
    (isStructurallyUndetectable ? warned : missing).push(category);
  }
  const exitCode: 0 | 1 = gate === 'hard' && missing.length > 0 ? 1 : 0;
  return { missing, warned, covered: [...covered], exitCode };
}
