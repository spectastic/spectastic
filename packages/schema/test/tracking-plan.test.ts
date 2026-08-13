import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';
import { parse } from '../src/parser.js';
import { readConsentGates, readTrackingEvents } from '../src/tracking-plan.js';

/**
 * What the interface reports (104-tracking-plan).
 *
 * Two of these assert behaviours that INVERT the family's usual reading, and
 * one asserts a behaviour that must never exist. All three are pinned by test
 * because none of them can be pinned any other way.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'tracking-plan-shape';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );
const doc = (body: string) => parse(`<!doctype html><html><body><main>${body}</main></body></html>`, FILE);

const GATE = '<spec-consent-gate question="Q-01" answer=""></spec-consent-gate>';

describe('reading', () => {
  it('reads an event declared on a control, a state or a screen alike', () => {
    const body =
      '<spec-screen id="s"><spec-event name="screen_seen"></spec-event>' +
      '<spec-state id="a" source="authored"><spec-event name="state_entered"></spec-event>' +
      '<spec-annotation target="convert-button"><spec-event name="rate_converted"></spec-event></spec-annotation>' +
      '</spec-state></spec-screen>';
    expect(readTrackingEvents(doc(body)).map((e) => e.name)).toEqual(['screen_seen', 'state_entered', 'rate_converted']);
  });

  it('marks a field derived from user input, which is what a privacy review turns on', () => {
    const [e] = readTrackingEvents(
      doc('<spec-event name="x"><spec-field name="pair" type="string"></spec-field><spec-field name="amount" type="number" from-user-input></spec-field></spec-event>'),
    );
    expect(e?.fields[0]?.fromUserInput).toBe(false);
    expect(e?.fields[1]?.fromUserInput).toBe(true);
  });

  it('reads an answered gate, including an answer of none', () => {
    const [g] = readConsentGates(doc('<spec-consent-gate question="Q-04" answer="none"></spec-consent-gate>'));
    expect(g?.answer).toBe('none');
  });
});

describe('the two deliberate inversions', () => {
  it('accepts an event with no fields, meaning it carries none', () => {
    // Everywhere else in this family an absence means "not recorded". An empty
    // payload is the safest event there is, and reading it as unrecorded would
    // push an author into inventing a field to look complete.
    expect(findingsFor(`${GATE}<spec-event name="screen_seen"></spec-event>`)).toEqual([]);
  });

  it('treats an answer of none as an answer rather than an absence', () => {
    expect(findingsFor('<spec-consent-gate question="Q-04" answer="none"></spec-consent-gate><spec-event name="x"></spec-event>')).toEqual([]);
  });
});

describe('the forbidden behaviour', () => {
  it('never reports anything that would read a declaration as a shipped event', () => {
    // FR-005 forbids a check rather than requiring one. Nothing in the rule may
    // treat a declared event as evidence of an emission — that would let a spec
    // claim a privacy posture the build does not have.
    const body = `${GATE}<spec-event name="rate_converted"><spec-field name="pair" type="string"></spec-field></spec-event>`;
    const all = validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE);
    expect(all.filter((f) => /ship|emit|fired|sent/i.test(f.message))).toEqual([]);
  });
});

describe('what must report', () => {
  it('reports a field with no type', () => {
    const f = findingsFor(`${GATE}<spec-event name="x"><spec-field name="pair"></spec-field></spec-event>`);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no type');
  });

  it('reports events declared with no consent gate anywhere', () => {
    const f = findingsFor('<spec-event name="x"></spec-event>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no consent question');
  });

  it('reports once per document rather than once per event', () => {
    expect(findingsFor('<spec-event name="a"></spec-event><spec-event name="b"></spec-event>')).toHaveLength(1);
  });

  it('reports an event with no name', () => {
    expect(findingsFor(`${GATE}<spec-event></spec-event>`)).toHaveLength(1);
  });

  it('is silent on a document declaring none of this', () => {
    expect(findingsFor('<p>an ordinary screen</p>')).toEqual([]);
  });
});
