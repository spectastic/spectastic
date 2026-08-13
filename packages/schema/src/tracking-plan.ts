/**
 * What the interface reports (spec 104-tracking-plan).
 *
 * Pure, and it emits nothing. That is not incidental — FR-005 forbids any
 * check from reading a declaration as evidence that an event ships, because a
 * plan authored at design time is a decision and treating it as a shipped
 * event would let a spec assert a privacy posture the build does not have.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr, hasAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { CONSENT_GATE_ELEMENT, EVENT_ELEMENT, FIELD_ELEMENT } from './visual-vocabulary.js';

export interface TrackingField {
  name: string | undefined;
  /** Required. "Carries the pair" is prose; a named field with a type is
   *  something a privacy reviewer can answer yes or no to. */
  type: string | undefined;
  /** The distinction a privacy review turns on: a currency pair is a choice
   *  from a fixed list, an amount is something a person typed, and the two are
   *  not the same risk even when both are numbers. */
  fromUserInput: boolean;
  line: number;
  column: number;
}

export interface TrackingEvent {
  name: string | undefined;
  /** True when the event already ships, so a plan written after the fact does
   *  not read as a proposal. */
  shipping: boolean;
  /** An EMPTY list means the event carries no payload — a positive claim, and
   *  the one place this family reads absence that way (design D-002). */
  fields: TrackingField[];
  line: number;
  column: number;
}

export interface ConsentGate {
  /** The question that must be answered before anything ships. */
  question: string | undefined;
  /** The answer, when there is one. `none` is an ANSWER — a project that
   *  decided to collect nothing has decided — and must not read as unanswered. */
  answer: string | undefined;
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

export function readTrackingEvents(doc: ParsedDocument | Document): TrackingEvent[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, EVENT_ELEMENT).map((el) => ({
    name: getAttr(el, 'name'),
    shipping: hasAttr(el, 'shipping'),
    fields: findAll(el, FIELD_ELEMENT).map((f) => ({
      name: getAttr(f, 'name'),
      type: getAttr(f, 'type'),
      fromUserInput: hasAttr(f, 'from-user-input'),
      ...locOf(f),
    })),
    ...locOf(el),
  }));
}

export function readConsentGates(doc: ParsedDocument | Document): ConsentGate[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, CONSENT_GATE_ELEMENT).map((el) => ({
    question: getAttr(el, 'question'),
    answer: getAttr(el, 'answer'),
    ...locOf(el),
  }));
}
