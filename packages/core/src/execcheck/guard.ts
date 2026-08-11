/**
 * The refusals (spec 085, FR-001 / FR-002 / NFR-001).
 *
 * This module is the feature. Executing a recorded command is an exception to
 * P-11 — an artifact's text must be data, "not a channel that instructs the
 * tool reading it" — and P-11 exists because artifacts cross into contexts
 * their author does not control, including npm distribution. A tool that ran
 * commands out of a vendored bundle would be remote code execution.
 *
 * Two independent guards, both mandatory:
 *
 *   consent   — the INVOKING project opted in. An artifact cannot consent on a
 *               reader's behalf; that is the whole content of the constraint.
 *   location  — the artifact is first-party. NOT configurable, deliberately:
 *               a guard a flag can waive is not a guard, and this is the one
 *               protecting the distribution boundary.
 *
 * Everything here is pure and takes no `CommandRunner`. That is not tidiness —
 * it makes "refuses without spawning anything" a structural property rather
 * than a behaviour a test has to watch for, and makes execute-before-guard
 * inexpressible rather than merely discouraged (D-001).
 */

import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Refusal } from './types.js';

/** Directories whose contents are, by definition, somebody else's code. */
const DEPENDENCY_DIRS = new Set(['node_modules', 'vendor', 'bower_components', '.pnpm-store']);

export interface GuardInput {
  /** Absolute or relative path of the artifact whose commands would run. */
  artifactPath: string;
  /** The project doing the invoking. */
  projectRoot: string;
  /**
   * Whether the invoking project's own config enables this. Passed in rather
   * than read here so the guard stays pure and the config shape stays the
   * caller's business.
   */
  consented: boolean;
  /**
   * True when this check is already running inside one of its own executions.
   *
   * Found by running it: 085's own captured entry point was
   * `verify:exec 085`, and since the check executes the entry point, it
   * re-entered itself without bound. Each level is timeout-bounded; the depth
   * is not, which is the part that matters.
   */
  reentrant?: boolean;
}

/**
 * Decide whether these commands may run at all.
 *
 * Returns `null` to permit, or the first `Refusal` that applies. Consent is
 * checked first because it is the cheaper question and the more common answer;
 * neither guard can be traded for the other.
 */
export function guard(input: GuardInput): Refusal | null {
  if (input.reentrant === true) {
    return {
      kind: 'reentrant',
      message:
        'Refusing to run: this check is already executing inside one of its own runs. A captured command that invokes the checker would otherwise recurse without bound.',
    };
  }
  if (!input.consented) {
    return {
      kind: 'no-consent',
      message:
        "Running recorded commands is off by default. Enable it in this project's spectastic.json before asking for it — a tool that gained this on upgrade would be a change nobody agreed to.",
    };
  }

  const root = resolve(input.projectRoot);
  const target = resolve(input.projectRoot, input.artifactPath);
  const rel = relative(root, target);

  // `relative` yields a leading '..' (or an absolute path, across drives) for
  // anything outside root. Checked before the dependency test because an
  // outside path's segments are not this project's to reason about.
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      kind: 'outside-project',
      message: `Refusing to run commands from ${input.artifactPath}: it resolves outside this project. Only artifacts this project authored are executed.`,
    };
  }

  for (const segment of rel.split(sep)) {
    if (DEPENDENCY_DIRS.has(segment)) {
      return {
        kind: 'dependency-path',
        message: `Refusing to run commands from ${input.artifactPath}: it lives under "${segment}". An installed artifact is somebody else's code, and no setting permits running it.`,
      };
    }
  }

  return null;
}
