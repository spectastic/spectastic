import { findAll, getAttr, getLocation } from '../parser.js';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { Finding, PerFileRule } from '../types.js';

type Element = DefaultTreeAdapterTypes.Element;

/**
 * A superseded task carries a closed box (REQ-CHANGE-010 / REQ-LIFECYCLE-003).
 *
 * The checkbox answers one question — is this task open? — and the mark beside
 * it says how it closed. That only holds if a retired task is actually closed,
 * and the migration that made it true here cannot reach a downstream project
 * whose artifacts were authored under the old rule, which forbade ticking one.
 *
 * Without this, an unclosed retired task reads as ordinary backlog. It is not a
 * cosmetic mismatch: the kernel's own first-unchecked scan admits a
 * `data-status` attribute, so `/spectastic.implement` would pick the task up
 * and build work somebody deliberately retired.
 *
 * Error rather than warning, because the count surfaces now trust the invariant
 * rather than compensating for its absence — a wrong answer here is silent and
 * points toward doing work rather than skipping it.
 */
function isClosed(task: Element): boolean {
  for (const input of findAll(task, 'input')) {
    if ((getAttr(input, 'type') ?? '') !== 'checkbox') continue;
    // `checked` is a boolean attribute: present at all means closed, whatever
    // its position in the tag. An order-sensitive read is the blind spot that
    // has twice produced false counts of owed work in this project.
    if (getAttr(input, 'checked') !== undefined) return true;
  }
  return false;
}

export const supersededTaskClosedRule: PerFileRule = {
  id: 'superseded-task-closed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A task marked superseded carries a closed checkbox — the box says closed, the mark says how (REQ-CHANGE-010).',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const task of findAll(doc.ast, 'spec-task')) {
      if ((getAttr(task, 'data-status') ?? '') !== 'superseded') continue;
      if (isClosed(task)) continue;
      const loc = getLocation(task);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'superseded-task-closed',
        severity: 'error',
        message: `Superseded task ${getAttr(task, 'id') ?? ''} has an open checkbox.`.replace('  ', ' '),
        fixHint:
          'Close the box. A retired task is not owed, so it is closed like any other settled task; the data-status mark is what records that the work was retired rather than performed. Left open, the drain will pick it up and build work that was deliberately retired.',
      });
    }
    return findings;
  },
};
