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
  | 'test-runner';

/** How hard the enforcement floor gates (spec 042, D-003). */
export type EnforceGate = 'none' | 'soft' | 'hard';
