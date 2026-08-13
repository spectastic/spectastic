import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { RENDER_ELEMENT } from '../visual-vocabulary.js';

/**
 * `render-shape` (spec 099-visual-embedded-view, FR-008).
 *
 * The rule's scope is the point, and it is narrower than it looks. FR-009 says
 * no check may depend on a render being present and an absence must never be
 * reported — so this fires only on a render that is PRESENT and malformed, and
 * never on a screen, a state or a project that has none. A render is evidence
 * a person looks at; the moment its absence reports, it has become a
 * dependency and the baseline-image workflow is back.
 *
 * `src=` is required because a render naming nothing is a claim to evidence
 * with none behind it. `contexts=` is optional — a render with no contexts is
 * evidence of the state it sits in and nothing narrower — but a malformed one
 * is reported, on the same reasoning the grid applies to a recorded
 * combination: a reference to nothing reads as diligence and records nothing.
 *
 * Deliberately does NOT resolve `src=`. Whether the file exists is a
 * filesystem question and this package's rules are pure; and per FR-009 a
 * missing image must not fail a check anyway.
 */

/** A pair is `axis=context` with something on each side of the first `=`. */
function isPair(token: string): boolean {
  const eq = token.indexOf('=');
  return eq > 0 && eq < token.length - 1;
}

export const renderShapeRule: PerFileRule = {
  id: 'render-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'A <spec-render> must name a source, and any contexts it names must be axis=context pairs.',
  check({ doc }) {
    const findings: Finding[] = [];
    const renders = findAll(doc.ast, RENDER_ELEMENT);
    if (renders.length === 0) return findings; // the common case, and it stays free

    for (const render of renders) {
      const loc = getLocation(render);
      const flag = (message: string, fixHint: string): void => {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'render-shape',
          severity: 'error',
          message,
          fixHint,
        });
      };

      const src = getAttr(render, 'src');
      if (src === undefined || src.trim() === '') {
        flag(
          '<spec-render> names no src=',
          'Point src= at the committed image this render is evidence of (spec.html FR-008). An empty src= is a declaration that names nothing, which is not the same as making no declaration.',
        );
      }

      const contexts = getAttr(render, 'contexts');
      if (contexts !== undefined) {
        const tokens = contexts.trim().split(/\s+/).filter((t) => t !== '');
        const bad = tokens.filter((t) => !isPair(t));
        if (tokens.length === 0 || bad.length > 0) {
          flag(
            `<spec-render contexts="${contexts}"> is not a list of axis=context pairs`,
            'Write contexts= as space-separated axis=context pairs — for example contexts="platform=ios mode=dark" (spec.html FR-008) — or drop it, which means the render is evidence of the state it sits in and nothing narrower.',
          );
        }
      }
    }

    return findings;
  },
};
