/**
 * The Decider abstraction (spec 033-decider-effort). A checkpoint consults a
 * configured Decider instead of a hard-coded reviewer; the role is backed by the
 * existing AIProvider (ask = human, subagent = agent/panel).
 */

/** Who resolves a checkpoint (spec FR-001). */
export type DeciderRole = 'human' | 'agent' | 'panel';

/** How deep the decider goes (spec FR-004). */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Resolved config for a checkpoint's decider. */
export interface DeciderConfig {
  role: DeciderRole;
  effort: EffortLevel;
}

/** A single categorical finding a critic can raise (e.g. a risk). */
export interface Finding {
  target: string;
  concern: string;
  /** The lens/perspective the critic judged from (spec FR-007). */
  lens?: string;
}

/**
 * A decider's decision + grounds, recorded on the touched register (spec FR-009).
 * `survivors` are the findings that cleared arbitration; `tally` is the grounds
 * (e.g. "raised by 2/3 critics").
 */
export interface Verdict {
  role: DeciderRole;
  effort: EffortLevel;
  /** Number of critic invocations that ran (1 for agent; N for panel). */
  voters: number;
  survivors: Finding[];
  /** Human-readable grounds, one line per surviving finding. */
  tally: string[];
  /** True when a guardrail forced the decision to a human (spec FR-008). */
  escalatedToHuman: boolean;
}
