import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

const VALID_VERDICTS = ['split', 'dont-split'] as const;

/**
 * A `<spec-split>` proposal (spec 029-value-ranked-slicer) must declare a
 * <code>data-verdict</code> of <code>split</code> or <code>dont-split</code> —
 * the slicer's first-class outcome (FR-007). The element is generated, so a
 * malformed one signals a renderer bug; flag it loudly rather than letting a
 * verdict-less proposal read as ambiguous.
 */
export const splitWellFormedRule: PerFileRule = {
  id: 'split-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-split> must declare data-verdict="split" or "dont-split".',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-split')) {
      const loc = getLocation(el);
      if (!hasAttr(el, 'data-verdict')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'split-well-formed',
          severity: 'error',
          message: '<spec-split> missing required data-verdict= attribute',
          fixHint: 'Add data-verdict="split" or data-verdict="dont-split".',
        });
        continue;
      }
      const verdict = getAttr(el, 'data-verdict');
      if (!VALID_VERDICTS.includes(verdict as (typeof VALID_VERDICTS)[number])) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'split-well-formed',
          severity: 'error',
          message: `<spec-split> data-verdict="${verdict ?? ''}" is not one of ${VALID_VERDICTS.join(', ')}`,
          fixHint: 'Use data-verdict="split" or data-verdict="dont-split".',
        });
      }
    }
    return findings;
  },
};
