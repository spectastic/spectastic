import type { Verdict } from './types.js';

/**
 * Serialise the merge verdict deterministically (spec 115, FR-006). Stable key
 * order, trailing newline — the persisted, reconstructable record a reviewer
 * reproduces offline and CI archives beside the retrieval log. Pure.
 */
export function renderVerdict(v: Verdict): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}
