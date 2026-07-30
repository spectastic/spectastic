/**
 * Types for the value-ranked slicer (spec 029-value-ranked-slicer). The slicer
 * turns one over-budget parent spec into a *proposed* decomposition — candidate
 * children, RICE-ranked and R-002 dependency-ordered, with a coverage proof —
 * appended as a `<spec-split>` section. Dry-run: nothing is minted (plan §4).
 *
 * These are the shared shapes the slice/ modules (decompose, rank, corpus,
 * coverage, render) and the sliceCommand kernel pass between them.
 */

import type { RiceInputs } from '@spectastic/schema';

/**
 * A proposed child slice of the parent. Hypothetical — no `spec.html` exists
 * yet; minting is a deferred slice (spec out-of-scope `TBD-w2-mint`). The
 * `specId`/`dependsOn` fields are serialised into reciprocal stubs (FR-002) so
 * R-002's existing inference can order the children.
 */
export interface CandidateChild {
  /** Proposed spec id (`NNN-slug`); provisional until minted. */
  specId: string;
  /** Proposed title. */
  title: string;
  /** One-line scope — what this child covers. */
  scope: string;
  /** Parent requirement IDs (FR/NFR/SC) assigned to this child — its partition cell (FR-005). */
  assignedRequirementIds: string[];
  /** Sibling child spec ids this child depends on — the inter-child precedence edges (FR-002). */
  dependsOn: string[];
  /** Agent-estimated RICE inputs (FR-004). */
  rice: RiceInputs;
  /** True once the human has confirmed the RICE inputs; the ranking is provisional until then (FR-004). */
  riceConfirmed: boolean;
}

/** A full candidate decomposition of the parent into covering children. The panel weighs rivals (FR-009). */
export interface Decomposition {
  children: CandidateChild[];
}

/** One parent requirement's placement in the coverage partition. */
export interface CoverageAssignment {
  /** The parent requirement id (e.g. `FR-003`). */
  requirementId: string;
  /** The child it was assigned to, or `null` when no child claims it (a gap). */
  childSpecId: string | null;
  /** The children it was assigned to when more than one — a duplicate (partition not disjoint). */
  duplicatedIn?: string[];
}

/** The semantic critic's pass over a decomposition (FR-006, SHOULD). */
export interface SemanticVerdict {
  /** True if nothing meaningful was dropped and each child is a genuine vertical slice. */
  ok: boolean;
  /** Per-concern notes (e.g. a dropped behaviour, or a horizontal-layer child). */
  notes: string[];
}

/**
 * The coverage proof (FR-005): the requirement → child partition, its gap/dup
 * flags, and the optional semantic verdict. `isTotalAndDisjoint` is the hard
 * gate behind SC-001.
 */
export interface CoverageReport {
  assignments: CoverageAssignment[];
  /** Parent requirement ids assigned to no child (gaps — partition not total). */
  unassigned: string[];
  /** Parent requirement ids assigned to more than one child (partition not disjoint). */
  duplicated: string[];
  /** True iff every parent requirement is assigned to exactly one child (SC-001). */
  isTotalAndDisjoint: boolean;
  /** The semantic critic's verdict (FR-006); absent when the critic did not run. */
  semantic?: SemanticVerdict;
}

/**
 * The split outcome (FR-007). `split` means a covering, in-budget decomposition
 * was found; `dont-split` is a first-class verdict (cohesive spec, or no
 * candidate both covers and fits), never a forced cut.
 */
export type Verdict = { kind: 'split' } | { kind: 'dont-split'; reasons: string[] };

/**
 * The full model the renderer turns into the `<spec-split>` section (D-005).
 * The children are in R-002's dependency-respecting order (FR-003).
 */
export interface SplitModel {
  /** The parent spec id being split. */
  parentSpecId: string;
  /** The chosen decomposition's children, in R-002 order. */
  orderedChildren: CandidateChild[];
  /** The coverage proof. */
  coverage: CoverageReport;
  /** The split / don't-split verdict. */
  verdict: Verdict;
  /** Child spec ids whose own scope still exceeds budget — a recursive-split risk to flag (FR-007). */
  overBudgetChildren: string[];
}
