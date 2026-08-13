/**
 * Motion as a sequence (spec 102-motion-choreography).
 *
 * ORDER-PRESERVING and pure. The order of the cues is the choreography, so
 * this never sorts or keys them — a test asserts it, because that is a
 * contract rather than an implementation detail.
 *
 * Offsets are read verbatim and never arithmetic is done on them here. They
 * are measured from the choreography's declared origin (design D-001), so a
 * reader compares two numbers rather than accumulating a column, and inserting
 * a cue cannot silently move the ones after it.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { CHOREOGRAPHY_ELEMENT, CHOREO_STEP_ELEMENT, REDUCED_MOTION_ELEMENT } from './visual-vocabulary.js';

export interface Cue {
  /** The element that moves. Free text: it names something in the build. */
  element: string | undefined;
  /** Offset from the choreography's origin, as authored — including its unit,
   *  because a bare number is ambiguous and the render shows what was written. */
  at: string | undefined;
  /** Either a token reference or a raw value. Never resolved (design D-003). */
  duration: string | undefined;
  easing: string | undefined;
  line: number;
  column: number;
}

export interface Choreography {
  id: string | undefined;
  /** What the offsets are measured from. First paint is the common case and
   *  not the definition — a sequence may start when a response arrives. */
  origin: string | undefined;
  cues: Cue[];
  /** What the sequence does when the user has asked for less motion. The one
   *  REQUIRED record in this family (FR-005) — an animation a user cannot
   *  escape harms a specific group of people, so silence here is not neutral
   *  the way silence about coverage is. */
  reducedMotion: string | undefined;
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

function textOf(el: Element): string {
  let out = '';
  const visit = (n: unknown): void => {
    const x = n as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (x.tagName === undefined && typeof x.value === 'string') out += x.value;
    if (x.childNodes) for (const c of x.childNodes) visit(c);
  };
  visit(el);
  return out.trim();
}

export function readChoreographies(doc: ParsedDocument | Document): Choreography[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, CHOREOGRAPHY_ELEMENT).map((el) => {
    const rm = findAll(el, REDUCED_MOTION_ELEMENT)[0];
    return {
      id: getAttr(el, 'id'),
      origin: getAttr(el, 'origin'),
      cues: findAll(el, CHOREO_STEP_ELEMENT).map((c) => ({
        element: getAttr(c, 'element'),
        at: getAttr(c, 'at'),
        duration: getAttr(c, 'duration'),
        easing: getAttr(c, 'easing'),
        ...locOf(c),
      })),
      // An empty record is NOT a record: the reason is content rather than an
      // attribute so an empty string cannot satisfy the requirement.
      reducedMotion: rm === undefined ? undefined : textOf(rm) === '' ? undefined : textOf(rm),
      ...locOf(el),
    };
  });
}
