import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for `decision-well-formed` (spec 112-guardrail-decision-record,
 * FR-002/FR-005, SC-001/SC-004). Written before the rule exists (test-first per
 * the design brief's Phase-3 rule) — failing until the rule lands.
 */

const RULE = 'decision-well-formed';
const FIXTURES = join(__dirname, '..', 'fixtures', 'decision-well-formed');

function findingsFor(file: string) {
  const path = join(FIXTURES, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === RULE);
}

describe('decision-well-formed (positive fixture)', () => {
  const findings = findingsFor('positive.html');
  const msgs = findings.map((f) => f.message).join('\n');

  it('every finding is an error', () => {
    expect(findings.length).toBeGreaterThanOrEqual(6);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });
  it('flags an illegal status (D-101)', () => {
    expect(msgs).toMatch(/D-101/);
    expect(msgs).toMatch(/status/i);
  });
  it('flags an illegal posture (D-102)', () => {
    expect(msgs).toMatch(/D-102/);
    expect(msgs).toMatch(/posture/i);
  });
  it('flags an accepted+block decision with no scope path (D-103)', () => {
    expect(msgs).toMatch(/D-103/);
    expect(msgs).toMatch(/scope|path/i);
  });
  it('flags an enforcement that is neither a rule nor a none (D-104)', () => {
    expect(msgs).toMatch(/D-104/);
    expect(msgs).toMatch(/enforcement/i);
  });
  it('flags a none enforcement missing its reason (D-105)', () => {
    expect(msgs).toMatch(/D-105/);
    expect(msgs).toMatch(/reason/i);
  });
  it('flags two overlapping active decisions with no supersedes (D-106 / D-107)', () => {
    expect(msgs).toMatch(/D-106/);
    expect(msgs).toMatch(/D-107/);
    expect(msgs).toMatch(/overlap/i);
  });
});

describe('decision-well-formed (negative fixture)', () => {
  it('reports nothing on well-formed decisions', () => {
    expect(findingsFor('negative.html')).toEqual([]);
  });
});

describe('decision-well-formed (determinism, NFR-002)', () => {
  it('yields identical findings on repeated runs', () => {
    const a = findingsFor('positive.html');
    const b = findingsFor('positive.html');
    expect(a).toEqual(b);
  });
});
