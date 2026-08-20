/**
 * Public surface of the Decider abstraction (spec 033-decider-effort).
 * A verb-agnostic checkpoint role over AIProvider; propose is the first adopter,
 * the 035 rollout wires the rest.
 */

export type { EffortSignal, RequestedEffort, ResolvedEffort } from './auto.js';
export { resolveEffort } from './auto.js';
export { decideChoice } from './choice.js';
export type { DecideRequest } from './decider.js';
export { decide, resolveDecider } from './decider.js';
export type { EffortDepth } from './effort.js';
export { DEFAULT_EFFORT, effortToDepth, VOTER_CAP } from './effort.js';
export {
  arbitrateCategorical,
  CRITERION_LENSES,
  gradeCriteria,
  gradeCriterion,
  LENSES,
  median,
  parseFindings,
  runCritic,
} from './panel.js';
export type { CriterionLens } from './panel.js';
export { answerDecisions, DECISION_TAXONOMY } from './taxonomy.js';
export type {
  DeciderConfig,
  DeciderRole,
  EffortLevel,
  Finding,
  Verdict,
} from './types.js';
