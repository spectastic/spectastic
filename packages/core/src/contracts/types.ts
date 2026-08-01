/**
 * Types for contract promotion (spec 071-contract-promotion). A promotion
 * plan is computed in full, read-only, before any write — the plan-then-
 * execute split that gives FR-004 (atomicity), FR-005 (idempotence) and
 * FR-008 (dry-run) all in one structure (design D-003).
 */

/** One proposed contract's move to its declared effective path. */
export interface PromotionWrite {
  /** The spec-local proposed file — specs/<id>/contracts/<name>. */
  from: string;
  /** The declared effective path the design names. */
  to: string;
}

/** One proposed contract's archive move, alongside its baseline if one was recorded. */
export interface PromotionArchive {
  from: string;
  to: string;
  baselineFrom?: string;
  baselineTo?: string;
}

/** A declared contract whose effective file has diverged from its recorded baseline. */
export interface PromotionConflict {
  /** The declared path (design-relative, human-readable) that conflicted. */
  path: string;
  reason: string;
}

/**
 * The full plan for one change. Per D-003: a non-empty `conflicts` means
 * `writes`/`archives` are cleared to empty — the atomicity guarantee is that
 * a conflict anywhere in the plan aborts the whole plan, not just its own
 * entry.
 */
export interface PromotionPlan {
  writes: PromotionWrite[];
  archives: PromotionArchive[];
  conflicts: PromotionConflict[];
}
