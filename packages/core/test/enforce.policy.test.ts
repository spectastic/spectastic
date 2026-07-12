import { describe, expect, it } from 'vitest';
import { evaluateEnforcement } from '../src/enforce/policy.js';
import type { EnforcementCategory, EnforceWaiver } from '../src/enforce/types.js';

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

// spec 042 FR-004 / FR-011 / FR-012 (2026-07-11-relax-a-requirement): a per-category
// waiver demotes a required-but-uncovered category to an advisory `relaxed` tally —
// but only when active, well-formed, and waivable. Clock is injected (NFR-001).
describe('evaluateEnforcement: FR-011 per-category waivers', () => {
  const NOW = new Date('2026-07-11T00:00:00.000Z');
  const reqEnt: EnforcementCategory[] = ['formatter', 'observability'];
  const waiver = (o: Partial<EnforceWaiver> & { category: EnforcementCategory }): EnforceWaiver => ({
    reason: 'OTLP push exporter; no local /metrics endpoint to detect. OPS-4127.',
    until: '2026-10-01',
    owner: 'me@briancorbin.co.uk',
    ...o,
  });

  it('active, well-formed, waivable waiver → relaxed (not missing); hard gate exits 0', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability' })],
      now: NOW,
    });
    expect(r.relaxed.map((x) => x.category)).toEqual(['observability']);
    expect(r.missing).toEqual([]);
    expect(r.expired).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('expired waiver → auto-blocks (expired + missing); hard gate exits 1', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability', until: '2026-06-01' })],
      now: NOW,
    });
    expect(r.relaxed).toEqual([]);
    expect(r.expired.map((x) => x.category)).toEqual(['observability']);
    expect(r.missing).toEqual(['observability']);
    expect(r.exitCode).toBe(1);
  });

  it('un-relaxable category → waiver inert (stays missing); hard gate exits 1', () => {
    const req: EnforcementCategory[] = ['formatter', 'security'];
    const r = evaluateEnforcement(req, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'security' })],
      unwaivable: ['security', 'supply-chain'],
      now: NOW,
    });
    expect(r.relaxed).toEqual([]);
    expect(r.missing).toEqual(['security']);
    expect(r.exitCode).toBe(1);
  });

  it('boilerplate reason → not relaxed (fail-closed); hard gate exits 1', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability', reason: 'todo' })],
      now: NOW,
    });
    expect(r.relaxed).toEqual([]);
    expect(r.missing).toEqual(['observability']);
    expect(r.exitCode).toBe(1);
  });

  it('until more than 365 days out → not relaxed (fail-closed)', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability', until: '2027-08-01' })],
      now: NOW,
    });
    expect(r.relaxed).toEqual([]);
    expect(r.missing).toEqual(['observability']);
  });

  it('malformed until → not relaxed (fail-closed)', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability', until: 'soon' })],
      now: NOW,
    });
    expect(r.relaxed).toEqual([]);
    expect(r.missing).toEqual(['observability']);
  });

  it('FR-010 undetectable wins over a waiver (the honest state comes first)', () => {
    // observability is structurally undetectable in swift → warned, not relaxed,
    // even though a waiver is present.
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['swift']), {
      waivers: [waiver({ category: 'observability' })],
      now: NOW,
    });
    expect(r.warned).toEqual(['observability']);
    expect(r.relaxed).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('relaxed is never folded into covered', () => {
    const r = evaluateEnforcement(reqEnt, new Set(['formatter']), 'hard', new Set(['js']), {
      waivers: [waiver({ category: 'observability' })],
      now: NOW,
    });
    expect(r.covered).toEqual(['formatter']);
    expect(r.relaxed.map((x) => x.category)).toEqual(['observability']);
  });
});
