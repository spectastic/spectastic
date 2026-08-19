import { findAll, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * A change proposal carries a subtraction register (REQ-CHANGE-011 of 088).
 *
 * Removal used to be visible only when it was the `op`. The two drop guards
 * compare a post-state against the requirement it targets, so both see a loss
 * only inside a MODIFY; REQ-CHANGE-002's reason-and-migration applies only when
 * a whole requirement goes. A clause lost in a retyped ADD, a sibling
 * contradicted, or a behaviour no requirement records all passed unremarked —
 * three of them in one day, each caught by something other than the process.
 *
 * Only the register's PRESENCE is checked, and that is the whole design. An
 * empty register is a real answer — "this removes nothing" — so the common case
 * needs no editing and produces no chrome; 44 of this estate's 123 proposals
 * are ADD-only and would otherwise have carried a paragraph saying so. Whether
 * an author noticed everything the change takes away is judgment no rule can
 * reach, and a check claiming to reach it would be the false comfort the
 * requirement exists to remove.
 *
 * The carrier is typed rather than prose for the reason REQ-AUTHOR-005's
 * questions register is: the entry count is the answer, and absence of entries
 * is the single unambiguous representation of zero. The first draft of the
 * requirement cited that precedent and then put the obligation on a paragraph,
 * which is what this file's existence corrects.
 */
export const subtractionRegisterRequiredRule: PerFileRule = {
  id: 'subtraction-register-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A change proposal carries a <spec-subtraction> register; an empty one is the answer "removes nothing" (REQ-CHANGE-011).',
  check({ doc }) {
    // Only a change proposal owes one. A proposal is the artifact carrying
    // <spec-change>, which no other artifact in the family does.
    const changes = findAll(doc.ast, 'spec-change');
    if (changes.length === 0) return [];
    if (findAll(doc.ast, 'spec-subtraction').length > 0) return [];

    const first = changes[0];
    const loc = first ? getLocation(first) : { line: 1, column: 1 };
    const findings: Finding[] = [
      {
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'subtraction-register-required',
        severity: 'error',
        message: 'Change proposal carries no <spec-subtraction> register.',
        fixHint:
          'Add a <spec-subtraction> register naming what this change removes, weakens, or makes unreachable — one <li> each. Leave it empty if the answer is nothing; an empty register is the answer, not an omission.',
      },
    ];
    return findings;
  },
};
