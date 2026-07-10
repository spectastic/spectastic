import type { FileWriteDecision } from './types.js';

/**
 * Conflict-resolution prompt loop.
 *
 * Per FR-003 + FR-004 + FR-005 of specs/003-init-node-port/spec.html
 * and D-002 of the plan: in TTY, prompt per-file with [y/N/a/s]; with
 * --force, skip prompts and overwrite everything; in non-TTY without
 * --force, refuse with NonTTYConflictError so the action handler can
 * exit 2 with a clear message.
 *
 * Decision logic lives in pure `applyAnswer` (unit-testable). I/O
 * lives in `resolveConflicts` (smoke-tested). @clack/prompts is
 * dynamically imported so the no-conflict path doesn't pay its cost.
 */

export type ConflictAnswer = 'y' | 'N' | 'a' | 's';

export interface LoopMode {
  allOverwrite: boolean;
  allSkip: boolean;
}

export interface ResolveOptions {
  force?: boolean;
}

/**
 * Pure: given a conflict, an answer, and the current loop mode, mutate
 * the conflict's action and return the (possibly new) loop mode.
 * Independent of any I/O; trivially unit-testable.
 */
export function applyAnswer(
  conflict: FileWriteDecision,
  answer: ConflictAnswer,
  mode: LoopMode,
): LoopMode {
  if (mode.allOverwrite) {
    conflict.action = 'overwrite';
    return mode;
  }
  if (mode.allSkip) {
    conflict.action = 'skip';
    return mode;
  }
  switch (answer) {
    case 'y':
      conflict.action = 'overwrite';
      return mode;
    case 'N':
      conflict.action = 'skip';
      return mode;
    case 'a':
      conflict.action = 'overwrite';
      return { allOverwrite: true, allSkip: false };
    case 's':
      conflict.action = 'skip';
      return { allOverwrite: false, allSkip: true };
  }
}

/**
 * Apply --force: every conflict becomes "overwrite". Pure; testable.
 */
export function applyForce(conflicts: FileWriteDecision[]): void {
  for (const c of conflicts) c.action = 'overwrite';
}

/**
 * Interactively choose a profile (spec 041, FR-005) when `init` is run with no
 * `--profile` flag in a TTY. Returns the chosen name, or null if the user
 * declines / cancels (init then proceeds with no profile). @clack is imported
 * lazily so the flag-driven path never pays its cost.
 */
export async function selectProfile(names: string[]): Promise<string | null> {
  if (names.length === 0) return null;
  const p = await import('@clack/prompts');
  const choice = await p.select({
    message: 'Choose a project profile (or Skip):',
    options: [
      ...names.map((n) => ({ value: n, label: n })),
      { value: '__skip__', label: 'Skip — no profile' },
    ],
    initialValue: names.includes('standard') ? 'standard' : names[0],
  });
  if (p.isCancel(choice) || choice === '__skip__') return null;
  return choice as string;
}

export class NonTTYConflictError extends Error {
  constructor(public readonly conflictCount: number) {
    super(
      `init: ${conflictCount} existing file(s) in destination but no TTY for prompts; pass --force to overwrite or remove the files first.`,
    );
  }
}

export class UserCancelError extends Error {
  constructor() {
    super('init: cancelled by user');
  }
}

/**
 * Drive the prompt loop with real I/O. Mutates `conflicts` in place.
 * Throws NonTTYConflictError or UserCancelError on the edge cases so
 * the action handler can map them to exit codes.
 */
export async function resolveConflicts(
  conflicts: FileWriteDecision[],
  options: ResolveOptions = {},
): Promise<void> {
  if (conflicts.length === 0) return;

  if (options.force) {
    applyForce(conflicts);
    return;
  }

  if (!process.stdin.isTTY) {
    throw new NonTTYConflictError(conflicts.length);
  }

  const p = await import('@clack/prompts');
  let mode: LoopMode = { allOverwrite: false, allSkip: false };

  for (const conflict of conflicts) {
    if (mode.allOverwrite) {
      conflict.action = 'overwrite';
      continue;
    }
    if (mode.allSkip) {
      conflict.action = 'skip';
      continue;
    }

    const answer = await p.select({
      message: `Conflict: ${conflict.destination} exists`,
      options: [
        { value: 'N' as const, label: 'Skip this file (default)' },
        { value: 'y' as const, label: 'Overwrite this file' },
        { value: 'a' as const, label: 'Overwrite ALL remaining' },
        { value: 's' as const, label: 'Skip ALL remaining' },
      ],
      initialValue: 'N' as const,
    });

    if (p.isCancel(answer)) {
      throw new UserCancelError();
    }

    mode = applyAnswer(conflict, answer as ConflictAnswer, mode);
  }
}
