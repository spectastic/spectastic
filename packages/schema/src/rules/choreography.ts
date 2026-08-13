import { findAll, getAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { readChoreographies } from '../choreography.js';
import { CHOREOGRAPHY_ELEMENT, SCREEN_ELEMENT } from '../visual-vocabulary.js';

/**
 * `choreography-shape` (spec 102-motion-choreography).
 *
 * ONE RULE HERE BREAKS THE FAMILY'S PATTERN ON PURPOSE, and it is written down
 * so a later reader finds the argument rather than the anomaly.
 *
 * Everywhere else, an absent record means NOT RECORDED and reports nothing —
 * 093 FR-012 makes that explicit for coverage, and a sibling was corrected
 * mid-proposal for reading absence as a positive claim. Here, a choreography
 * with no reduced-motion record IS reported. The difference is who is harmed:
 * an unanswered coverage question harms nobody, while a sequence a user cannot
 * escape is a defect for people who get motion sick, and the platform already
 * exposes the preference. Silence is not neutral in the second case.
 *
 * Two things this rule deliberately does not report:
 *
 *  - Two cues sharing an offset. Simultaneity is a choice an author makes, and
 *    reporting it would push them into inventing a one-millisecond difference
 *    to express it.
 *  - A token reference that resolves to nothing. The token file is declared by
 *    the design, not by this vocabulary, and reaching for it would make a
 *    screen only as valid as a path in another artifact.
 */

export const choreographyShapeRule: PerFileRule = {
  id: 'choreography-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A choreography must declare the origin its offsets are measured from, record what it does under reduced motion, and name an element and offset on every cue.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, CHOREOGRAPHY_ELEMENT).length === 0) return findings;

    const screenElements = new Set<string>();
    for (const s of findAll(doc.ast, SCREEN_ELEMENT)) {
      const id = getAttr(s, 'id');
      if (id !== undefined) screenElements.add(id);
    }

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({ file: doc.file, line: at.line, column: at.column, rule: 'choreography-shape', severity: 'error', message, fixHint });
    };

    for (const c of readChoreographies(doc)) {
      const label = c.id === undefined ? '<spec-choreography>' : `<spec-choreography id="${c.id}">`;

      if (c.origin === undefined || c.origin.trim() === '') {
        flag(
          c,
          `${label} declares no origin, so its offsets are numbers rather than times`,
          'Add origin= naming what the offsets are measured from — first paint is the common case, not the definition; a sequence may start when a response arrives or when a control is pressed (spec.html FR-002).',
        );
      }

      if (c.reducedMotion === undefined) {
        flag(
          c,
          `${label} does not record what it does when a user has asked for reduced motion`,
          'Add a reduced-motion record saying what happens — skipped entirely, shortened, or replaced by an instant change (spec.html FR-005). This is the one record this vocabulary requires: an animation a user cannot escape is a defect for people who get motion sick, and the platform already exposes the preference, so silence here is not neutral.',
        );
      }

      for (const cue of c.cues) {
        if (cue.element === undefined || cue.element.trim() === '') {
          flag(cue, `${label} has a cue naming no element`, 'Add element= naming what moves (spec.html FR-003).');
        }
        if (cue.at === undefined || cue.at.trim() === '') {
          flag(
            cue,
            `${label} has a cue with no offset from the origin`,
            'Add at= — the offset from the choreography\'s origin, with its unit (spec.html FR-003). Offsets are from the origin and never from the previous cue, so inserting a cue never moves the ones after it.',
          );
        }
      }
    }

    return findings;
  },
};
