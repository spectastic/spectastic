import { findAll, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Refuse a criterion carrying no observation mechanism (108-success-criteria,
 * T-111, FR-005).
 *
 * A scale with no meter is a number that looks measurable and isn't — the
 * slot no criterion in the estate has ever carried. Shape-gated on the
 * OBSERVATION rather than the actor: a human-observed criterion names its
 * sampling frame under "Meter"; a mechanically-observed one names its
 * observation point under "Observed at" and carries no sampling frame,
 * because demanding one there would invent a review log nobody keeps. Either
 * label satisfies this rule — which one applies is the author's call, not
 * this rule's.
 */
function summaryTextOf(details: Element): string {
  const summary = findAll(details, 'summary')[0];
  return summary ? textContentOf(summary).trim().toLowerCase() : '';
}

/** An element's own text, direct children only — the same shape
 *  variant-grid.ts's unexported reasonOf() uses; a summary's text never
 *  nests further than this. */
function textContentOf(el: Element): string {
  let out = '';
  for (const child of el.childNodes ?? []) {
    const node = child as { nodeName?: string; value?: string };
    if (node.nodeName === '#text' && typeof node.value === 'string') out += node.value;
  }
  return out;
}

export const criterionObservableRule: PerFileRule = {
  id: 'criterion-observable',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-criterion> must carry a Meter or an Observed-at block.',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-criterion')) {
      const hasObservation = findAll(el, 'details').some((d) => {
        const label = summaryTextOf(d);
        return label === 'meter' || label === 'observed at';
      });
      if (hasObservation) continue;
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'criterion-observable',
        severity: 'error',
        message: '<spec-criterion> carries no observation mechanism — no Meter and no Observed-at block',
        fixHint:
          'Add <details><summary>Meter</summary>…</details> for a human-sampled observation, or <summary>Observed at</summary> for a mechanical one.',
      });
    }
    return findings;
  },
};
