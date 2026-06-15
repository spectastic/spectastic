import { findAll, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-risk>` element that does not declare a `target=`
 * attribute. Risks without a target point at nothing; the gate that
 * blocks `/spectastic.apply` on identified risks can't reason about
 * what's at stake without one.
 *
 * Implements FR-009 of specs/002-validate-cli/spec.html.
 */
export const riskTargetRequiredRule: PerFileRule = {
  id: 'risk-target-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-risk> elements must declare a target= attribute.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const risk of findAll(doc.ast, 'spec-risk')) {
      if (hasAttr(risk, 'target')) continue;
      const loc = getLocation(risk);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'risk-target-required',
        severity: 'error',
        message: '<spec-risk> missing required target=',
        fixHint: 'Add target="<REQ-ID>" pointing at the requirement, delta, or artifact the risk threatens.',
      });
    }
    return findings;
  },
};
