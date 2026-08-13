import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { type ComponentBehaviour, readComponentBehaviour, unaccountedStates } from '../component-states.js';
import { COMPONENT_ELEMENT } from '../visual-vocabulary.js';

/**
 * `component-states` (spec 101-component-interaction-states).
 *
 * The completeness rule is the point rather than the state list. Listing what
 * a component has is easy and uninformative; listing what it SHOULD have, with
 * each entry either designed or refused in writing, is what turns a blank into
 * a question.
 *
 * So every expected state is in exactly one of three conditions — declared,
 * declined with a reason, or unaccounted for — and only the third reports.
 *
 * Two exemptions, both failing safe on the antecedent rather than demanding
 * nine individual declines:
 *
 *  - A component declaring itself non-interactive. A divider has no hover
 *    state and saying so nine times is nine lines carrying one fact.
 *  - A CONSUMED component (097 FR-006). Its states belong to whoever wrote it,
 *    and demanding an account would have a project document a library rather
 *    than its own decisions.
 */

function exempt(c: ComponentBehaviour): boolean {
  return !c.interactive || c.origin === 'consumed';
}

export const componentStatesRule: PerFileRule = {
  id: 'component-states',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    "Every interaction state a component is expected to account for must be declared or declined with a reason, and a transition must name states it declares.",
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, COMPONENT_ELEMENT).length === 0) return findings;

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'component-states',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const c of readComponentBehaviour(doc)) {
      const label = c.name === undefined ? '<spec-component>' : `<spec-component name="${c.name}">`;

      // A decline with no reason is indistinguishable from a shrug — the same
      // rule the variant grid applies to a declined context, and the reason is
      // content rather than an attribute so an empty string cannot pass.
      for (const s of c.states) {
        if (s.declined && s.reason === '') {
          flag(
            s,
            `${label} declines the ${s.name ?? 'unnamed'} state without saying why`,
            'Give the decline a reason as the element\'s content (spec.html FR-004). A decline without one is indistinguishable from not having thought about it, and the whole value of recording it is that somebody did.',
          );
        }
        if (s.name === undefined) {
          flag(s, `${label} declares a state with no name`, 'Add name= (spec.html FR-001).');
        }
      }

      // A transition must name states this component declares — the same
      // reference discipline every element in this family uses.
      const declared = new Set(c.states.map((s) => s.name).filter((n): n is string => n !== undefined));
      for (const t of c.transitions) {
        for (const [side, value] of [
          ['from', t.from],
          ['to', t.to],
        ] as const) {
          if (value === undefined) {
            flag(t, `${label} declares a transition with no ${side}=`, 'A transition names both ends (spec.html FR-006).');
            continue;
          }
          if (!declared.has(value)) {
            flag(
              t,
              `${label} has a transition ${side}="${value}", which it does not declare as a state`,
              'A transition must refer to states the component declares (spec.html FR-007) — a reference to nothing reads as behaviour and records none.',
            );
          }
        }
      }

      if (exempt(c)) continue;

      for (const missing of unaccountedStates(c)) {
        flag(
          c,
          `${label} accounts for neither declaring nor declining the ${missing} state`,
          `Declare how ${missing} looks, or decline it with a reason if it does not apply (spec.html FR-003). One finding per state, so they can be answered one at a time rather than read as a list.`,
        );
      }
    }

    return findings;
  },
};
