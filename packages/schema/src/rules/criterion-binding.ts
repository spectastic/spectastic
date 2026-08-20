/**
 * Forward-only binding for the six criterion rules (spec 108-success-criteria,
 * T-310, FR-013).
 *
 * 382 criteria at 2% conformance is not a backlog anyone fixes in one pass,
 * and a gate that fails the whole estate on day one is a gate somebody
 * disables. 108 has no version line of its own to bind from — it amends
 * 091's requirements, not principles.html, whose version only moves when a
 * principle itself changes. The floor is the spec's own leading number
 * instead, the exact mechanism `verify-view-missing` already uses for this
 * same retrofit-fairness problem: a spec below the floor predates the
 * convention and is exempt; one at or above it is expected to comply.
 *
 * Not itself a registered rule — a guard the six gating rules each call at
 * the top of their own `check()`, since this schema engine has no built-in
 * way for one rule to suppress another's findings.
 */
const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;

/** The spec number this contract binds from. Specs below this number
 *  predate the criterion contract and are exempt. */
export const CRITERION_CONTRACT_FLOOR = 108;

/** Leading numeric id of a spec dir, e.g. "032-triage-fanout" → 32; null for
 *  a file with no owning spec (a template, a fixture, a doc). */
function specNum(file: string): number | null {
  const m = SPEC_FILE.exec(file);
  if (!m?.[1]) return null;
  const n = /^(\d+)/.exec(m[1]);
  return n ? Number.parseInt(n[1]!, 10) : null;
}

/** Whether the six criterion rules apply to this file. A file with no
 *  owning spec number (a fixture used by these very rules' own tests, a
 *  template) is treated as bound — the contract should hold on data with
 *  nothing to exempt it, and every fixture in this repo authors compliant
 *  criteria anyway. */
export function isBoundByCriterionContract(file: string): boolean {
  const n = specNum(file);
  return n === null || n >= CRITERION_CONTRACT_FLOOR;
}
