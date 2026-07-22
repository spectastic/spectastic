import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for the matrix-winner-integrity rule (spec 050-stack-selection,
 * FR-010 / D-002). Written before the rule exists (T-010), per the plan's
 * guarantee-first, test-first discipline — failing until T-011/T-012 land.
 */

const RULE = 'matrix-winner-integrity';
const FIXTURES = join(__dirname, '..', 'fixtures');

function findingsFor(dir: string, file: string) {
  const path = join(FIXTURES, dir, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === RULE);
}

describe('matrix-winner-integrity', () => {
  it('flags a data-winner row whose Total is strictly below another row\'s', () => {
    const findings = findingsFor('matrix-winner-integrity', 'positive.html');
    const winnerFinding = findings.find((f) => /below another row's/.test(f.message));
    expect(winnerFinding).toBeDefined();
    expect(winnerFinding?.severity).toBe('error');
    expect(winnerFinding?.message).toMatch(/11/);
    expect(winnerFinding?.message).toMatch(/13/);
  });

  it('does not flag a winner that is unambiguously the top score', () => {
    const findings = findingsFor('matrix-winner-integrity', 'negative.html');
    expect(findings).toEqual([]);
  });

  it('allows a winner tied at the top with another row (ties are legal)', () => {
    // Covered by negative.html clean case 2 — asserted via the empty-findings
    // check above; this test documents the specific guarantee (D-002).
    expect(findingsFor('matrix-winner-integrity', 'negative.html')).toEqual([]);
  });

  it('skips a matrix whose scores are non-numeric template placeholders', () => {
    // Covered by negative.html clean case 3 (the `[N]`/`[T]` unfilled template row)
    // — an unfilled template must never false-fire.
    expect(findingsFor('matrix-winner-integrity', 'negative.html')).toEqual([]);
  });

  it('is deterministic given identical input (NFR-001)', () => {
    const path = join(FIXTURES, 'matrix-winner-integrity', 'positive.html');
    const html = readFileSync(path, 'utf8');
    const first = validate(html, path).filter((f) => f.rule === RULE);
    const second = validate(html, path).filter((f) => f.rule === RULE);
    expect(second).toEqual(first);
  });

  it('flags target= that does not resolve to a <spec-decision> in this document (FR-009)', () => {
    const findings = findingsFor('matrix-winner-integrity', 'positive.html');
    const targetFinding = findings.find((f) => /D-999/.test(f.message));
    expect(targetFinding).toBeDefined();
    expect(targetFinding?.severity).toBe('error');
  });

  it('flags exactly two violations in positive.html — one winner-integrity, one target-resolution', () => {
    expect(findingsFor('matrix-winner-integrity', 'positive.html').length).toBe(2);
  });

  it('does not flag a target= that resolves to a <spec-decision> in this document', () => {
    // Covered by negative.html clean case 4 (target="D-001", a matching
    // <spec-decision id="D-001"> present) — asserted via the empty-findings
    // check above; this test documents the specific guarantee (FR-009).
    expect(findingsFor('matrix-winner-integrity', 'negative.html')).toEqual([]);
  });

  it('does not require target= at all — an absent target is not an error', () => {
    // negative.html's clean cases 1-3 carry no target= attribute at all.
    expect(findingsFor('matrix-winner-integrity', 'negative.html')).toEqual([]);
  });
});
