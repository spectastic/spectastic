import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-delta>` that is missing an `op=` attribute or carries an
 * `op=` value outside the allowed set. The op verb is what makes a delta
 * machine-applicable; without a recognised verb the change proposal can't
 * be folded back into the live spec.
 *
 * Implements FR-008 of specs/002-validate-cli/spec.html.
 */
const ALLOWED_OPS = new Set(['added', 'modified', 'removed', 'renamed']);

export const deltaOpRequiredRule: PerFileRule = {
  id: 'delta-op-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-delta> elements must declare op= with one of: added, modified, removed, renamed.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const delta of findAll(doc.ast, 'spec-delta')) {
      const loc = getLocation(delta);
      if (!hasAttr(delta, 'op')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'delta-op-required',
          severity: 'error',
          message: '<spec-delta> missing required op= attribute',
          fixHint: 'Add op="added", op="modified", op="removed", or op="renamed".',
        });
        continue;
      }
      const op = getAttr(delta, 'op') ?? '';
      if (!ALLOWED_OPS.has(op)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'delta-op-required',
          severity: 'error',
          message: `<spec-delta> has invalid op="${op}"; expected one of: added, modified, removed, renamed`,
          fixHint: 'Change op= to one of: added, modified, removed, renamed.',
        });
      }
    }
    return findings;
  },
};
