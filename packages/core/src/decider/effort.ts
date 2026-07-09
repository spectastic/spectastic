/**
 * The effort → decider-depth table (spec 033-decider-effort FR-004 / NFR-001).
 * Scales the *decider's* depth only; fan-out width + loop depth are deferred
 * (spec §3). Default level is `medium` (a single vote — parity with today's
 * one-shot critic). The voter cap is a hard 5 (NFR-001).
 */

import type { EffortLevel } from './types.js';

export interface EffortDepth {
  /** How many critic invocations the panel runs. */
  voters: number;
  /** Whether a dedicated arbiter agent resolves the panel. */
  arbiter: boolean;
  /** Whether a completeness critic runs after arbitration. */
  completenessCritic: boolean;
}

export const VOTER_CAP = 5;

const TABLE: Record<EffortLevel, EffortDepth> = {
  low: { voters: 1, arbiter: false, completenessCritic: false },
  medium: { voters: 1, arbiter: false, completenessCritic: false },
  high: { voters: 3, arbiter: false, completenessCritic: false },
  xhigh: { voters: 5, arbiter: true, completenessCritic: true },
  max: { voters: 5, arbiter: true, completenessCritic: true },
};

/** Map an effort level to its decider depth, clamped to the voter cap. */
export function effortToDepth(level: EffortLevel): EffortDepth {
  const d = TABLE[level];
  return { ...d, voters: Math.min(d.voters, VOTER_CAP) };
}

export const DEFAULT_EFFORT: EffortLevel = 'medium';
