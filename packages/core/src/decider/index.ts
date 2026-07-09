/**
 * Public surface of the Decider abstraction (spec 033-decider-effort).
 * A verb-agnostic checkpoint role over AIProvider; propose is the first adopter,
 * the 035 rollout wires the rest.
 */

export type {
  DeciderRole,
  EffortLevel,
  DeciderConfig,
  Finding,
  Verdict,
} from './types.js';
export { resolveDecider, decide } from './decider.js';
export type { DecideRequest } from './decider.js';
export { effortToDepth, DEFAULT_EFFORT, VOTER_CAP } from './effort.js';
export type { EffortDepth } from './effort.js';
export { LENSES, runCritic, arbitrateCategorical, median, parseFindings } from './panel.js';
export { resolveEffort } from './auto.js';
export type { RequestedEffort, EffortSignal, ResolvedEffort } from './auto.js';
export { decideChoice } from './choice.js';
