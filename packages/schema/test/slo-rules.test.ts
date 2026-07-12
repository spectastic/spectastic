import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for the two SLO shape rules (spec 047-slo-nfr-artifact, FR-002).
 * Written before the rules exist (T-100/T-101) — failing until T-110/T-111/T-112
 * land, per the plan's D-005 test-first discipline.
 */

const TARGET_RULE = 'slo-target-required';
const WELL_FORMED_RULE = 'slo-well-formed';
const FIXTURES = join(__dirname, '..', 'fixtures');

function findingsFor(rule: string, dir: string, file: string) {
  const path = join(FIXTURES, dir, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === rule);
}

describe('slo-target-required', () => {
  it('flags a <spec-slo> missing target=', () => {
    const findings = findingsFor(TARGET_RULE, 'slo-target-required', 'positive.html');
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toMatch(/target=/);
  });

  it('does not flag a <spec-slo> with target=', () => {
    expect(findingsFor(TARGET_RULE, 'slo-target-required', 'negative.html')).toEqual([]);
  });
});

describe('slo-well-formed', () => {
  const findings = findingsFor(WELL_FORMED_RULE, 'slo-well-formed', 'positive.html');
  const messages = findings.map((f) => f.message).join('\n');

  it('flags a target= that resolves to no NFR in the document', () => {
    expect(messages).toMatch(/NFR-999/);
  });
  it('flags a missing objective=', () => {
    expect(messages).toMatch(/objective/i);
  });
  it('flags a missing window=', () => {
    expect(messages).toMatch(/window/i);
  });
  it('flags a missing budgeting=', () => {
    expect(messages).toMatch(/budgeting/i);
  });
  it('flags empty SLI content', () => {
    expect(messages).toMatch(/SLI|content|empty/i);
  });
  it('flags an unknown signal= value', () => {
    expect(messages).toMatch(/signal|throughput/i);
  });
  it('every finding is error severity', () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });
  it('flags exactly six violations — one per <spec-slo> in the fixture', () => {
    expect(findings.length).toBe(6);
  });

  it('a fully well-formed <spec-slo> is clean', () => {
    expect(findingsFor(WELL_FORMED_RULE, 'slo-well-formed', 'negative.html')).toEqual([]);
  });
});
