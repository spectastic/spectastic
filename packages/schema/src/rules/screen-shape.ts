import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation, walk } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { SCREEN_ELEMENT, STATE_ELEMENT } from '../visual-vocabulary.js';

/**
 * `screen-shape` (spec 095-visual-element-vocabulary, FR-001/FR-008).
 *
 * A screen is a named surface with a stable identifier, and a state belongs to
 * exactly one screen. This rule checks that structural claim and nothing else —
 * what a state SAYS is `state-source-required`'s job, reported separately so a
 * finding names the obligation that was missed rather than "malformed screen".
 *
 * Returns before allocating on a document with no screen and no loose state,
 * which is NFR-002 and also every artifact in the estate today. Reads the
 * parsed document it is handed and never re-parses — a sibling rule was
 * costing 379 parses a run doing exactly that until it was fixed.
 */

export const screenShapeRule: PerFileRule = {
  id: 'screen-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'A <spec-screen> must carry a unique id=, and a <spec-state> must sit inside one.',
  check({ doc }) {
    const findings: Finding[] = [];
    const screens = findAll(doc.ast, SCREEN_ELEMENT);
    const states = findAll(doc.ast, STATE_ELEMENT);
    if (screens.length === 0 && states.length === 0) return findings;

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'screen-shape',
        severity: 'error',
        message,
        fixHint,
      });
    };

    const seen = new Map<string, number>();
    for (const screen of screens) {
      const id = getAttr(screen, 'id');
      if (id === undefined || id === '') {
        flag(
          screen,
          '<spec-screen> is missing required id=',
          'Give the screen a stable identifier (spec.html FR-001). It is a contract: annotations, traces and reviews all reference it, so renaming it later breaks them.',
        );
        continue;
      }
      const previous = seen.get(id);
      if (previous !== undefined) {
        flag(
          screen,
          `<spec-screen id="${id}"> repeats an id already declared at line ${previous}`,
          'Two screens in one artifact must not share an identifier (spec.html FR-001) — a reference to it would be ambiguous.',
        );
        continue;
      }
      seen.set(id, getLocation(screen).line);
    }

    // A state belongs to exactly one screen. Collected by walking each screen's
    // own subtree, so anything left over is loose.
    const owned = new Set<unknown>();
    for (const screen of screens) walk(screen, (el) => owned.add(el));

    for (const state of states) {
      if (!owned.has(state)) {
        flag(
          state,
          '<spec-state> is declared outside any <spec-screen>',
          'Move it inside the screen it belongs to (spec.html FR-001) — a state is a condition of one screen, and a loose one belongs to nothing.',
        );
        continue;
      }
      if (getAttr(state, 'id') === undefined || getAttr(state, 'id') === '') {
        flag(
          state,
          '<spec-state> is missing required id=',
          'Give the state a stable identifier (spec.html FR-001) so an annotation or a test can name the condition it is about.',
        );
      }
    }

    return findings;
  },
};
