/**
 * The split gate (spec 029-value-ranked-slicer): the two pure predicates that
 * guard when the slicer may act. Kept side-effect-free so they're trivially
 * unit-testable and reusable by both the in-place-append path (FR-008) and the
 * auto-offer (FR-010).
 */

import type { BudgetBand } from '@spectastic/schema';

/**
 * Whether the slicer may append its `<spec-split>` proposal to the parent
 * *in place* (FR-008 / P-6): only a Draft parent. A terminal-state parent
 * (Accepted/Superseded/Deprecated) routes through `/spectastic.propose` instead.
 */
export function canAppendInPlace(status: string | null): boolean {
  return status === 'draft';
}

/**
 * Whether the slicer should auto-offer itself for a spec (FR-010): only when the
 * spec has crossed the red budget band. The offer is still human-confirmed — this
 * predicate decides whether to surface it, never to run.
 */
export function shouldAutoOffer(band: BudgetBand | null): boolean {
  return band === 'red';
}
