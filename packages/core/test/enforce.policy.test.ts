import { describe, expect, it } from 'vitest';
import { evaluateEnforcement } from '../src/enforce/policy.js';
import type { EnforcementCategory } from '../src/enforce/types.js';

/** Unit tests for the pure enforcement policy diff (spec 042 T-101, SC-003). */

const req: EnforcementCategory[] = ['formatter', 'linter', 'test-runner'];

describe('evaluateEnforcement: severity → exit code', () => {
  it('hard gate with a gap → exit 1', () => {
    const r = evaluateEnforcement(req, new Set(['formatter']), 'hard');
    expect(r.missing).toEqual(['linter', 'test-runner']);
    expect(r.exitCode).toBe(1);
  });

  it('soft gate with a gap → exit 0 (warn)', () => {
    const r = evaluateEnforcement(req, new Set(['formatter']), 'soft');
    expect(r.missing.length).toBe(2);
    expect(r.exitCode).toBe(0);
  });

  it('none gate → exit 0 regardless', () => {
    expect(evaluateEnforcement(req, new Set(), 'none').exitCode).toBe(0);
  });

  it('hard gate fully covered → exit 0', () => {
    const r = evaluateEnforcement(req, new Set(req), 'hard');
    expect(r.missing).toEqual([]);
    expect(r.exitCode).toBe(0);
  });
});

// spec 042 FR-010 (T-018/coverage-enforce-category change): a required category
// structurally undetectable in every one of the project's ecosystems warns
// instead of hard-failing — the category-level generalisation of the
// stack-level "undetectable → never a false failure" guarantee.
describe('evaluateEnforcement: FR-010 undetectable-category → warn, never a false failure', () => {
  const reqWithCoverage: EnforcementCategory[] = ['formatter', 'coverage'];

  it('Go-only project missing coverage → warned, not missing; hard gate still exits 0', () => {
    const r = evaluateEnforcement(reqWithCoverage, new Set(['formatter']), 'hard', new Set(['go']));
    expect(r.warned).toEqual(['coverage']);
    expect(r.missing).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('JS-only project missing coverage → still a real (missing) gap; hard gate exits 1', () => {
    // coverage IS detectable in js, so an unconfigured coverage in a js project
    // is a genuine gap, not an undetectable one.
    const r = evaluateEnforcement(reqWithCoverage, new Set(['formatter']), 'hard', new Set(['js']));
    expect(r.warned).toEqual([]);
    expect(r.missing).toEqual(['coverage']);
    expect(r.exitCode).toBe(1);
  });

  it('polyglot go+js project missing coverage → missing (detectable in js, even if not go)', () => {
    const r = evaluateEnforcement(reqWithCoverage, new Set(['formatter']), 'hard', new Set(['go', 'js']));
    expect(r.warned).toEqual([]);
    expect(r.missing).toEqual(['coverage']);
    expect(r.exitCode).toBe(1);
  });

  it('no ecosystems supplied (legacy callers) → pre-FR-010 behavior: every gap is missing', () => {
    const r = evaluateEnforcement(reqWithCoverage, new Set(['formatter']), 'hard');
    expect(r.warned).toEqual([]);
    expect(r.missing).toEqual(['coverage']);
    expect(r.exitCode).toBe(1);
  });

  it('a category with a detectable signal is never demoted even if uncovered', () => {
    // formatter has no STRUCTURALLY_UNDETECTABLE entry at all — always a real gap.
    const r = evaluateEnforcement(reqWithCoverage, new Set(['coverage']), 'hard', new Set(['go']));
    expect(r.warned).toEqual([]);
    expect(r.missing).toEqual(['formatter']);
    expect(r.exitCode).toBe(1);
  });

  // observability is the second STRUCTURALLY_UNDETECTABLE user: Swift + C++ have
  // no exporter-manifest convention, so a missing observability there warns.
  it('Swift-only project missing observability → warned, not missing; hard gate exits 0', () => {
    const req: EnforcementCategory[] = ['formatter', 'observability'];
    const r = evaluateEnforcement(req, new Set(['formatter']), 'hard', new Set(['swift']));
    expect(r.warned).toEqual(['observability']);
    expect(r.missing).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('JS project missing observability → a real gap (JS has exporter signals); hard gate exits 1', () => {
    const req: EnforcementCategory[] = ['formatter', 'observability'];
    const r = evaluateEnforcement(req, new Set(['formatter']), 'hard', new Set(['js']));
    expect(r.warned).toEqual([]);
    expect(r.missing).toEqual(['observability']);
    expect(r.exitCode).toBe(1);
  });
});
