/**
 * Placement evidence weights (spec 082-placement-verdict, NFR-001 / D-003).
 *
 * These constants are a **v1 default, not calibrated truth** — the same
 * statement `change-risk/score.ts` makes about its own, and for the same
 * reason: nothing has measured them against confirmed placements, because no
 * corpus of confirmed placements exists. Tuning them against real outcomes is
 * deferred (`TBD-placement-calibration`).
 *
 * Stating that here matters. A weighted number looks measured, and a reader who
 * takes it for evidence in itself has been misled by the presentation rather
 * than by the value.
 */

import type { EvidenceClass } from './placement.js';

export interface PlacementWeights {
  structural: number;
  declared: number;
  domain: number;
  'prior-art': number;
}

/**
 * Structural and declared outrank domain by design, not by tuning.
 *
 * FR-003 requires structural evidence to be *able* to outrank resemblance, and
 * the survey's central finding is why: a requirement resembles the unit whose
 * vocabulary it borrowed, so a ranking resemblance can always win reproduces
 * the producer/consumer failure by construction.
 */
export const DEFAULT_WEIGHTS: PlacementWeights = {
  structural: 10,
  declared: 8,
  domain: 3,
  'prior-art': 4,
};

/** Bands the total maps onto (FR-004). Uncalibrated, like the weights. */
export interface ConfidenceThresholds {
  /** At or above → high. */
  high: number;
  /** At or above → medium; below → low, which hedges. */
  medium: number;
}

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = { high: 12, medium: 6 };

export function weightOf(weights: PlacementWeights, cls: EvidenceClass): number {
  return weights[cls];
}
