import { describe, expect, it } from 'vitest';
import { gatherTrailers, type TrailerInput } from '../src/git/trailers.js';

/**
 * T-103 of specs/027-git-trailers/tasks.html. Unit tests for the pure trailer
 * gatherer (D-004): the human set (Author/Reviewed-by/Co-authored-by/Refs) and
 * omit-when-absent (FR-010).
 */

const base: TrailerInput = {
  meta: {
    owner: 'Brian Corbin · @briancorbinxyz',
    author: null,
    reviewers: null,
  },
  committer: { name: 'Brian Corbin', email: 'b@x' },
};

function keys(input: TrailerInput): string[] {
  return gatherTrailers(input).map((t) => t.key);
}

describe('gatherTrailers — human set (T-103)', () => {
  it('Author from Owner; no Co-authored-by when author is the committer', () => {
    const ts = gatherTrailers(base);
    expect(ts).toEqual([{ key: 'Author', value: 'Brian Corbin · @briancorbinxyz' }]);
  });

  it('Co-authored-by when the artifact author differs from the committer', () => {
    const ts = gatherTrailers({
      meta: { owner: 'Alice Author · @alice', author: null, reviewers: null },
      committer: { name: 'Bob Builder', email: 'bob@x' },
    });
    expect(ts).toContainEqual({
      key: 'Co-authored-by',
      value: 'Alice Author · @alice',
    });
  });

  it('Reviewed-by from a populated Reviewers field; omitted on the em-dash placeholder', () => {
    expect(keys({ ...base, meta: { ...base.meta, reviewers: 'Jane · @jane' } })).toContain('Reviewed-by');
    expect(keys({ ...base, meta: { ...base.meta, reviewers: '—' } })).not.toContain('Reviewed-by');
    expect(keys({ ...base, meta: { ...base.meta, reviewers: '' } })).not.toContain('Reviewed-by');
  });

  it('Refs only when provenance is present', () => {
    expect(keys({ ...base, refs: 'specs/x/changes/archive/y' })).toContain('Refs');
    expect(keys(base)).not.toContain('Refs');
  });

  it('omits everything when the meta is empty (never faked, FR-010)', () => {
    expect(
      gatherTrailers({
        meta: { owner: null, author: null, reviewers: null },
        committer: { name: '', email: '' },
      }),
    ).toEqual([]);
  });

  it('Assisted-by from the model; Acked-by from the dispositioner; the model is never a human trailer', () => {
    const ts = gatherTrailers({
      ...base,
      model: 'stub-model',
      dispositioner: 'Alice · @a',
    });
    expect(ts).toContainEqual({ key: 'Assisted-by', value: 'stub-model' });
    expect(ts).toContainEqual({ key: 'Acked-by', value: 'Alice · @a' });
    // the model only ever appears under Assisted-by (FR-006)
    expect(ts.filter((t) => t.key !== 'Assisted-by').every((t) => !t.value.includes('stub-model'))).toBe(true);
  });

  it('omits Assisted-by / Acked-by when their sources are absent', () => {
    expect(keys(base)).not.toContain('Assisted-by');
    expect(keys(base)).not.toContain('Acked-by');
  });

  // T-900/NFR-001: the gatherer is pure — it takes structured input and does no
  // I/O, so it adds no network cost and is negligible against the git-layer budget.
  // (The only added reads — the artifact + `git config` — are local, by construction.)
  it('gathers trailers with no I/O, in negligible time', () => {
    const full: TrailerInput = {
      meta: { owner: 'O · @o', author: 'A · @a', reviewers: 'R · @r' },
      committer: { name: 'C', email: 'c@x' },
      refs: 'changes/archive/x',
      model: 'stub-model',
      dispositioner: 'D · @d',
    };
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) gatherTrailers(full);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
