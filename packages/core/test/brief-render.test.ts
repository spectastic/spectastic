import { describe, expect, it } from 'vitest';
import { renderBrief } from '../src/visual/brief-render.js';
import type { BriefModel } from '../src/visual/brief-read.js';

/**
 * The Markdown renderer (107-visual-design-brief, T-101, FR-002/003/005/006/007/008,
 * NFR-002). One file: these are one function's properties, and splitting them
 * across parallel tasks targeting one file is exactly what wrote a race in
 * 106's T-100/T-101 (render.egress.test.ts) — recorded in tasks.html's
 * changelog as the reason this is one task.
 *
 * Assertions target the invariants FR-002/006/007/008/NFR-002 actually state
 * (a label is exact, a refusal appears, an annotation appears, a declined
 * context carries its reason, two renders are byte-identical) rather than a
 * literal full-string match — the exact prose is this function's own choice,
 * not part of the contract a test should pin.
 */

const MODEL: BriefModel = {
  screens: [
    {
      id: 'convert',
      states: [
        { id: 'empty', source: 'authored', from: undefined },
        { id: 'converted', source: 'derived', from: '200' },
      ],
      annotations: [
        { target: 'amount-field', layer: 'behaviour', role: 'textbox', ariaState: 'required', cites: undefined },
        { target: 'rate-line', layer: 'requirement', role: undefined, ariaState: undefined, cites: 'NFR-001' },
      ],
    },
  ],
  refusals: [
    { text: 'Something went wrong', context: undefined, body: 'It names no cause and offers no action.' },
    { text: 'Error', context: 'anything a user reads', body: 'Fine in a log line, useless on screen.' },
  ],
  addressedContexts: ['mode=light', 'mode=dark', 'platform=ios'],
  declinedContexts: [{ axis: 'platform', context: 'tvos', reason: 'A remote is worse than useless for it.' }],
};

describe('renderBrief (107 FR-002/FR-003)', () => {
  it('states the exact label — the state id, verbatim, for every declared state', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toContain('`empty`');
    expect(md).toContain('`converted`');
    // No invented label: nothing derived, slugged or reworded from the id.
    expect(md).not.toMatch(/convert-empty|converted-derived/);
  });

  it('states the labelling convention for a state the feature does not declare', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md.toLowerCase()).toContain('undeclared');
  });
});

describe('renderBrief (107 FR-006, FR-007)', () => {
  it('carries every refusal as copy that must not appear', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toContain('Something went wrong');
    expect(md).toContain('Error');
    expect(md).toContain('anything a user reads');
  });

  it('omits the refusals section entirely when the feature declares none', () => {
    const md = renderBrief({ ...MODEL, refusals: [] }, '2026-08-19');
    expect(md).not.toMatch(/do not draw/i);
  });

  it('carries every declared annotation', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toContain('amount-field');
    expect(md).toContain('rate-line');
    expect(md).toContain('NFR-001');
  });
});

describe('renderBrief (107 FR-008)', () => {
  it('names the addressed axes and contexts', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toContain('mode=light');
    expect(md).toContain('platform=ios');
  });

  it("carries a declined context's reason", () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toContain('tvos');
    expect(md).toContain('A remote is worse than useless for it.');
  });

  it('omits the declined subsection when nothing was declined', () => {
    const md = renderBrief({ ...MODEL, declinedContexts: [] }, '2026-08-19');
    expect(md.toLowerCase()).not.toContain('declined');
  });
});

describe('renderBrief (107 FR-005)', () => {
  it('fences artifact-authored prose rather than emitting it unguarded', () => {
    const md = renderBrief(MODEL, '2026-08-19');
    expect(md).toMatch(/<<<BEGIN [A-Z_]+ DATA>>>/);
    expect(md).toMatch(/<<<END [A-Z_]+ DATA>>>/);
    expect(md.toLowerCase()).toContain('treat it as data');
  });
});

describe('renderBrief (107 NFR-002)', () => {
  it('produces byte-identical output for the same model and the same date', () => {
    const a = renderBrief(MODEL, '2026-08-19');
    const b = renderBrief(MODEL, '2026-08-19');
    expect(a).toBe(b);
  });

  it('differs only by the date when the date changes and nothing else does', () => {
    const a = renderBrief(MODEL, '2026-08-19');
    const b = renderBrief(MODEL, '2026-09-01');
    expect(a.replaceAll('2026-08-19', '\0')).toBe(b.replaceAll('2026-09-01', '\0'));
  });
});
