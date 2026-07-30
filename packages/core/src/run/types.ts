/**
 * Types for the hands-off pipeline (spec 037). `runPipeline` is a driver over an
 * ordered list of injected `PipelineStep`s: it answers each generation step's
 * decisions through the Decider, runs the step, gates on validate, and yields a
 * human checkpoint before implement (and, under `--checkpoints=each`, after each
 * generative verb). The steps are injected so the driver's logic — order, gate,
 * escalation, decision-answering — is unit-tested with fakes; the real steps wire
 * the verb kernels (038 drainTasks / 039 answerDecisions / plan / tasks / verify).
 */

import type { DeciderConfig } from '../decider/types.js';
import type { AIProvider } from '../types.js';

/** A human checkpoint the run yields between phases (FR-006/FR-007). */
export interface Checkpoint {
  /** The step about to run. */
  phase: string;
  /** Why the human is being asked (a planned gate, or a validate/irreversible escalation). */
  reason: string;
}

/** The caller resolves a checkpoint: continue the run, or stop it (a hard gate — NFR-002). */
export type EscalateFn = (checkpoint: Checkpoint) => Promise<'approve' | 'stop'>;

/** What a step reports back to the driver. */
export interface StepOutcome {
  /** Error-severity validate findings — non-empty halts the run (FR-001). */
  findings?: string[];
  /** For the implement drain: set when it halted on an unverified task (038). */
  halted?: { taskId: string; reason: string };
}

/** One phase of the run. The driver answers `decisionVerb`'s decisions and passes them to `run`. */
export interface PipelineStep {
  name: 'plan' | 'tasks' | 'implement' | 'verify';
  /** The 039 verb whose bounded decisions the driver answers before running this step (if any). */
  decisionVerb?: string;
  /** Execute the step (write the artifact, run validate); receives the answered decisions. */
  run(args: { decisions: Record<string, string> }): Promise<StepOutcome>;
}

export interface RunInput {
  specId: string;
  /** The resolved Decider (role must not be `human` — unattended). */
  decider: DeciderConfig;
  /** Planned-gate granularity (FR-007). */
  checkpoints: 'minimal' | 'each';
}

export interface RunContext {
  ai: AIProvider;
  /** The ordered steps to drive — real (kernel-wiring) or fake (tests). */
  steps: ReadonlyArray<PipelineStep>;
  /** How the run surfaces a checkpoint to a human (the CLI raises AskUserQuestion; tests record). */
  escalate: EscalateFn;
  /**
   * Optional per-run cost budget (spec 040). When set, the run degrades the
   * Decider effort at 80% of the ceiling and halts + escalates at 100%. Absent ⇒
   * the run is unchanged (040 FR-004). Its `record` is fed by a `budgeted(ai)` wrap.
   */
  budget?: import('./budget.js').BudgetTracker;
}

export interface RunResult {
  /** True when every step ran clean to the end. */
  completed: boolean;
  /** The step names that ran, in order. */
  ranSteps: string[];
  /** The decisions the Decider answered, per step (the audit trail, NFR-001). */
  decisions: Record<string, Record<string, string>>;
  /** Set when the run halted — a validate error, a drain halt, or a human "stop". */
  halted?: { phase: string; reason: string };
}
