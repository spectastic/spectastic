import { findAll, getAttr, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Refuse an unjustified extreme or equal threshold pair (108-success-criteria,
 * T-115, FR-011).
 *
 * 37% of the estate asserts a bare zero. Some are right — one corrupted byte
 * is a defect — and the rest are a reflex that makes a criterion
 * unfalsifiable by construction, since the first occurrence fails it and
 * nobody intends to ship on that basis. The justification separates the two.
 *
 * Extracted from prose with one regex matching "N (target M)" or "N%
 * (target M%)" — the shape every criterion's scale/target pair takes — and
 * flagging when N or M is 0 or 100, or N equals M. Requires a justification=
 * attribute rather than searching for justifying prose anywhere in the
 * element: design.html's own Project structure comment already commits to
 * an attribute, and a prose search would be far less reliable than checking
 * one value is present.
 */
const THRESHOLD_TARGET_PAIR = /(\d+(?:\.\d+)?)\s*%?\s*\(target\s+(\d+(?:\.\d+)?)\s*%?\)/gi;

function needsJustification(text: string): boolean {
  let match: RegExpExecArray | null;
  THRESHOLD_TARGET_PAIR.lastIndex = 0;
  while ((match = THRESHOLD_TARGET_PAIR.exec(text))) {
    const must = Number(match[1]);
    const plan = Number(match[2]);
    if (must === 0 || must === 100 || plan === 0 || plan === 100 || must === plan) return true;
  }
  return false;
}

export const criterionThresholdJustifiedRule: PerFileRule = {
  id: 'criterion-threshold-justified',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'A criterion asserting 0, 100%, or two equal thresholds must carry justification=.',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-criterion')) {
      const p = findAll(el, 'p')[0];
      if (!p) continue;
      const text = textOf(p);
      if (!needsJustification(text)) continue;
      const justification = getAttr(el, 'justification');
      if (justification !== undefined && justification.trim() !== '') continue;
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'criterion-threshold-justified',
        severity: 'error',
        message: `<spec-criterion id="${getAttr(el, 'id') ?? '?'}"> asserts a 0, 100%, or equal threshold with no justification=`,
        fixHint: 'Add justification="…" saying why the extreme is right, e.g. "one corrupted byte is a defect".',
      });
    }
    return findings;
  },
};

/** All descendant text of an element, depth-first. */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { nodeName?: string; value?: string; childNodes?: unknown[] };
    if (n.nodeName === '#text' && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out;
}
