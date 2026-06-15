import { findAll, getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag any `<spec-task>` element that is missing an `id=` attribute or
 * whose `id=` value does not match `^T-[0-9]+$` (e.g. `T-001`, `T-110`).
 * Stable task IDs let proposals, triage cards, and implementation logs
 * reference tasks without ambiguity.
 *
 * Implements FR-010 of specs/002-validate-cli/spec.html.
 */
const TASK_ID_PATTERN = /^T-[0-9]+$/;

export const taskIdRequiredRule: PerFileRule = {
  id: 'task-id-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-task> elements must declare an id= matching ^T-[0-9]+$.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const task of findAll(doc.ast, 'spec-task')) {
      const loc = getLocation(task);
      if (!hasAttr(task, 'id')) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'task-id-required',
          severity: 'error',
          message: '<spec-task> missing required id=',
          fixHint: 'Add id="T-NNN" (e.g. id="T-001").',
        });
        continue;
      }
      const value = getAttr(task, 'id') ?? '';
      if (!TASK_ID_PATTERN.test(value)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'task-id-required',
          severity: 'error',
          message: `<spec-task> id="${value}" does not match ^T-[0-9]+$`,
          fixHint: 'Use the T-NNN format (e.g. id="T-001", id="T-110").',
        });
      }
    }
    return findings;
  },
};
