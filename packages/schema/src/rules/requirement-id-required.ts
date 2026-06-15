import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-requirement>` that is missing an `id=` attribute or
 * whose `id=` value does not match the canonical requirement-id pattern
 * (e.g. `FR-001`, `NFR-001`, `REQ-AUTH-001`, `SC-001`, `D-001`).
 * Stable IDs are the spine of traceability across spec, plan, tasks,
 * proposals, and triage cards.
 *
 * Implements FR-010 of specs/002-validate-cli/spec.html.
 */
const REQUIREMENT_ID_PATTERN = /^[A-Z]+-[A-Z]*-?[0-9]+$/;

export const requirementIdRequiredRule: PerFileRule = {
  id: 'requirement-id-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    '<spec-requirement> elements must declare an id= matching ^[A-Z]+-[A-Z]*-?[0-9]+$.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const req of findAll(doc.ast, 'spec-requirement')) {
      const loc = getLocation(req);
      if (!hasAttr(req, 'id')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'requirement-id-required',
          severity: 'error',
          message: '<spec-requirement> missing required id=',
          fixHint:
            'Add id="FR-001" (or NFR-/REQ-/SC-/D- prefix) matching ^[A-Z]+-[A-Z]*-?[0-9]+$.',
        });
        continue;
      }
      const id = getAttr(req, 'id') ?? '';
      if (!REQUIREMENT_ID_PATTERN.test(id)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'requirement-id-required',
          severity: 'error',
          message: `<spec-requirement> id="${id}" does not match ^[A-Z]+-[A-Z]*-?[0-9]+$`,
          fixHint:
            'Use the canonical pattern, e.g. FR-001, NFR-001, REQ-AUTH-001, SC-001, D-001.',
        });
      }
    }
    return findings;
  },
};
