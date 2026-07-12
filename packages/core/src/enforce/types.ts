/**
 * Enforcement primitives (spec 042). Kernel-level types shared by detection,
 * the policy diff, and the 041 profile manifest — moved here from the CLI so the
 * deterministic enforcement logic lives in the core (fat-core / thin-CLI + P-8;
 * triage 042/T-001).
 */

/** A category of enforcement gate a profile can require / a project can cover. */
export type EnforcementCategory =
  | 'formatter'
  | 'linter'
  | 'type-checker'
  | 'security'
  | 'supply-chain'
  | 'test-runner'
  | 'coverage'
  | 'observability';

/** How hard the enforcement floor gates (spec 042, D-003). */
export type EnforceGate = 'none' | 'soft' | 'hard';

/**
 * A per-category enforcement waiver (spec 042, FR-011). A downstream project
 * declares these in `spectastic.json` under `enforce.waivers[]` to relax a
 * single floor category — deliberately, with a reason, an owner, and an expiry.
 * All four fields are required; a structurally-incomplete entry is dropped at
 * load (fail-safe) so a broken waiver can never accidentally disable a gate.
 */
export interface EnforceWaiver {
  category: EnforcementCategory;
  /** Why the category is relaxed — non-empty, non-boilerplate (FR-013). */
  reason: string;
  /** ISO `YYYY-MM-DD` expiry; auto-expires (≤ 365 days out, FR-011). */
  until: string;
  /** Who accepted the risk (the PR review is the v1 approval surface). */
  owner: string;
}

/**
 * A category that an active, well-formed, waivable waiver has demoted from a
 * blocking gap to an advisory warning (FR-004). Surfaced as its own `relaxed`
 * tally — never folded into the covered categories, never silent.
 */
export interface RelaxedCategory {
  category: EnforcementCategory;
  reason: string;
  until: string;
  owner: string;
}
