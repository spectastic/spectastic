import { findAll, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Refuse a criterion carrying an RFC 2119 keyword (108-success-criteria,
 * T-113, FR-009).
 *
 * The indicative mood is the point: "reviewers confirm…", not "the system
 * MUST allow reviewers to confirm…". Checked as one whole-subtree text scan
 * for an UPPERCASE MUST/SHOULD/MAY — a <spec-rule>MUST</spec-rule> nested
 * anywhere inside a criterion is caught the same way, since its own text is
 * that same uppercase word; no separate element-shape check is needed.
 * Case-sensitive on purpose: a lowercase "must" is ordinary English inside a
 * falsifying-observation sentence and is not this rule's concern.
 */
const RFC2119_KEYWORD = /\b(MUST|SHOULD|MAY)\b/;

/** All descendant text of an element, depth-first, original case preserved. */
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

export const criterionIndicativeRule: PerFileRule = {
  id: 'criterion-indicative',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-criterion> must not use an RFC 2119 keyword (MUST/SHOULD/MAY).',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-criterion')) {
      const match = RFC2119_KEYWORD.exec(textOf(el));
      if (!match) continue;
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'criterion-indicative',
        severity: 'error',
        message: `<spec-criterion> uses the RFC 2119 keyword "${match[1]}" — a criterion is an observation, not an obligation`,
        fixHint:
          'Rewrite in the indicative: "reviewers confirm…", not "…MUST allow reviewers to confirm…". An author reaching for MUST has written a requirement.',
      });
    }
    return findings;
  },
};
