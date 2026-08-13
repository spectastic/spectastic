import { describe, expect, it } from 'vitest';
import { readCopyBudgets, readRefusals } from '../src/content-budget.js';
import { validate } from '../src/index.js';
import { parse } from '../src/parser.js';

/**
 * Copy as a design constraint (103-content-budgets).
 *
 * The most important test here asserts an ABSENCE: nothing ever reads real
 * copy. FR-003 forbids a check rather than requiring one, so an assertion is
 * the only thing standing between it and a later slice adding a partial check
 * and presenting a green result as enforcement.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'content-budget-shape';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );
const doc = (body: string) => parse(`<!doctype html><html><body><main>${body}</main></body></html>`, FILE);

describe('reading', () => {
  it('keeps the number and the unit separate, since one without the other is ambiguous', () => {
    const [b] = readCopyBudgets(doc('<spec-copy-budget element="card title" max="28" unit="characters"></spec-copy-budget>'));
    expect(b).toMatchObject({ element: 'card title', max: '28', unit: 'characters' });
  });

  it('reads a refusal reason as content, so whitespace cannot satisfy it', () => {
    const [r] = readRefusals(doc('<spec-refusal text="oops">   </spec-refusal>'));
    expect(r?.reason).toBe('');
  });
});

describe('the refusal to check real copy', () => {
  it('reports nothing about the prose sitting next to a budget', () => {
    // The rule must not grow an opinion about this string. A partial check
    // reports clean on the copy it can reach while the rest overflows, and a
    // warning beside it does not help — people read the colour.
    const body =
      '<spec-copy-budget element="card title" max="4" unit="characters"></spec-copy-budget>' +
      '<p>A paragraph far longer than four characters, which nothing here measures.</p>';
    expect(findingsFor(body)).toEqual([]);
  });

  it('is silent on a document declaring none of this at all', () => {
    expect(findingsFor('<p>an ordinary screen</p>')).toEqual([]);
  });
});

describe('budgets', () => {
  it('is silent for a number and a recognised unit', () => {
    expect(findingsFor('<spec-copy-budget element="h2" max="40" unit="characters"></spec-copy-budget>')).toEqual([]);
  });

  it('is silent for a language-scoped budget', () => {
    expect(findingsFor('<spec-copy-budget element="h2" max="40" unit="characters" lang="en"></spec-copy-budget>')).toEqual([]);
  });

  it('reports a budget with no number', () => {
    const f = findingsFor('<spec-copy-budget element="h2" max="short" unit="characters"></spec-copy-budget>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no number');
  });

  it('reports a budget with no unit, since characters and words differ', () => {
    expect(findingsFor('<spec-copy-budget element="h2" max="40"></spec-copy-budget>')).toHaveLength(1);
  });

  it('reports a budget naming no element class', () => {
    expect(findingsFor('<spec-copy-budget max="40" unit="words"></spec-copy-budget>')).toHaveLength(1);
  });
});

describe('refusals', () => {
  it('is silent for a refusal with a reason', () => {
    expect(findingsFor('<spec-refusal text="oops">It tells a user nothing and sounds flippant about their problem.</spec-refusal>')).toEqual([]);
  });

  it('is silent for a context-scoped refusal, since a string can be fine elsewhere', () => {
    expect(
      findingsFor('<spec-refusal text="Error" context="anything a user reads">Fine in a log line, useless on screen.</spec-refusal>'),
    ).toEqual([]);
  });

  it('reports a refusal with no reason', () => {
    const f = findingsFor('<spec-refusal text="oops"></spec-refusal>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no reason');
  });
});

describe('message shapes', () => {
  it('is silent for a declared shape referenced by a state', () => {
    const body =
      '<spec-message-shape name="user-error" parts="what happened, what to do, how to get help"></spec-message-shape>' +
      '<spec-screen id="s"><spec-state id="invalid-pair" source="derived" from="400" message-shape="user-error"></spec-state></spec-screen>';
    expect(findingsFor(body)).toEqual([]);
  });

  it('reports a reference to a shape nothing declares', () => {
    const body = '<spec-screen id="s"><spec-state id="a" source="authored" message-shape="ghost"></spec-state></spec-screen>';
    const f = findingsFor(body);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('ghost');
  });
});
