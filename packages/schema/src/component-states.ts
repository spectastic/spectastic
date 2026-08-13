/**
 * A component's interaction states (spec 101-component-interaction-states).
 *
 * The expected set is DATA and not a requirement, and that is the load-bearing
 * decision (FR-002, design D-001). It is a judgment about interface convention
 * and it will age. This project has already paid for the alternative: a
 * sibling requirement asserted how many annotation categories lacked an
 * accessibility analogue, a triage card found the transcription wrong in both
 * directions, and the requirement had to be rewritten mid-proposal to stop
 * naming a count. Being wrong here costs one line.
 *
 * Pure — no filesystem, no clock, no network. A component's states live in the
 * same document as the component, so nothing has to be opened to check them.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr, hasAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { COMPONENT_ELEMENT, COMPONENT_STATE_ELEMENT, TRANSITION_ELEMENT } from './visual-vocabulary.js';

/**
 * The interaction states an interactive component is expected to account for.
 *
 * Hand-enumerated, and deliberately the conventional list rather than an
 * exhaustive one: the value is in asking the question, not in the taxonomy.
 * `focus-visible` is here because it is the one most often missing, which is
 * the whole reason a completeness rule earns its keep.
 */
export const EXPECTED_INTERACTION_STATES: readonly string[] = [
  'resting',
  'hover',
  'focus-visible',
  'pressed',
  'disabled',
  'loading',
  'success',
  'error',
  'empty',
];

export interface ComponentState {
  name: string | undefined;
  /** True when the component declares this state does not apply to it. */
  declined: boolean;
  /** A decline's reason, as content — never an attribute, so it cannot be an
   *  empty string that satisfies a presence check. */
  reason: string;
  line: number;
  column: number;
}

export interface ComponentTransition {
  from: string | undefined;
  to: string | undefined;
  /** What carries the component between the two. Free text. */
  on: string | undefined;
  line: number;
  column: number;
}

export interface ComponentBehaviour {
  name: string | undefined;
  origin: string | undefined;
  /** A component that declares it is not interactive is exempt from the
   *  completeness check entirely (FR-008) — failing safe on the antecedent
   *  rather than expecting a divider to decline nine states one at a time. */
  interactive: boolean;
  states: ComponentState[];
  transitions: ComponentTransition[];
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

function reasonOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === TRANSITION_ELEMENT) return;
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const c of n.childNodes) visit(c);
  };
  visit(el);
  return out.trim();
}

export function readComponentBehaviour(doc: ParsedDocument | Document): ComponentBehaviour[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, COMPONENT_ELEMENT).map((el) => ({
    name: getAttr(el, 'name'),
    origin: getAttr(el, 'origin'),
    // Absent means interactive: the overwhelming majority of declared
    // components are controls, and requiring every one of them to say so would
    // be an attribute that is almost always the same value.
    interactive: !hasAttr(el, 'non-interactive'),
    states: findAll(el, COMPONENT_STATE_ELEMENT).map((s) => ({
      name: getAttr(s, 'name'),
      declined: hasAttr(s, 'declined'),
      reason: reasonOf(s),
      ...locOf(s),
    })),
    transitions: findAll(el, TRANSITION_ELEMENT).map((t) => ({
      from: getAttr(t, 'from'),
      to: getAttr(t, 'to'),
      on: getAttr(t, 'on'),
      ...locOf(t),
    })),
    ...locOf(el),
  }));
}

/** The expected states a component neither declares nor declines. */
export function unaccountedStates(c: ComponentBehaviour): string[] {
  const named = new Set(c.states.map((s) => s.name).filter((n): n is string => n !== undefined));
  return EXPECTED_INTERACTION_STATES.filter((s) => !named.has(s));
}
