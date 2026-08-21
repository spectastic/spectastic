import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { subtractionRegisterRequiredRule } from '../src/rules/subtraction-register-required.js';

/**
 * REQ-CHANGE-011 (088-change-management).
 *
 * Presence only. An empty register is a real answer — "this removes nothing" —
 * which is what keeps the check from producing a chrome paragraph in the 44 of
 * 123 proposals in this estate that are ADD-only.
 */
const doc = (body: string) =>
  parse(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, 'p.html');

const PROPOSAL = '<spec-change id="x" status="proposed"><spec-delta op="added" target="FR-001"></spec-delta>';

describe('subtraction-register-required', () => {
  it('reports a change proposal carrying no register', () => {
    const f = subtractionRegisterRequiredRule.check({ doc: doc(`${PROPOSAL}</spec-change>`) });
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no <spec-subtraction> register');
  });

  it('accepts an empty register — that is the answer, not an omission', () => {
    const f = subtractionRegisterRequiredRule.check({
      doc: doc(`${PROPOSAL}<spec-subtraction></spec-subtraction></spec-change>`),
    });
    expect(f).toEqual([]);
  });

  it('accepts a register naming what the change takes away', () => {
    const f = subtractionRegisterRequiredRule.check({
      doc: doc(`${PROPOSAL}<spec-subtraction><ul><li>A clause.</li></ul></spec-subtraction></spec-change>`),
    });
    expect(f).toEqual([]);
  });

  it('is silent on an artifact that is not a change proposal', () => {
    // Only a proposal carries <spec-change>; a spec, a tasks file and a triage
    // log owe nothing here.
    expect(
      subtractionRegisterRequiredRule.check({ doc: doc('<spec-requirement id="FR-001"></spec-requirement>') }),
    ).toEqual([]);
  });
});
