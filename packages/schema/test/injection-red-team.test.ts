import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Adversarial red-team (spec 046-security-review-ci, FR-002).
 *
 * 045 proved the `no-executable-content` rule works on isolated positive/negative
 * pairs. This proves it holds against ONE realistic hostile artifact carrying the
 * full injection battery — the standing discipline that structural "the rule exists"
 * checks are insufficient. It also asserts, explicitly, what the categorical rule
 * does NOT yet catch (the hidden-channel vectors deferred to 045 FR-004), so
 * "the red-team passes" can never be misread as "every channel is closed".
 */

const RULE = 'no-executable-content';
const FIXTURES = join(__dirname, '..', 'fixtures', 'injection-red-team');

function execFindings(file: string) {
  const path = join(FIXTURES, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === RULE);
}

describe('injection red-team: categorical vectors are all BLOCKED (FR-002)', () => {
  const findings = execFindings('attack.html');
  const messages = findings.map((f) => f.message).join('\n');

  // Every categorical vector present in one hostile document is flagged.
  const VECTORS: Array<[string, RegExp]> = [
    ['V1 · inline <script>', /inline.*executable content/i],
    ['V2 · non-sanctioned external <script src>', /steal\.js.*not a sanctioned/i],
    ['V3 · on*= inline event handler', /onerror=/],
    ['V4 · javascript: URI', /javascript: URI/],
    ['V5 · data: URI', /data: URI/],
    ['V6 · <iframe>', /iframe/],
  ];
  for (const [name, pattern] of VECTORS) {
    it(`flags ${name}`, () => {
      expect(messages).toMatch(pattern);
    });
  }

  it('every finding is error severity', () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('flags exactly the six categorical vectors — no more, no less', () => {
    // Exact count is the honest coverage claim: the hidden-channel vectors below
    // add ZERO findings, so any drift (a 7th finding, or a missing one) fails here.
    expect(findings.length).toBe(6);
  });
});

describe('injection red-team: hidden-channel vectors are NOT-yet-blocked — the 045 FR-004 gap (FR-002)', () => {
  const findings = execFindings('attack.html');
  const messages = findings.map((f) => f.message).join('\n');

  // These four channels are invisible to a human but read verbatim by a model.
  // The categorical rule does not inspect them; a future heuristic rule (045 FR-004)
  // would. We assert the gap explicitly so it is recorded, not silently assumed.
  it('H1 · imperative HTML comment is not flagged (FR-004 gap)', () => {
    expect(messages).not.toMatch(/comment/i);
  });
  it('H2 · display:none instruction block is not flagged (FR-004 gap)', () => {
    expect(messages).not.toMatch(/display:none|display: none/i);
  });
  it('H3 · aria-hidden instruction block is not flagged (FR-004 gap)', () => {
    expect(messages).not.toMatch(/aria-hidden/i);
  });
  it('H4 · zero-width Unicode smuggling is not flagged (FR-004 gap)', () => {
    // No finding mentions hidden text or Unicode — the reduced-body sanitizer that
    // would strip these lives in 045 FR-003, not this categorical rule.
    expect(messages).not.toMatch(/unicode|zero-width|hidden text/i);
  });
});

describe('injection red-team: the sanctioned-interactive carve-out survives (FR-002)', () => {
  it('a course-titled variant with an inline gate script is exempt', () => {
    // Same inline <script> the attack fixture is flagged for — but titled "· Course".
    expect(execFindings('course-attack.html')).toEqual([]);
  });
});
