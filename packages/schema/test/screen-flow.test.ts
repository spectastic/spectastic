import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { declaredScreenIds, readScreenFlows } from '../src/screen-flow.js';

/**
 * The journey reader (100-screen-flows).
 *
 * Order-preservation is the contract under test. The order of the steps IS the
 * journey, so a reader that sorted or keyed them would silently destroy the
 * only content the element carries.
 */

const doc = (body: string) => parse(`<!doctype html><html><body><main>${body}</main></body></html>`, 'x.screen.html');

const FLOW = `
<spec-screen id="convert"></spec-screen>
<spec-screen id="pairs"></spec-screen>
<spec-flow id="convert-a-figure">
  <spec-step screen="convert" state="empty"></spec-step>
  <spec-step screen="pairs">
    <spec-branch to="convert">The sheet is dismissed without a choice.</spec-branch>
  </spec-step>
  <spec-step screen="convert" state="converted"></spec-step>
  <spec-step outward>Leaves for the receipt, which another feature owns.</spec-step>
</spec-flow>`;

describe('reading a journey', () => {
  it('returns steps in source order, which is the whole content of a journey', () => {
    const [flow] = readScreenFlows(doc(FLOW));
    expect(flow?.steps.map((s) => s.screen)).toEqual(['convert', 'pairs', 'convert', undefined]);
  });

  it('reads the state a step arrives in, since a route to a screen is under-specified', () => {
    const [flow] = readScreenFlows(doc(FLOW));
    expect(flow?.steps[0]?.state).toBe('empty');
    expect(flow?.steps[2]?.state).toBe('converted');
  });

  it('binds a branch to its step by position, so it cannot disagree with where it sits', () => {
    const [flow] = readScreenFlows(doc(FLOW));
    expect(flow?.steps[1]?.branch?.to).toBe('convert');
    expect(flow?.steps[1]?.branch?.reason).toContain('dismissed');
    expect(flow?.steps[0]?.branch).toBeUndefined();
  });

  it('reads an outward step as declared rather than inferred', () => {
    const [flow] = readScreenFlows(doc(FLOW));
    expect(flow?.steps[3]?.outward).toBe(true);
    expect(flow?.steps[3]?.screen).toBeUndefined();
  });

  it('returns nothing for a document declaring no journey — the common case', () => {
    expect(readScreenFlows(doc('<spec-screen id="convert"></spec-screen>'))).toEqual([]);
  });

  it('reads several journeys, since a screen may appear in more than one', () => {
    const two = `${FLOW}<spec-flow id="second"><spec-step screen="convert"></spec-step></spec-flow>`;
    expect(readScreenFlows(doc(two)).map((f) => f.id)).toEqual(['convert-a-figure', 'second']);
  });
});

describe('declared screens', () => {
  it('collects the ids a step resolves against', () => {
    expect([...declaredScreenIds(doc(FLOW))].sort()).toEqual(['convert', 'pairs']);
  });
});
