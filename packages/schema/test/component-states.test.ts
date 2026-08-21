import { describe, expect, it } from 'vitest';
import { EXPECTED_INTERACTION_STATES, readComponentBehaviour, unaccountedStates } from '../src/component-states.js';
import { validate } from '../src/index.js';
import { parse } from '../src/parser.js';

/**
 * A component's interaction states (101-component-interaction-states).
 *
 * The three-way condition is the design under test: every expected state is
 * declared, declined with a reason, or unaccounted for — and only the third
 * reports. A boolean would collapse the second into the first and the blank
 * would stop being a question.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'component-states';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );

const doc = (body: string) => parse(`<!doctype html><html><body><main>${body}</main></body></html>`, FILE);

const allStates = EXPECTED_INTERACTION_STATES.map((s) => `<spec-cstate name="${s}"></spec-cstate>`).join('');
const complete = (extra = '', attrs = 'name="convert-button" origin="authored"') =>
  `<spec-component ${attrs}>${allStates}${extra}</spec-component>`;

describe('reading', () => {
  it('reads states, declines and their reasons', () => {
    const [c] = readComponentBehaviour(
      doc(
        '<spec-component name="b"><spec-cstate name="hover"></spec-cstate><spec-cstate name="loading" declined>It resolves locally and never waits.</spec-cstate></spec-component>',
      ),
    );
    expect(c?.states[0]).toMatchObject({ name: 'hover', declined: false });
    expect(c?.states[1]?.declined).toBe(true);
    expect(c?.states[1]?.reason).toContain('never waits');
  });

  it('treats an absent non-interactive marker as interactive, since most components are', () => {
    const [c] = readComponentBehaviour(doc('<spec-component name="b"></spec-component>'));
    expect(c?.interactive).toBe(true);
  });

  it('counts an expected state as accounted for whether declared or declined', () => {
    const [c] = readComponentBehaviour(
      doc(
        '<spec-component name="b"><spec-cstate name="hover"></spec-cstate><spec-cstate name="loading" declined>x</spec-cstate></spec-component>',
      ),
    );
    const missing = unaccountedStates(c!);
    expect(missing).not.toContain('hover');
    expect(missing).not.toContain('loading');
  });
});

describe('completeness', () => {
  it('is silent when every expected state is accounted for', () => {
    expect(findingsFor(complete())).toEqual([]);
  });

  it('reports one finding per unaccounted state, so they can be answered one at a time', () => {
    const f = findingsFor(
      '<spec-component name="b" origin="authored"><spec-cstate name="resting"></spec-cstate></spec-component>',
    );
    expect(f).toHaveLength(EXPECTED_INTERACTION_STATES.length - 1);
  });

  it('names focus-visible, the one most often missing', () => {
    const f = findingsFor('<spec-component name="b" origin="authored"></spec-component>');
    expect(f.some((x) => x.message.includes('focus-visible'))).toBe(true);
  });

  it('is silent for a non-interactive component rather than expecting nine declines', () => {
    expect(findingsFor('<spec-component name="divider" origin="authored" non-interactive></spec-component>')).toEqual(
      [],
    );
  });

  it('is silent for a consumed component, whose states belong to whoever wrote it', () => {
    expect(findingsFor('<spec-component name="Button" origin="consumed"></spec-component>')).toEqual([]);
  });

  it('is silent on a document declaring no component at all', () => {
    expect(findingsFor('<p>an ordinary screen</p>')).toEqual([]);
  });
});

describe('declines', () => {
  it('is silent for a decline carrying a reason', () => {
    const body = complete().replace(
      '<spec-cstate name="loading"></spec-cstate>',
      '<spec-cstate name="loading" declined>It resolves locally and never waits.</spec-cstate>',
    );
    expect(findingsFor(body)).toEqual([]);
  });

  it('reports a decline with no reason, since that is indistinguishable from a shrug', () => {
    const body = complete().replace(
      '<spec-cstate name="loading"></spec-cstate>',
      '<spec-cstate name="loading" declined></spec-cstate>',
    );
    const f = findingsFor(body);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('without saying why');
  });

  it('reports a decline whose reason is only whitespace, which an attribute could not catch', () => {
    const body = complete().replace(
      '<spec-cstate name="loading"></spec-cstate>',
      '<spec-cstate name="loading" declined>   </spec-cstate>',
    );
    expect(findingsFor(body)).toHaveLength(1);
  });
});

describe('transitions', () => {
  it('is silent between two declared states', () => {
    expect(
      findingsFor(complete('<spec-transition from="resting" to="hover" trigger="pointer enters"></spec-transition>')),
    ).toEqual([]);
  });

  it('reports a transition naming a state the component does not declare', () => {
    const f = findingsFor(complete('<spec-transition from="resting" to="expanded"></spec-transition>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('expanded');
  });

  it('reports a transition missing an end', () => {
    expect(findingsFor(complete('<spec-transition from="resting"></spec-transition>'))).toHaveLength(1);
  });
});
