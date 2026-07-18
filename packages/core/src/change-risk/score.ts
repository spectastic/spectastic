/**
 * Composite change-risk scoring (spec 049 FR-004/FR-005, plan D-004). Pure —
 * a per-finding saturating weighted sum (high 40 / medium 15 / low 5, capped
 * at 100), mapped to a green/amber/red band via the config's thresholds (or
 * `DEFAULT_BANDS` when absent). The constants are a v1 default, not
 * calibrated truth (plan §9) — tunable via `spectastic.json`.
 */

import { DEFAULT_BANDS } from './types.js';
import type { ChangeRiskBand, ChangeRiskBands, ChangeRiskConfig, RedFlagFinding } from './types.js';

export interface ScoreResult {
  score: number;
  band: ChangeRiskBand;
}

const WEIGHT_POINTS: Record<RedFlagFinding['weight'], number> = { high: 40, medium: 15, low: 5 };

/** Bands: score < amber → green; amber ≤ score ≤ red → amber; score > red → red. */
function bandFor(value: number, bands: ChangeRiskBands): ChangeRiskBand {
  if (value < bands.amber) return 'green';
  if (value <= bands.red) return 'amber';
  return 'red';
}

/** Folds findings into a 0–100 saturating score and maps it to a band. */
export function score(findings: RedFlagFinding[], config: ChangeRiskConfig): ScoreResult {
  const raw = findings.reduce((sum, f) => sum + WEIGHT_POINTS[f.weight], 0);
  const capped = Math.min(100, raw);
  return { score: capped, band: bandFor(capped, config.bands ?? DEFAULT_BANDS) };
}
