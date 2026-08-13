import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { readCopyBudgets, readMessageShapes, readRefusals } from '../content-budget.js';
import { BUDGET_ELEMENT, MESSAGE_SHAPE_ELEMENT, REFUSAL_ELEMENT } from '../visual-vocabulary.js';

/**
 * `content-budget-shape` (spec 103-content-budgets).
 *
 * WHAT THIS RULE DOES NOT DO IS THE POINT. It never reads a string a user
 * would see, and FR-003 makes that a requirement rather than a caveat — the
 * copy lives in a localisation system or a draft, and a check that read only
 * what it could reach would report clean while the rest overflowed. That is a
 * false negative which reads as diligence, and a warning beside it does not
 * fix it, because people read the colour.
 *
 * So this checks SHAPE only: a budget carries a number and a unit, a refusal
 * carries a reason, and a message-shape reference resolves within the
 * document. Whether the copy fits is a question this vocabulary declines to
 * answer rather than answers badly.
 */

const RECOGNISED_UNITS = ['characters', 'words'];

export const contentBudgetShapeRule: PerFileRule = {
  id: 'content-budget-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A copy budget must carry a number and a unit, and a refusal must carry a reason. Nothing here is checked against real copy.',
  check({ doc }) {
    const findings: Finding[] = [];
    // The prefilter must include a STATE that references a shape, not only the
    // three declaring elements. A document whose only content-related markup is
    // a dangling message-shape reference is precisely the case worth reporting,
    // and an earlier version of this guard returned before reaching it.
    const referencingStates = findAll(doc.ast, 'spec-state').filter((el) =>
      el.attrs?.some((a) => a.name === 'message-shape'),
    );
    const present =
      findAll(doc.ast, BUDGET_ELEMENT).length +
      findAll(doc.ast, REFUSAL_ELEMENT).length +
      findAll(doc.ast, MESSAGE_SHAPE_ELEMENT).length +
      referencingStates.length;
    if (present === 0) return findings;

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({ file: doc.file, line: at.line, column: at.column, rule: 'content-budget-shape', severity: 'error', message, fixHint });
    };

    for (const b of readCopyBudgets(doc)) {
      const label = b.element === undefined ? '<spec-copy-budget>' : `<spec-copy-budget element="${b.element}">`;
      if (b.element === undefined || b.element.trim() === '') {
        flag(b, '<spec-copy-budget> names no element class', 'Add element= naming the class this constrains — "card title", not one particular card title (spec.html FR-001).');
      }
      if (b.max === undefined || !/^\d+$/.test(b.max.trim())) {
        flag(
          b,
          `${label} carries no number`,
          'Add max= as a whole number (spec.html FR-002). "Short" records an opinion and constrains nothing; a number constrains something.',
        );
      }
      if (b.unit === undefined || !RECOGNISED_UNITS.includes(b.unit.trim())) {
        flag(
          b,
          `${label} carries no recognised unit`,
          `Add unit= as one of ${RECOGNISED_UNITS.join(' or ')} (spec.html FR-002). Characters and words give different answers, and a bare number silently picks one.`,
        );
      }
    }

    for (const r of readRefusals(doc)) {
      if (r.text === undefined || r.text.trim() === '') {
        flag(r, '<spec-refusal> names no string', 'Add text= naming what the product will not ship (spec.html FR-005).');
      }
      if (r.reason === '') {
        flag(
          r,
          `<spec-refusal text="${r.text ?? ''}"> gives no reason`,
          'Give the refusal a reason as the element\'s content (spec.html FR-005). A list without reasons is one somebody deletes the first time it is inconvenient; the reason is what survives a change of team.',
        );
      }
    }

    const shapes = new Set(readMessageShapes(doc).map((s) => s.name).filter((n): n is string => n !== undefined));
    for (const s of readMessageShapes(doc)) {
      if (s.name === undefined || s.name.trim() === '') {
        flag(s, '<spec-message-shape> has no name to be referenced by', 'Add name= (spec.html FR-007).');
      }
      if (s.parts === undefined || s.parts.trim() === '') {
        flag(s, `<spec-message-shape name="${s.name ?? ''}"> declares no parts`, 'Add parts= naming what a message of this shape carries (spec.html FR-007).');
      }
    }
    // A state referencing a shape that is not declared here.
    for (const el of findAll(doc.ast, 'spec-state')) {
      const ref = el.attrs?.find((a) => a.name === 'message-shape')?.value;
      if (ref !== undefined && !shapes.has(ref)) {
        const loc = el.sourceCodeLocation;
        flag(
          { line: loc?.startLine ?? 1, column: loc?.startCol ?? 1 },
          `<spec-state message-shape="${ref}"> references a shape this document does not declare`,
          'Declare the shape, or correct the reference (spec.html FR-007) — a shape restated per screen is a shape that diverges per screen, which is why this is a reference.',
        );
      }
    }

    return findings;
  },
};
