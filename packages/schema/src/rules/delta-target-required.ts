import { findAll, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-delta>` element that does not declare a `target=`
 * attribute. A delta without a target points at nothing — the change
 * proposal can't be applied because the apply step doesn't know what
 * to modify.
 *
 * Implements FR-008 of specs/002-validate-cli/spec.html.
 */
export const deltaTargetRequiredRule: PerFileRule = {
  id: 'delta-target-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-delta> elements must declare a target= attribute.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const delta of findAll(doc.ast, 'spec-delta')) {
      if (hasAttr(delta, 'target')) continue;
      const loc = getLocation(delta);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'delta-target-required',
        severity: 'error',
        message: '<spec-delta> missing required target=',
        fixHint: 'Add target="<requirement-or-section-id>" identifying what this delta modifies.',
      });
    }
    return findings;
  },
};
