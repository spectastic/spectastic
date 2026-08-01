import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for the `contract-declaration-shape` rule (spec
 * 069-design-contract-section, D-005). Written before the rule exists
 * (T-010) — failing until T-012/T-013 land, per the design's test-first
 * discipline.
 *
 * Scope, per D-005: the rule fires only on a PRESENT <spec-contract> that is
 * malformed — a missing or unrecognised shape=, or a non-`none` shape with no
 * path=. It never fires on a document with no <spec-contract> at all, so
 * every one of the sixty-eight pre-existing designs stays silent.
 */

const RULE = 'contract-declaration-shape';
const FIXTURES = join(__dirname, '..', 'fixtures', 'contract-declaration-shape');

function findingsFor(file: string) {
  const path = join(FIXTURES, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === RULE);
}

describe('contract-declaration-shape', () => {
  const findings = findingsFor('positive.html');
  const messages = findings.map((f) => f.message).join('\n');

  it('flags a <spec-contract> missing shape= entirely', () => {
    expect(messages).toMatch(/shape=/);
  });

  it('flags an unrecognised shape= value ("batch-job")', () => {
    expect(messages).toMatch(/batch-job/);
  });

  it('flags a non-none shape with no path=', () => {
    expect(messages).toMatch(/path=/);
  });

  it('treats an empty shape="" the same as a missing shape= — both are "no value provided"', () => {
    // Two distinct "missing shape=" findings (V1's absent attribute and V4's
    // empty string) and exactly one "unrecognised" finding (V2's garbage
    // token) — an empty string is not a token to reject, it's an absence.
    const missing = findings.filter((f) => /missing required shape=/i.test(f.message));
    // Scoped to "recognised shape" specifically — 077-event-schema-evolution's
    // compatibility checks reuse the same "not a recognised …" phrasing, so a
    // bare /not a recognised/i would over-match once that fixture content lands.
    const unrecognised = findings.filter((f) => /not a recognised shape/i.test(f.message));
    expect(missing.length).toBe(2);
    expect(unrecognised.length).toBe(1);
  });

  it('every finding is error severity', () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('flags exactly seven violations — one per malformed <spec-contract> in the fixture', () => {
    // Was four (V1-V4, the original shape= cases) before 077-event-schema-evolution
    // added V5-V7 (the compatibility-stance cases) to this same fixture file.
    expect(findings.length).toBe(7);
  });

  it('carries a fixHint naming the missing/invalid attribute', () => {
    expect(findings.every((f) => typeof f.fixHint === 'string' && f.fixHint.length > 0)).toBe(true);
  });

  it('returns no findings on well-formed <spec-contract> elements', () => {
    expect(findingsFor('negative.html')).toEqual([]);
  });

  it('returns no findings when the document has no <spec-contract> at all', () => {
    const html = '<!doctype html><html><body><main><h1>No contract here</h1></main></body></html>';
    expect(validate(html, 'inline.html').filter((f) => f.rule === RULE)).toEqual([]);
  });
});

/**
 * Compatibility-stance validation (spec 077-event-schema-evolution, design.html D-001).
 * `<spec-contract>` gains two optional attributes recording a producer's compatibility
 * claim: `compatibility=` (backward|forward|full|none) and `compatibility-scope=`
 * (latest|all). Written before the rule is extended (T-200) — failing until T-211 lands.
 *
 * Fixture cases (positive.html): V5 an unrecognised compatibility= value ("eventual"), V6 a
 * compatibility-scope= with no compatibility= (incoherent — the scope question only makes
 * sense once a direction has been claimed), V7 an unrecognised compatibility-scope= value
 * ("oldest"). Fixture cases (negative.html): the pre-existing request-response entry, which
 * legitimately carries neither attribute, and a well-formed event-driven entry pairing a
 * recognised compatibility= with a recognised compatibility-scope=.
 */
describe('compatibility stance validation (077-event-schema-evolution)', () => {
  const positiveFindings = findingsFor('positive.html');
  const positiveMessages = positiveFindings.map((f) => f.message).join('\n');
  const negativeFindings = findingsFor('negative.html');

  it('flags an unrecognised compatibility= value ("eventual")', () => {
    expect(positiveMessages).toMatch(/eventual/);
  });

  it('flags an unrecognised compatibility-scope= value ("oldest")', () => {
    expect(positiveMessages).toMatch(/oldest/);
  });

  it('rejects compatibility-scope= present with no compatibility= as incoherent', () => {
    expect(positiveMessages).toMatch(/incoherent/i);
  });

  it('produces no compatibility-related finding when both attributes are absent (a non-event contract)', () => {
    const compatFindings = negativeFindings.filter((f) => /compatib/i.test(f.message));
    expect(compatFindings).toEqual([]);
  });

  it('produces no finding for a well-formed compatibility= + compatibility-scope= pair', () => {
    // negative.html carries exactly one event-driven entry with both attributes recorded;
    // the fixture is expected to stay entirely finding-free (asserted above too), so a
    // dedicated compatibility-scoped check pins this case specifically.
    const compatFindings = negativeFindings.filter((f) => /compatib/i.test(f.message));
    expect(compatFindings).toEqual([]);
  });
});
