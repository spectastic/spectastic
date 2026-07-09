/**
 * Auto effort resolution (spec 034-effort-auto). Turns `--effort=auto` — the new
 * default — into a concrete level from a verb-agnostic risk signal, clamped to a
 * floor. Pure and deterministic (NFR-001): same signal + floor → same result.
 *
 * `auto`'s depth effect lands on `panel` deciders (a panel is sized by its
 * effort level); an `agent` is always a single critic, so for the agent path the
 * resolved level is recorded for audit (FR-005) without changing the voter count.
 * An explicit level always short-circuits (FR-004).
 */

import type { EffortLevel } from './types.js';

/** What a caller may request: a fixed level, or `auto` to derive one. */
export type RequestedEffort = EffortLevel | 'auto';

/** The verb-agnostic risk signal `auto` reads (spec FR-002). A verb fills it in. */
export interface EffortSignal {
  /** Irreversible / high-stakes change (propose: removed-op or must-tier). */
  irreversible: boolean;
  /** How broadly the change spreads (propose: distinct topic-prefix count). */
  breadth: number;
}

const ORDER: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The higher of two levels (the floor clamp, FR-003). */
function higher(a: EffortLevel, b: EffortLevel): EffortLevel {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export interface ResolvedEffort {
  level: EffortLevel;
  /** One-line audit of how the level was chosen (spec FR-005). */
  reason: string;
}

/**
 * Resolve a requested effort to a concrete level + reason.
 *   - an explicit level wins outright (FR-004);
 *   - `auto` maps irreversible → high, breadth ≥ 2 → medium, else the floor;
 *   - the result is clamped to be no lower than the floor (FR-003).
 * A null signal (FR-006, unknown verb) resolves to the floor.
 */
export function resolveEffort(
  requested: RequestedEffort,
  signal: EffortSignal | null,
  floor: EffortLevel = 'low',
): ResolvedEffort {
  if (requested !== 'auto') {
    return { level: requested, reason: 'explicit' };
  }
  if (!signal) {
    return { level: floor, reason: 'auto: no signal → floor' };
  }
  let derived: EffortLevel;
  let reason: string;
  if (signal.irreversible) {
    derived = 'high';
    reason = 'auto: irreversible (removed-op / must-tier)';
  } else if (signal.breadth >= 2) {
    derived = 'medium';
    reason = 'auto: breadth ≥ 2 topic prefixes';
  } else {
    derived = floor;
    reason = 'auto: no risk signal → floor';
  }
  return { level: higher(derived, floor), reason };
}
