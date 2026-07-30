import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Valid `status=` values for a `<spec-risk>` element. Mirrors the
 * lifecycle pills documented for the risk register.
 */
const VALID_STATUSES = new Set(['identified', 'accepted', 'mitigated', 'rejected', 'no-value-found']);

/**
 * Flag any `<spec-risk>` element that is missing a `status=` attribute,
 * or whose `status=` value is not one of the known lifecycle pills.
 * Without a status, a risk cannot gate apply or be tracked through
 * accept/mitigate/reject — it's noise instead of an artifact.
 *
 * Implements FR-009 of specs/002-validate-cli/spec.html.
 */
export const riskStatusRequiredRule: PerFileRule = {
  id: 'risk-status-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-risk> elements must declare a status= attribute with a known lifecycle value.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const risk of findAll(doc.ast, 'spec-risk')) {
      const loc = getLocation(risk);
      if (!hasAttr(risk, 'status')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'risk-status-required',
          severity: 'error',
          message: '<spec-risk> missing required status= attribute',
          fixHint: 'Add status="identified" (or accepted, mitigated, rejected, no-value-found).',
        });
        continue;
      }
      const value = getAttr(risk, 'status') ?? '';
      if (!VALID_STATUSES.has(value)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'risk-status-required',
          severity: 'error',
          message: `<spec-risk> has invalid status="${value}"`,
          fixHint: 'Use one of: identified, accepted, mitigated, rejected, no-value-found.',
        });
      }
    }
    return findings;
  },
};
