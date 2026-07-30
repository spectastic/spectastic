import { describe, expect, it } from 'vitest';
import { validateMany } from '../src/index.js';

/**
 * verify-view-missing (021-verify-view FR-010): a terminal-state spec bundle at or
 * above the convention floor (the lowest spec that already has a verify.html) must
 * carry a verify.html. The presence sibling to verify-view-stale. From triage 021/T-002.
 */

const spec = (id: string, status: string): string =>
  `<!doctype html><html lang="en"><body><main><header><h1>${id}</h1>
  <spec-meta><b>Status</b><span><spec-status value="${status}">${status}</spec-status></span></spec-meta></header></main></body></html>`;

const verify = (id: string): string =>
  `<!doctype html><html lang="en"><body><main><header><h1>${id} verify</h1></header></main></body></html>`;

function missing(docs: Array<{ file: string; html: string }>) {
  return validateMany(docs).filter((f) => f.rule === 'verify-view-missing');
}

const FLOOR = {
  file: 'specs/021-verify-view/verify.html',
  html: verify('021'),
};
const FLOOR_SPEC = {
  file: 'specs/021-verify-view/spec.html',
  html: spec('021-verify-view', 'accepted'),
};

describe('verify-view-missing (021 FR-010)', () => {
  it('flags a terminal spec at/above the floor with no verify.html', () => {
    const f = missing([
      FLOOR_SPEC,
      FLOOR,
      {
        file: 'specs/032-triage-fanout/spec.html',
        html: spec('032-triage-fanout', 'accepted'),
      },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]!.file).toBe('specs/032-triage-fanout/spec.html');
    expect(f[0]!.message).toMatch(/032/);
  });

  it('exempts a spec below the convention floor (predates verify-view)', () => {
    const f = missing([FLOOR_SPEC, FLOOR, { file: 'specs/010-old/spec.html', html: spec('010-old', 'accepted') }]);
    expect(f).toHaveLength(0);
  });

  it('exempts a non-terminal (Draft) spec — verify.html is a completion artifact', () => {
    const f = missing([FLOOR_SPEC, FLOOR, { file: 'specs/040-wip/spec.html', html: spec('040-wip', 'draft') }]);
    expect(f).toHaveLength(0);
  });

  it('passes when the verify.html is present', () => {
    const f = missing([
      FLOOR_SPEC,
      FLOOR,
      {
        file: 'specs/032-triage-fanout/spec.html',
        html: spec('032-triage-fanout', 'accepted'),
      },
      { file: 'specs/032-triage-fanout/verify.html', html: verify('032') },
    ]);
    expect(f).toHaveLength(0);
  });

  it('is silent when no verify.html exists anywhere (no convention established)', () => {
    const f = missing([
      {
        file: 'specs/032-triage-fanout/spec.html',
        html: spec('032-triage-fanout', 'accepted'),
      },
    ]);
    expect(f).toHaveLength(0);
  });
});
