import { findAll, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-out-of-scope> <li>` that does not declare a `defer-to=`
 * attribute. Out-of-scope items convert scope-cuts from loss into
 * deferral; missing the deferral target makes the gesture meaningless.
 *
 * Implements FR-006 of specs/002-validate-cli/spec.html.
 */
export const noMissingDeferToRule: PerFileRule = {
  id: 'no-missing-defer-to',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-out-of-scope> <li> elements must declare a defer-to= attribute.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const block of findAll(doc.ast, 'spec-out-of-scope')) {
      for (const li of findAll(block, 'li')) {
        if (hasAttr(li, 'defer-to')) continue;
        const loc = getLocation(li);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'no-missing-defer-to',
          severity: 'error',
          message: '<spec-out-of-scope> <li> missing required defer-to=',
          fixHint: 'Add defer-to="<sibling-spec-id>", defer-to="TBD-<topic>", or defer-to="never".',
        });
      }
    }
    return findings;
  },
};
