import { describe, expect, it } from 'vitest';
import { statusDisagreementFindings, type SliceStatus } from '../src/commands/validate.js';

/**
 * REQ-LIFECYCLE-009 (089-lifecycle-contract).
 *
 * The exclusions are the half worth testing. A check that reports the two real
 * disagreements is easy; one that stays quiet where the estate is legitimately
 * uneven is what makes it usable, and getting that wrong would fire on every
 * spec that has ever received a proposal.
 */
const slice = (o: Partial<SliceStatus>): SliceStatus => ({ slice: 's', statuses: {}, ...o });

describe('reports the two decidable disagreements', () => {
  it('warns when a finished slice still reads draft', () => {
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'draft', design: 'draft', tasks: 'draft' }, tasks: { total: 12, unchecked: 0 } }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warning');
    expect(f[0]?.message).toContain('reads draft while all 12 of its tasks are complete');
  });

  it('errors on a split bundle, because REQ-LIFECYCLE-005 forbids one', () => {
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'accepted', design: 'draft', tasks: 'draft' }, tasks: { total: 5, unchecked: 1 } }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.message).toContain('split bundle');
  });
});

describe('stays silent where the estate is legitimately uneven', () => {
  it('does not report an accepted spec carrying unchecked folded tasks', () => {
    // Every apply folds its proposal's tasks in as a fresh phase, so a
    // completed spec routinely holds open work. The symmetric check would
    // fire on every spec that has ever received a proposal.
    const f = statusDisagreementFindings([
      slice({
        statuses: { spec: 'accepted', design: 'accepted', tasks: 'accepted' },
        tasks: { total: 30, unchecked: 8 },
      }),
    ]);
    expect(f).toEqual([]);
  });

  it('does not report an artifact carrying no status element', () => {
    // The meta-spec's execution-only tracker has none; a missing status is
    // not a disagreement with the spec beside it.
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'accepted' }, tasks: { total: 4, unchecked: 1 } }),
    ]);
    expect(f).toEqual([]);
  });

  it('does not report a draft slice with work still open', () => {
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'draft', tasks: 'draft' }, tasks: { total: 9, unchecked: 3 } }),
    ]);
    expect(f).toEqual([]);
  });

  it('does not report a draft slice whose tracker holds no tasks at all', () => {
    // Zero of zero complete is not a finished slice.
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'draft', tasks: 'draft' }, tasks: { total: 0, unchecked: 0 } }),
    ]);
    expect(f).toEqual([]);
  });
});

describe('the superseded exclusion (088/T-001)', () => {
  it('treats a slice whose only open tasks are superseded as finished', () => {
    // The CLI scan subtracts superseded-open boxes before calling this, matching
    // the implement verb's drain and flip count. Counting them would make a spec
    // carrying a retired phase permanently unable to reach zero — and would make
    // the scan disagree with the verb about the same file.
    const f = statusDisagreementFindings([
      slice({ statuses: { spec: 'draft', tasks: 'draft' }, tasks: { total: 20, unchecked: 0 } }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warning');
  });
});
