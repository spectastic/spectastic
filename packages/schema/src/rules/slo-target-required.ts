import { findAll, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-slo>` element that does not declare a `target=`
 * attribute. An SLO without a target refines nothing — the reader can't
 * tell which NFR it belongs to and neither can any downstream consumer
 * (e.g. the future verify-page observables trace, TBD-verify-slo-trace).
 *
 * Implements FR-002 of specs/047-slo-nfr-artifact/spec.html.
 */
export const sloTargetRequiredRule: PerFileRule = {
  id: 'slo-target-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-slo> elements must declare a target= attribute.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const slo of findAll(doc.ast, 'spec-slo')) {
      if (hasAttr(slo, 'target')) continue;
      const loc = getLocation(slo);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'slo-target-required',
        severity: 'error',
        message: '<spec-slo> missing required target=',
        fixHint: 'Add target="NFR-NNN" pointing at the NFR requirement this SLO refines.',
      });
    }
    return findings;
  },
};
