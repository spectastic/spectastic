import { describe, expect, it } from 'vitest';
import { readBundle } from '../src/commands/verify.js';

/**
 * The verify trace still finds `<spec-criterion>` (108-success-criteria,
 * T-200, FR-012).
 *
 * `readBundle`'s `extractScIds` used to scan only `<spec-requirement>`. A
 * criterion is now a distinct element, so the same spec authored with
 * `<spec-criterion id="SC-…">` must produce the SAME scIds a
 * `<spec-requirement id="SC-…">` version would — not an empty trace.
 */

const wrap = (body: string) => `<!doctype html><html><body><main>${body}</main></body></html>`;
const NO_TASKS = '<!doctype html><html><body></body></html>';

describe('readBundle: finds SC ids on <spec-criterion> (108 FR-012)', () => {
  it('lists a criterion-authored SC id, the same way a requirement-authored one is listed', () => {
    const requirementSpec = wrap('<spec-requirement id="SC-001"><p>x</p></spec-requirement>');
    const criterionSpec = wrap('<spec-criterion id="SC-001" actor="reviewer"><p>x</p></spec-criterion>');

    const fromRequirement = readBundle(requirementSpec, NO_TASKS, '999-fixture').scIds;
    const fromCriterion = readBundle(criterionSpec, NO_TASKS, '999-fixture').scIds;

    expect(fromCriterion).toEqual(fromRequirement);
    expect(fromCriterion).toEqual(['SC-001']);
  });

  it('lists both when a spec mixes requirement-authored and criterion-authored SCs', () => {
    const spec = wrap(
      '<spec-requirement id="SC-001"><p>x</p></spec-requirement>' +
        '<spec-criterion id="SC-002" actor="reviewer"><p>x</p></spec-criterion>',
    );
    expect(readBundle(spec, NO_TASKS, '999-fixture').scIds).toEqual(['SC-001', 'SC-002']);
  });
});
