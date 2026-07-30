import { findAll, getLocation } from '../parser.js';
import type { Finding, PerFileRule, Severity } from '../types.js';

/**
 * Flag any `<spec-question>` admonition present in the document. Open
 * questions surfaced at the prose level signal that the interview phase
 * did not exhaust the decidable questions — they must be resolved before
 * a spec is accepted.
 *
 * Severity is status-dependent: `error` once the doc reaches `accepted`,
 * `warning` while it is still `draft` or `review`, and skipped otherwise.
 *
 * Note: `<spec-question>` (singular) is the typed admonition; the plural
 * `<spec-questions>` is a register container and does not fire this rule.
 *
 * Implements FR-007 of specs/002-validate-cli/spec.html.
 */
export const noUnresolvedQuestionRule: PerFileRule = {
  id: 'no-unresolved-question',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-question> admonitions must be resolved before a spec is accepted.',
  check({ doc }) {
    const severity = severityForStatus(doc.status);
    if (severity === undefined) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-question')) {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'no-unresolved-question',
        severity,
        message: 'Unresolved <spec-question> admonition in document.',
        fixHint:
          'Resolve the open question during the interview phase, or move it into the <spec-questions> register with a tracked decision path.',
      });
    }
    return findings;
  },
};

/**
 * Map a document status to the severity this rule should emit. Returns
 * `undefined` when no finding should be produced (status absent or not
 * one this rule scores).
 */
function severityForStatus(status: string | undefined): Severity | undefined {
  if (status === 'accepted') return 'error';
  if (status === 'draft' || status === 'review') return 'warning';
  return undefined;
}
