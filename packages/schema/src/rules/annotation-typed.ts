import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import {
  ANNOTATION_ELEMENT,
  RECOGNISED_ARIA_STATES,
  RECOGNISED_LAYERS,
  ROLES_WITH_STATE,
  impliedLayers,
} from '../visual-vocabulary.js';

/**
 * `annotation-typed` (spec 095, FR-005/FR-007).
 *
 * Two obligations, reported separately.
 *
 * FR-005 — an annotation is typed by the accessibility tree rather than by a
 * vocabulary invented here. The reason is verified rather than assumed: the
 * Playwright installed in this repository ships `toMatchAriaSnapshot` and a
 * `getByRole` taking `checked`/`disabled`/`expanded`, so a declared role and
 * state is already a sentence the test framework reads. A declared annotation
 * is therefore an assertion, not a note.
 *
 * FR-007 — an annotation restating a requirement is rejected and must cite it.
 * A copy is a second thing to drift, and the trace mechanism already aggregates
 * by reference and copies no prose.
 *
 * An annotation with NO accessibility analogue is silent by design: visual
 * emphasis and brand rationale have no counterpart in the tree, and FR-006 is
 * explicit that they stay prose and stay unchecked. The vocabulary must not
 * pretend otherwise, so an untyped annotation is legal.
 *
 * FR-012 (applied change 2026-08-13-annotate-the-element) adds the layer. It is
 * DECLARABLE rather than derived — an earlier draft forbade an authored layer
 * on the reading that a grouping over a type system is read off rather than
 * written down, and that was wrong: 073 FR-003 settles declaration over
 * inference in both directions, and a design-tool import arrives carrying a
 * category its author stated. A vocabulary with no word for it would force the
 * importer to discard that word and re-derive. So a declared layer is kept, and
 * a disagreement with the typing is REPORTED rather than resolved, because
 * neither answer is reliably the right one.
 *
 * FR-011's target is deliberately unchecked. Nothing declares an element
 * inventory for a screen, so the name is provenance — the posture 093 FR-006
 * takes for a design source. It appears nowhere below, which is the point.
 */

/** A requirement identifier appearing in an annotation's own prose. */
const REQUIREMENT_IN_PROSE = /\b(?:FR|NFR|SC|REQ)-[A-Z]*-?\d+\b/;

/** Collect an element's text, so prose can be checked for a restated requirement. */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out;
}

export const annotationTypedRule: PerFileRule = {
  id: 'annotation-typed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-annotation> must be typed by an accessibility role and state where one applies, and must cite a requirement rather than restate it.',
  check({ doc }) {
    const findings: Finding[] = [];
    const annotations = findAll(doc.ast, ANNOTATION_ELEMENT);
    if (annotations.length === 0) return findings;

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'annotation-typed',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const annotation of annotations) {
      const role = getAttr(annotation, 'role');
      const ariaState = getAttr(annotation, 'aria-state');
      const cites = getAttr(annotation, 'cites');
      const layer = getAttr(annotation, 'layer');

      if (ariaState !== undefined && role === undefined) {
        flag(
          annotation,
          '<spec-annotation aria-state="…"> declares a state with no role to carry it',
          'A state is a property of something — add role= naming what this annotation is about (spec.html FR-005), or drop aria-state=.',
        );
      }

      if (
        ariaState !== undefined &&
        role !== undefined &&
        ROLES_WITH_STATE.includes(role) &&
        !RECOGNISED_ARIA_STATES.includes(ariaState)
      ) {
        flag(
          annotation,
          `<spec-annotation aria-state="${ariaState}"> is not a recognised accessibility state`,
          `Use one of ${RECOGNISED_ARIA_STATES.join(', ')} (spec.html FR-005). These are the states a test framework can already query, which is what makes the annotation an assertion rather than a note.`,
        );
      }

      // FR-012 — a declared layer must be one of the recognised ones, and must
      // not contradict what the annotation's own typing already says.
      if (layer !== undefined && layer !== '') {
        if (!RECOGNISED_LAYERS.includes(layer)) {
          flag(
            annotation,
            `<spec-annotation layer="${layer}"> is not a recognised layer`,
            `Use one of ${RECOGNISED_LAYERS.join(', ')} (spec.html FR-012). The layer axis is a grouping over the accessibility type system, not a free-text label.`,
          );
        } else {
          const implied = impliedLayers({ role, ariaState, cites });
          // An empty set permits anything: nothing types this annotation, which
          // is exactly the case for the layers with no accessibility analogue.
          if (implied.size > 0 && !implied.has(layer)) {
            flag(
              annotation,
              `<spec-annotation layer="${layer}"> disagrees with the layer its own typing implies (${[...implied].sort().join(' or ')})`,
              'Either the layer or the typing is wrong, and this is reported rather than resolved because neither is reliably the right one to keep (spec.html FR-012). Correct whichever was the slip.',
            );
          }
        }
      }

      // FR-007 — a restated requirement, rather than a reference to one.
      if (cites === undefined && REQUIREMENT_IN_PROSE.test(textOf(annotation))) {
        const named = REQUIREMENT_IN_PROSE.exec(textOf(annotation))?.[0] ?? '';
        flag(
          annotation,
          `<spec-annotation> restates ${named} in its prose instead of carrying cites="${named}"`,
          `Add cites="${named}" and say what this part of the screen does, not what the requirement says (spec.html FR-007). A copy is a second thing to drift, and the trace already aggregates by reference.`,
        );
      }
    }

    return findings;
  },
};
