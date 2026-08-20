import { findAll, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Refuse a criterion whose actor+outcome clause joins two outcomes with
 * "and" (108-success-criteria, T-112, FR-008).
 *
 * 59% of the estate's existing criteria carry a conjunction, and a criterion
 * joining two outcomes cannot be passed or failed — only half-met, which no
 * gate can act on. Checked against the clause BEFORE the scale's em-dash
 * only: the scale/baseline half of a criterion legitimately says things like
 * "captured and not-captured equals N" without joining two outcomes, and
 * flagging that would punish exactly the honest style this rule exists to
 * encourage.
 */
const EM_DASH_SPLIT = /\s[—-]\s/; // em dash "—" or a spaced hyphen "-"
const BARE_AND = /\band\b/i;

/** All descendant text of an element, depth-first — the same recursive
 *  shape variant-grid.ts's reasonOf() uses for a <spec-context>'s reason. */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { nodeName?: string; value?: string; childNodes?: unknown[] };
    if (n.nodeName === '#text' && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

export const criterionSingleRule: PerFileRule = {
  id: 'criterion-single',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-criterion> must express a single outcome — no conjunction before the scale.',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-criterion')) {
      const p = findAll(el, 'p')[0];
      if (!p) continue;
      const text = textOf(p);
      const clause = text.split(EM_DASH_SPLIT)[0] ?? text;
      if (!BARE_AND.test(clause)) continue;
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'criterion-single',
        severity: 'error',
        message: 'conjunction in the criterion\'s outcome clause — a criterion joining two outcomes cannot be passed or failed',
        fixHint: 'Split into two criteria, one outcome each.',
      });
    }
    return findings;
  },
};
