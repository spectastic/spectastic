/**
 * Change-risk primitives (spec 049). Kernel-level types shared by the diff,
 * scan, score, and config modules — the enforcement half of principles.html
 * P-12 (capability accountability). Mirrors enforce/types.ts's shape
 * (fat-core / thin-CLI convention).
 */

/** The five red-flag categories the scan detects (spec 049 FR-002). */
export type RedFlagCategory =
  | 'binary-blob'
  | 'build-script-edit'
  | 'install-hook'
  | 'entropy-payload'
  | 'new-dependency';

/** Severity tier a finding carries, feeding the composite score (FR-003, plan D-004). */
export type RiskWeight = 'high' | 'medium' | 'low';

/** The RAG band a composite score maps to (FR-004). */
export type ChangeRiskBand = 'green' | 'amber' | 'red';

/** One flagged change in a diff (spec 049 §4). */
export interface RedFlagFinding {
  category: RedFlagCategory;
  weight: RiskWeight;
  file: string;
  /** The matched line, or the reason the detector fired. */
  evidence: string;
}

/** The scan result for a diff (spec 049 §4). */
export interface ChangeRiskReport {
  findings: RedFlagFinding[];
  /** 0–100, a risk-weighted aggregation of `findings` (FR-004). */
  score: number;
  band: ChangeRiskBand;
  /** The exit code the CLI resolves to — 0 unless an opt-in `failAt` gate fires. */
  exitCode: number;
}

/** Configurable amber/red score thresholds (FR-005). Shipped defaults apply when absent. */
export interface ChangeRiskBands {
  amber: number;
  red: number;
}

/** The optional `changeRisk` section of `spectastic.json` (spec 049 §4, plan D-003). */
export interface ChangeRiskConfig {
  bands?: ChangeRiskBands;
  /** Opt-in: a score at or above this fails the command (FR-007). Absent = advisory only. */
  failAt?: number;
}

/**
 * Shipped band defaults (FR-005), applied whenever `spectastic.json`'s
 * `changeRisk` section is absent, malformed, or omits `bands` (NFR-004).
 */
export const DEFAULT_BANDS: ChangeRiskBands = { amber: 25, red: 60 };
