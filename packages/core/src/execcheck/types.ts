/**
 * Verdicts for the captured-command check (spec 085, D-002).
 *
 * `skipped` and `absent` are deliberately NOT `passed`. Collapsing them would
 * let a run that examined nothing report green — which, for a check whose only
 * value is honesty about staleness, is the one bug that makes it worse than
 * useless.
 */

/** Which captured field an outcome belongs to. Never `demo` — that is prose. */
export type ExecField = 'run' | 'exercise' | 'tests';

export type Outcome =
  /** Ran, exit 0. */
  | 'passed'
  /** Ran, non-zero exit. */
  | 'failed'
  /** Exceeded the limit and was terminated (distinct from `failed`). */
  | 'timed-out'
  /** Deliberately not attempted — an address, or a suggested block. */
  | 'skipped'
  /** Nothing was captured for this field. */
  | 'absent';

export interface FieldResult {
  field: ExecField;
  outcome: Outcome;
  /** The command as captured, when there was one. */
  command?: string;
  /** Why it was skipped — required whenever `outcome` is `skipped`. */
  reason?: string;
  /** The command's own output, so a failure is diagnosable without a re-run. */
  output?: string;
  exitCode?: number;
}

export interface SpecVerdict {
  specId: string;
  results: FieldResult[];
  /** True when nothing failed or timed out. Skips do not make it false. */
  ok: boolean;
}

/** Why a check refused before anything ran. */
export type RefusalKind = 'no-consent' | 'outside-project' | 'dependency-path' | 'reentrant';

export interface Refusal {
  kind: RefusalKind;
  message: string;
}

/**
 * The process runner, injected. Only this crosses into the OS — which is what
 * lets every refusal path be tested with no runner supplied at all (NFR-001).
 */
export interface CommandRunner {
  (command: string, opts: { cwd: string; timeoutMs: number }): Promise<{
    exitCode: number;
    output: string;
    timedOut: boolean;
  }>;
}
