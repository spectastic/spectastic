import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for `resource-scope-well-formed` (spec 119-decision-resource-scope,
 * FR-002/FR-005/NFR-002, SC-003). Written before the rule exists (tests-first) —
 * failing until the rule lands.
 */

const RULE = 'resource-scope-well-formed';
const FIXTURES = join(__dirname, '..', 'fixtures', 'resource-scope-well-formed');

function findingsFor(file: string) {
  const path = join(FIXTURES, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === RULE);
}

describe('resource-scope-well-formed (positive fixture — malformed declarations)', () => {
  const findings = findingsFor('positive.html');
  const msgs = findings.map((f) => f.message).join('\n');

  it('flags exactly the three malformed declarations, all at error severity', () => {
    expect(findings.length).toBe(3);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });
  it('flags a malformed coordinate (D-201)', () => {
    expect(msgs).toMatch(/D-201/);
    expect(msgs).toMatch(/coordinate/i);
  });
  it('flags an ill-formed owner identity (D-202)', () => {
    expect(msgs).toMatch(/D-202/);
    expect(msgs).toMatch(/owner/i);
  });
  it('flags an owner that disagrees with the coordinate authority (D-203)', () => {
    expect(msgs).toMatch(/D-203/);
    expect(msgs).toMatch(/disagree|authority|owner/i);
  });
});

describe('resource-scope-well-formed (negative fixture — well-formed)', () => {
  it('a well-formed resource scope and a plain path-scoped decision produce no finding', () => {
    expect(findingsFor('negative.html')).toEqual([]);
  });
});
