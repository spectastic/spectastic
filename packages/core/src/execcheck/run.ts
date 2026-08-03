/**
 * Executing the planned commands (spec 085, FR-005 / FR-006 / FR-008).
 *
 * Deliberately dull. The judgment lives in `guard.ts` and `select.ts`; by the
 * time control reaches here, the decision to run has already been made and
 * bounded. All this adds is a limit and a verdict.
 */

import { guard, type GuardInput } from './guard.js';
import { planFields } from './select.js';
import type { CommandRunner, FieldResult, Refusal, SpecVerdict } from './types.js';
import type { CapturedRun } from '../types.js';

/** No more than five minutes per command (NFR-002) unless told otherwise. */
export const DEFAULT_TIMEOUT_MS = 300_000;

export interface CheckInput extends GuardInput {
  specId: string;
  captured: CapturedRun | undefined;
  runner: CommandRunner;
  timeoutMs?: number;
  cwd?: string;
}

/**
 * Guard, plan, then run — and return either a refusal or a verdict.
 *
 * The union return is the point: a refusal is not a failed check, it is a check
 * that never happened, and a caller that conflates the two would report "all
 * clear" for an artifact it declined to look at.
 */
export async function checkSpec(input: CheckInput): Promise<{ refusal: Refusal } | { verdict: SpecVerdict }> {
  const refusal = guard(input);
  if (refusal !== null) return { refusal };

  const { toRun, decided } = planFields(input.captured);
  const results: FieldResult[] = [...decided];
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = input.cwd ?? input.projectRoot;

  for (const { field, command } of toRun) {
    const r = await input.runner(command, { cwd, timeoutMs });
    results.push({
      field,
      command,
      // A timeout is reported apart from a failure: "it broke" and "it never
      // finished" call for different fixes, and collapsing them hides which.
      outcome: r.timedOut ? 'timed-out' : r.exitCode === 0 ? 'passed' : 'failed',
      output: r.output,
      exitCode: r.exitCode,
    });
  }

  // Order the report by field rather than by completion, so two runs of an
  // unchanged spec read identically.
  const order = { run: 0, exercise: 1, tests: 2 } as const;
  results.sort((a, b) => order[a.field] - order[b.field]);

  // Skips and absences never make a verdict fail — only something that ran and
  // did not succeed (D-002).
  const ok = !results.some((r) => r.outcome === 'failed' || r.outcome === 'timed-out');
  return { verdict: { specId: input.specId, results, ok } };
}

/** One line per field, for a report a human reads rather than parses. */
export function formatVerdict(v: SpecVerdict): string[] {
  return v.results.map((r) => {
    const head = `  ${r.outcome.padEnd(9)} ${r.field.padEnd(8)}`;
    if (r.outcome === 'absent') return `${head} (nothing captured)`;
    if (r.outcome === 'skipped') return `${head} ${r.reason ?? ''}`;
    return `${head} ${r.command ?? ''}`;
  });
}
