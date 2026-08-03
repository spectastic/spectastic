/**
 * Choosing what may be executed (spec 085, FR-003 / FR-004 / FR-007).
 *
 * Three typed fields, never the demo. The demo is specified to be prose and is
 * the one field where a click-path or "open it and check the card is not
 * clipped" is the honest answer; executing it would force every author to make
 * it a command, which is the opposite of what the format decided.
 */

import type { CapturedRun } from '../types.js';
import type { ExecField, FieldResult } from './types.js';

/** The fields this check will ever touch, in execution order. */
export const EXECUTABLE_FIELDS: readonly ExecField[] = ['run', 'exercise', 'tests'];

// An entry point may legitimately be an address rather than a command (083
// FR-002): where `run` already serves the feature, the useful value is where to
// go, not what to type.
const URL_RE = /^(?:https?:\/\/|localhost[:/]|\/\/)/i;
const NAVIGATION_RE = /^(?:open|visit|browse|navigate)\s+(?:https?:\/\/|localhost|\/)/i;

/**
 * True when a captured entry point is an address, not something to run.
 *
 * A heuristic, and D-003 accepts that it will occasionally be wrong. Being
 * wrong here surfaces as an ordinary failure with the command's output
 * attached — noisy and diagnosable, rather than silent.
 */
export function isAddress(value: string): boolean {
  const v = value.trim();
  return URL_RE.test(v) || NAVIGATION_RE.test(v);
}

/**
 * What to do with each field, before anything runs.
 *
 * A field resolving to `passed` is never produced here — that requires actually
 * running it. Everything this returns is either a decision not to run, or a
 * command handed on to the runner.
 */
export function planFields(captured: CapturedRun | undefined): {
  toRun: { field: ExecField; command: string }[];
  decided: FieldResult[];
} {
  const c = captured ?? {};
  const toRun: { field: ExecField; command: string }[] = [];
  const decided: FieldResult[] = [];

  // A block marked suggested never claimed its commands work (021 T-003), so
  // running them would test a promise nobody made (FR-007).
  if (c.verified === false) {
    for (const field of EXECUTABLE_FIELDS) {
      decided.push({
        field,
        outcome: 'skipped',
        reason: 'the block is marked suggested — these commands were authored, not run',
      });
    }
    return { toRun, decided };
  }

  for (const field of EXECUTABLE_FIELDS) {
    const value = c[field];
    if (value === undefined || value.trim() === '') {
      decided.push({ field, outcome: 'absent' });
      continue;
    }
    if (field === 'exercise' && isAddress(value)) {
      decided.push({
        field,
        outcome: 'skipped',
        command: value,
        reason: 'the entry point is an address, not a command',
      });
      continue;
    }
    toRun.push({ field, command: value });
  }

  return { toRun, decided };
}
