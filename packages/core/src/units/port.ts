/**
 * The workspace port (spec 079-unit-dependency-edge, design D-001).
 *
 * Everything that touches a filesystem sits behind this interface, so the edge
 * algebra in `resolve.ts` stays pure and testable with plain objects rather
 * than a fixture directory per case. That separation is the whole point of the
 * decision: the marks are a small state matrix that must be exactly right, and
 * the variety lives in acquisition, not in the rules.
 *
 * No filesystem types appear in any signature here — an implementation may read
 * a directory, and a test may return literals.
 */

import type { FarEndVerdict, WorkspaceUnit } from './types.js';

export interface WorkspacePort {
  /**
   * Every unit this project contains, as its own manifests declare them.
   * An empty list is a legitimate answer (a single-module project); it is not
   * an error and must not be reported as one.
   */
  units(): readonly WorkspaceUnit[];

  /**
   * What the far end of a declared edge says about the depending unit.
   *
   * Returns `unreadable` for every ordinary failure — absent checkout, no
   * permission, malformed config — because "I could not check" is the finding,
   * not an exception (FR-005). An implementation MUST NOT throw, and MUST NOT
   * follow a path outside the checkout it was given.
   */
  farEnd(targetCoordinate: string, dependingCoordinate: string): FarEndVerdict;
}
