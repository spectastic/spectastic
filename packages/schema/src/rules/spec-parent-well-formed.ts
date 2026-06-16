import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

const SPEC_ID = /^[0-9]+-[a-z][a-z0-9-]*$/;

/**
 * Validate that every `<spec-parent>` element declares a well-formed
 * `specid=` attribute matching the spec-id format
 * (`<digits>-<lower-kebab>`).
 *
 * Companion to [[no-broken-defer-to]]: that rule checks the parent's
 * outbound reference (`defer-to="<child-id>"`) into the child; this rule
 * checks the child's inbound reference (`specid="<parent-id>"`) back at
 * the parent.
 *
 * Together the two rules form the practical lower bound on parent / child
 * slicing consistency. Strict cross-file reciprocity (every
 * `<spec-parent specid="X">` paired with a `defer-to="<this-spec-id>"`
 * inside X) is a follow-up requiring richer test fixtures and is
 * tracked as a slicing-gaps register entry.
 *
 * Closes one of the slicing-gaps surfaced by the 16 Jun 2026 audit.
 */
export const specParentWellFormedRule: PerFileRule = {
  id: 'spec-parent-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-parent> must declare a non-empty specid= attribute matching the spec-id format.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-parent')) {
      const loc = getLocation(el);
      if (!hasAttr(el, 'specid')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'spec-parent-well-formed',
          severity: 'error',
          message: '<spec-parent> missing required specid= attribute',
          fixHint:
            'Add specid="<parent-spec-id>", e.g. specid="004-npm-publish-workflow".',
        });
        continue;
      }
      const value = getAttr(el, 'specid');
      if (value === undefined || value === '') {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'spec-parent-well-formed',
          severity: 'error',
          message: '<spec-parent> specid= attribute is empty',
          fixHint:
            'Use specid="<parent-spec-id>", e.g. specid="004-npm-publish-workflow".',
        });
        continue;
      }
      if (!SPEC_ID.test(value)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'spec-parent-well-formed',
          severity: 'error',
          message: `<spec-parent> specid="${value}" does not match the spec-id format`,
          fixHint: 'Spec IDs are <digits>-<lower-kebab>, e.g. 001-auth-service, 004-npm-publish-workflow.',
        });
      }
    }
    return findings;
  },
};
