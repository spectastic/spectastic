/**
 * Reading a journey through a feature's screens (spec 100-screen-flows).
 *
 * ORDER-PRESERVING, and that is a contract rather than an implementation
 * detail: the order of the steps *is* the journey, so this must never sort,
 * key or otherwise reorder what it returns. A test asserts it.
 *
 * Pure — no filesystem, no clock, no network. It can be, because everything a
 * journey references lives in the same document: a step names a screen the
 * sidecar declares, or declares that it leaves the feature. That is the whole
 * reason this is a schema rule and the coverage check next door had to become
 * a kernel scan.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr, hasAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { BRANCH_ELEMENT, FLOW_ELEMENT, SCREEN_ELEMENT, STEP_ELEMENT } from './visual-vocabulary.js';

export interface FlowBranch {
  /** Where the journey goes when the step cannot complete. Free text: it may
   *  name a state, a screen, or something outside this feature entirely. */
  to: string | undefined;
  reason: string;
  line: number;
  column: number;
}

export interface FlowStep {
  /** The declared screen this step arrives at. `undefined` on an outward step. */
  screen: string | undefined;
  /** The state it arrives in, when the step is more specific than a screen. */
  state: string | undefined;
  /** True when the step deliberately leaves the feature (FR-006). Declared
   *  rather than inferred from a failed resolution — inferring it would make a
   *  typo and a boundary the same silent outcome. */
  outward: boolean;
  /** `undefined` when the step declares no branch, which means NOT RECORDED. */
  branch: FlowBranch | undefined;
  line: number;
  column: number;
}

export interface ScreenFlow {
  id: string | undefined;
  steps: FlowStep[];
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

/** An element's own text, excluding nested declarations. */
function textOf(el: Element, skip: readonly string[]): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName !== undefined && skip.includes(n.tagName)) return;
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const c of n.childNodes) visit(c);
  };
  visit(el);
  return out.trim();
}

export function readScreenFlows(doc: ParsedDocument | Document): ScreenFlow[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, FLOW_ELEMENT).map((flowEl) => ({
    id: getAttr(flowEl, 'id'),
    steps: findAll(flowEl, STEP_ELEMENT).map((stepEl) => {
      const branchEl = findAll(stepEl, BRANCH_ELEMENT)[0];
      return {
        screen: getAttr(stepEl, 'screen'),
        state: getAttr(stepEl, 'state'),
        outward: hasAttr(stepEl, 'outward'),
        branch: branchEl
          ? { to: getAttr(branchEl, 'to'), reason: textOf(branchEl, []), ...locOf(branchEl) }
          : undefined,
        ...locOf(stepEl),
      };
    }),
    ...locOf(flowEl),
  }));
}

/** Every screen id declared in this document — what a step resolves against. */
export function declaredScreenIds(doc: ParsedDocument | Document): Set<string> {
  const root = 'ast' in doc ? doc.ast : doc;
  const out = new Set<string>();
  for (const el of findAll(root, SCREEN_ELEMENT)) {
    const id = getAttr(el, 'id');
    if (id !== undefined) out.add(id);
  }
  return out;
}
