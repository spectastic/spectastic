import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `state-source-required` (spec 095, FR-002/FR-003/FR-004).
 *
 * Every state records where it came from, because a derived state and an
 * authored one are different claims: one is owed by the contract, the other
 * exists because somebody thought of it. A many-to-one collapse is recorded by
 * `from` carrying more than one value — no third attribute, so it cannot be
 * forgotten separately from the origin (design D-002).
 */

const RULE = 'state-source-required';
const FILE = '/repo/specs/001-a/visual/converter.screen.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (states: string) =>
  validate(doc(`<spec-screen id="s">${states}</spec-screen>`), FILE).filter((f) => f.rule === RULE);

describe('a state that says where it came from', () => {
  it('is silent for a derived state naming one response', () => {
    expect(findingsFor('<spec-state id="ok" source="derived" from="200"><p>r</p></spec-state>')).toEqual([]);
  });

  it('is silent for a RECORDED COLLAPSE — several responses, one state', () => {
    // FR-003's whole point: the collapse is a decision, and recording it is
    // what makes it reviewable rather than indistinguishable from an omission.
    expect(findingsFor('<spec-state id="invalid" source="derived" from="400 404 422"><p>r</p></spec-state>')).toEqual(
      [],
    );
  });

  it('is silent for a state derived from a field rather than a response', () => {
    expect(findingsFor('<spec-state id="stale" source="field" from="Rate.asOf"><p>r</p></spec-state>')).toEqual([]);
  });

  it('is silent for an authored state, which names no origin', () => {
    // FR-004 — derived is a floor, not a ceiling. A state no response implies
    // must be expressible without inventing a fake origin for it.
    expect(findingsFor('<spec-state id="offline" source="authored"><p>r</p></spec-state>')).toEqual([]);
  });
});

describe('a state that does not', () => {
  it('flags a missing source', () => {
    const f = findingsFor('<spec-state id="x"><p>r</p></spec-state>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/source=/);
    expect(f[0]?.severity).toBe('error');
  });

  it('flags an unrecognised source', () => {
    const f = findingsFor('<spec-state id="x" source="guessed"><p>r</p></spec-state>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/guessed/);
  });

  it('flags a derived state with no origin', () => {
    const f = findingsFor('<spec-state id="x" source="derived"><p>r</p></spec-state>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/from=/);
  });

  it('flags an authored state that nonetheless names an origin', () => {
    const f = findingsFor('<spec-state id="x" source="authored" from="200"><p>r</p></spec-state>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/authored/);
  });

  it('reports each offending state once, not the screen once', () => {
    expect(
      findingsFor('<spec-state id="a"><p>r</p></spec-state><spec-state id="b" source="derived"><p>r</p></spec-state>'),
    ).toHaveLength(2);
  });
});

describe('the finding never claims the state set is complete', () => {
  it('says nothing about coverage, because nothing here reads the contract file', () => {
    // Design D-006: readContractDeclarations stops at the declaration. The tool
    // checks that each state says where it came from; it cannot check that no
    // response was forgotten, and must not imply otherwise.
    const all = findingsFor('<spec-state id="x"><p>r</p></spec-state>');
    const text = `${all[0]?.message} ${all[0]?.fixHint}`;
    expect(text).not.toMatch(/\bcomplete\b|\ball responses\b|\bevery response\b/i);
  });
});
